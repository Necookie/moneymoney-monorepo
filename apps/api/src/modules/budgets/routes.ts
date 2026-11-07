import { budgets } from '@mm/database';
import { budgetStatus, cashFlow, endOfMonth, spendingByCategory } from '@mm/finance-engine';
import { budget, budgetQuery, createBudget, updateBudget, uuid, type Budget } from '@mm/validation';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import type { BudgetRow } from '../../lib/mappers.js';
import { loadSnapshot, type Snapshot } from '../../lib/snapshot.js';

const idParams = z.object({ id: uuid });
const tags = ['budgets'];

function toBudgetDto(row: BudgetRow, snap: Snapshot, month: string): Budget {
  const periodStart = `${month}-01`;
  const periodEnd = endOfMonth(periodStart);
  const spentByCat = spendingByCategory(snap.engineTxs, periodStart, periodEnd);
  const spent =
    row.categoryId === null
      ? cashFlow(snap.engineTxs, periodStart, periodEnd).netSpending
      : (spentByCat.get(row.categoryId) ?? 0);
  // For past months "today" is the period end; for future months nothing has elapsed.
  const today =
    snap.today < periodStart ? periodStart : snap.today > periodEnd ? periodEnd : snap.today;
  const s = budgetStatus({ limit: row.amount, spent, periodStart, periodEnd, today });
  return {
    id: row.id,
    categoryId: row.categoryId,
    amount: row.amount,
    isDemo: row.isDemo,
    status: {
      spent: s.spent,
      remaining: s.remaining,
      utilizationBps: s.utilizationBps,
      projectedSpend: s.projectedSpend,
      dailyAllowance: s.dailyAllowance,
      remainingDays: s.remainingDays,
      state: s.state,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const budgetsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/budgets',
    {
      schema: {
        tags,
        summary: 'Monthly budgets with utilisation and spending pace',
        querystring: budgetQuery,
        response: { 200: z.array(budget) },
      },
    },
    async (request) => {
      const snap = await loadSnapshot(app.db, request.auth.userId);
      const month = request.query.month ?? snap.month.key;
      return snap.budgetRows.map((b) => toBudgetDto(b, snap, month));
    },
  );

  app.post(
    '/budgets',
    { schema: { tags, body: createBudget, response: { 201: budget } } },
    async (request, reply) => {
      const { id, ...rest } = request.body;
      const [row] = await app.db
        .insert(budgets)
        .values({ ...(id ? { id } : {}), ...rest, userId: request.auth.userId })
        .returning();
      const snap = await loadSnapshot(app.db, request.auth.userId);
      return reply.status(201).send(toBudgetDto(row!, snap, snap.month.key));
    },
  );

  app.patch(
    '/budgets/:id',
    { schema: { tags, params: idParams, body: updateBudget, response: { 200: budget } } },
    async (request) => {
      const [row] = await app.db
        .update(budgets)
        .set({ amount: request.body.amount, updatedAt: new Date() })
        .where(and(eq(budgets.id, request.params.id), eq(budgets.userId, request.auth.userId)))
        .returning();
      if (!row) throw notFound('Budget');
      const snap = await loadSnapshot(app.db, request.auth.userId);
      return toBudgetDto(row, snap, snap.month.key);
    },
  );

  app.delete(
    '/budgets/:id',
    { schema: { tags, params: idParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const deleted = await app.db
        .delete(budgets)
        .where(and(eq(budgets.id, request.params.id), eq(budgets.userId, request.auth.userId)))
        .returning({ id: budgets.id });
      if (!deleted.length) throw notFound('Budget');
      return reply.status(204).send(null);
    },
  );
};
