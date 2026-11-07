import { occurrenceOverrides } from '@mm/database';
import { diffDays } from '@mm/finance-engine';
import {
  createScheduledEvent,
  markOccurrencePaid,
  occurrence,
  occurrenceOverride,
  occurrenceQuery,
  postponeOccurrence,
  scheduledEvent,
  skipOccurrence,
  splitEvent,
  transaction,
  updateScheduledEvent,
  uuid,
} from '@mm/validation';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { toEventDto, toOccurrenceDto, toOverrideDto, toTransactionDto } from '../../lib/mappers.js';
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  markPaid,
  occurrencesBetween,
  postpone,
  skip,
  split,
  updateEvent,
} from './service.js';

const idParams = z.object({ id: uuid });
const tags = ['planner'];

export const scheduledEventsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/scheduled-events',
    {
      schema: {
        tags,
        summary: 'List planned income and expenses',
        response: { 200: z.array(scheduledEvent) },
      },
    },
    async (request) => (await listEvents(app.db, request.auth.userId)).map(toEventDto),
  );

  app.post(
    '/scheduled-events',
    {
      schema: {
        tags,
        summary: 'Plan a future expense, bill, salary or contract income',
        description: 'Planned items change projections only; they never alter actual balances.',
        body: createScheduledEvent,
        response: { 201: scheduledEvent },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(toEventDto(await createEvent(app.db, request.auth.userId, request.body))),
  );

  app.get(
    '/scheduled-events/occurrences',
    {
      schema: {
        tags,
        summary: 'Dated occurrences in a range (calendar/timeline), including paid and skipped',
        querystring: occurrenceQuery,
        response: { 200: z.array(occurrence) },
      },
    },
    async (request) => {
      const { from, to } = request.query;
      if (to < from || diffDays(from, to) > 800)
        throw badRequest('Use a range of at most 800 days');
      return (await occurrencesBetween(app.db, request.auth.userId, from, to)).map(toOccurrenceDto);
    },
  );

  app.get(
    '/scheduled-events/:id',
    {
      schema: {
        tags,
        params: idParams,
        response: { 200: scheduledEvent.extend({ overrides: z.array(occurrenceOverride) }) },
      },
    },
    async (request) => {
      const row = await getEvent(app.db, request.auth.userId, request.params.id);
      const overrides = await app.db
        .select()
        .from(occurrenceOverrides)
        .where(
          and(
            eq(occurrenceOverrides.eventId, row.id),
            eq(occurrenceOverrides.userId, request.auth.userId),
          ),
        );
      return { ...toEventDto(row), overrides: overrides.map(toOverrideDto) };
    },
  );

  app.patch(
    '/scheduled-events/:id',
    {
      schema: {
        tags,
        params: idParams,
        body: updateScheduledEvent,
        response: { 200: scheduledEvent },
      },
    },
    async (request) =>
      toEventDto(await updateEvent(app.db, request.auth.userId, request.params.id, request.body)),
  );

  app.delete(
    '/scheduled-events/:id',
    { schema: { tags, params: idParams, response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteEvent(app.db, request.auth.userId, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/scheduled-events/:id/postpone',
    {
      schema: {
        tags,
        summary: 'Move an occurrence to a later (or earlier) date',
        params: idParams,
        body: postponeOccurrence,
        response: { 200: scheduledEvent },
      },
    },
    async (request) =>
      toEventDto(
        await postpone(
          app.db,
          request.auth.userId,
          request.params.id,
          request.body.occurrenceDate,
          request.body.newDate,
        ),
      ),
  );

  app.post(
    '/scheduled-events/:id/skip',
    {
      schema: {
        tags,
        summary: 'Skip one occurrence (cancels a one-off)',
        params: idParams,
        body: skipOccurrence,
        response: { 200: scheduledEvent },
      },
    },
    async (request) =>
      toEventDto(
        await skip(app.db, request.auth.userId, request.params.id, request.body.occurrenceDate),
      ),
  );

  app.post(
    '/scheduled-events/:id/cancel',
    { schema: { tags, params: idParams, response: { 200: scheduledEvent } } },
    async (request) =>
      toEventDto(
        await updateEvent(app.db, request.auth.userId, request.params.id, { status: 'cancelled' }),
      ),
  );

  app.post(
    '/scheduled-events/:id/split',
    {
      schema: {
        tags,
        summary: 'Split part of a one-off item onto another date',
        params: idParams,
        body: splitEvent,
        response: { 200: z.object({ original: scheduledEvent, created: scheduledEvent }) },
      },
    },
    async (request) => {
      const { original, created } = await split(
        app.db,
        request.auth.userId,
        request.params.id,
        request.body,
      );
      return { original: toEventDto(original), created: toEventDto(created) };
    },
  );

  app.post(
    '/scheduled-events/:id/mark-paid',
    {
      schema: {
        tags,
        summary: 'Convert an occurrence into an actual transaction (no double counting)',
        params: idParams,
        body: markOccurrencePaid,
        response: { 200: transaction, 201: transaction },
      },
    },
    async (request, reply) => {
      const { row, created } = await markPaid(
        app.db,
        request.auth.userId,
        request.params.id,
        request.body,
      );
      return reply.status(created ? 201 : 200).send(toTransactionDto(row));
    },
  );
};
