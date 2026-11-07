import { goalAllocations, goals } from '@mm/database';
import { projectGoal, todayInTimeZone } from '@mm/finance-engine';
import {
  createGoal,
  createGoalAllocation,
  goal,
  goalAllocation,
  updateGoal,
  uuid,
} from '@mm/validation';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { toAllocationDto, toGoalDto } from '../../lib/mappers.js';
import { getSettings } from '../settings/repository.js';
import type { Database } from '@mm/database';

const idParams = z.object({ id: uuid });
const tags = ['goals'];

async function goalWithProjection(db: Database, userId: string, row: typeof goals.$inferSelect) {
  const [sum] = await db
    .select({ total: sql<string>`coalesce(sum(${goalAllocations.amount}), 0)` })
    .from(goalAllocations)
    .where(and(eq(goalAllocations.goalId, row.id), eq(goalAllocations.userId, userId)));
  const current = Number(sum?.total ?? 0);
  const settings = await getSettings(db, userId);
  const projection = projectGoal(
    {
      target: row.targetAmount,
      current,
      targetDate: row.targetDate,
      monthlyContribution: row.monthlyContribution,
    },
    todayInTimeZone(settings.timezone),
  );
  return toGoalDto(row, current, projection);
}

async function findGoal(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row) throw notFound('Goal');
  return row;
}

export const goalsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/goals',
    {
      schema: {
        tags,
        summary: 'Savings goals with progress and projected completion',
        response: { 200: z.array(goal) },
      },
    },
    async (request) => {
      const { userId } = request.auth;
      const rows = await app.db
        .select()
        .from(goals)
        .where(eq(goals.userId, userId))
        .orderBy(goals.createdAt);
      return Promise.all(rows.map((r) => goalWithProjection(app.db, userId, r)));
    },
  );

  app.post(
    '/goals',
    { schema: { tags, body: createGoal, response: { 201: goal } } },
    async (request, reply) => {
      const { userId } = request.auth;
      const { id, initialAmount, ...rest } = request.body;
      const settings = await getSettings(app.db, userId);
      const row = await app.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(goals)
          .values({
            ...(id ? { id } : {}),
            ...rest,
            targetDate: rest.targetDate ?? null,
            monthlyContribution: rest.monthlyContribution ?? null,
            accountId: rest.accountId ?? null,
            userId,
          })
          .returning();
        if (initialAmount && initialAmount > 0) {
          await tx.insert(goalAllocations).values({
            userId,
            goalId: created!.id,
            amount: initialAmount,
            allocatedOn: todayInTimeZone(settings.timezone),
            note: 'Starting balance',
          });
        }
        return created!;
      });
      return reply.status(201).send(await goalWithProjection(app.db, userId, row));
    },
  );

  app.patch(
    '/goals/:id',
    { schema: { tags, params: idParams, body: updateGoal, response: { 200: goal } } },
    async (request) => {
      const { archived, ...rest } = request.body;
      const [row] = await app.db
        .update(goals)
        .set({
          ...rest,
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
          updatedAt: new Date(),
        })
        .where(and(eq(goals.id, request.params.id), eq(goals.userId, request.auth.userId)))
        .returning();
      if (!row) throw notFound('Goal');
      return goalWithProjection(app.db, request.auth.userId, row);
    },
  );

  app.delete(
    '/goals/:id',
    { schema: { tags, params: idParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const deleted = await app.db
        .delete(goals)
        .where(and(eq(goals.id, request.params.id), eq(goals.userId, request.auth.userId)))
        .returning({ id: goals.id });
      if (!deleted.length) throw notFound('Goal');
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/goals/:id/allocations',
    { schema: { tags, params: idParams, response: { 200: z.array(goalAllocation) } } },
    async (request) => {
      await findGoal(app.db, request.auth.userId, request.params.id);
      const rows = await app.db
        .select()
        .from(goalAllocations)
        .where(
          and(
            eq(goalAllocations.goalId, request.params.id),
            eq(goalAllocations.userId, request.auth.userId),
          ),
        )
        .orderBy(desc(goalAllocations.allocatedOn), desc(goalAllocations.createdAt));
      return rows.map(toAllocationDto);
    },
  );

  app.post(
    '/goals/:id/allocations',
    {
      schema: {
        tags,
        summary: 'Allocate (or withdraw, with a negative amount) money towards a goal',
        description:
          'Allocations earmark money you already own; they are not expenses and do not change balances.',
        params: idParams,
        body: createGoalAllocation,
        response: { 200: goalAllocation, 201: goalAllocation },
      },
    },
    async (request, reply) => {
      const { userId } = request.auth;
      await findGoal(app.db, userId, request.params.id);
      const { id, ...rest } = request.body;
      const [row] = await app.db
        .insert(goalAllocations)
        .values({
          ...(id ? { id } : {}),
          ...rest,
          note: rest.note ?? null,
          goalId: request.params.id,
          userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await app.db
          .select()
          .from(goalAllocations)
          .where(and(eq(goalAllocations.id, id!), eq(goalAllocations.userId, userId)));
        if (!existing) throw notFound('Allocation');
        return reply.status(200).send(toAllocationDto(existing));
      }
      return reply.status(201).send(toAllocationDto(row));
    },
  );

  app.delete(
    '/goals/:id/allocations/:allocationId',
    {
      schema: {
        tags,
        params: idParams.extend({ allocationId: uuid }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const deleted = await app.db
        .delete(goalAllocations)
        .where(
          and(
            eq(goalAllocations.id, request.params.allocationId),
            eq(goalAllocations.goalId, request.params.id),
            eq(goalAllocations.userId, request.auth.userId),
          ),
        )
        .returning({ id: goalAllocations.id });
      if (!deleted.length) throw notFound('Allocation');
      return reply.status(204).send(null);
    },
  );
};
