import {
  createTransaction as createSchema,
  csvImportRequest,
  csvImportResult,
  transaction,
  transactionPage,
  transactionQuery,
  updateTransaction as updateSchema,
  uuid,
} from '@mm/validation';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { toTransactionDto } from '../../lib/mappers.js';
import { allTransactionsForExport, findTransaction, listTransactions } from './repository.js';
import {
  createTransaction,
  deleteTransaction,
  exportCsv,
  importCsv,
  updateTransaction,
} from './service.js';

const idParams = z.object({ id: uuid });

export const transactionsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Search and filter transactions (keyset paginated, newest first)',
        querystring: transactionQuery,
        response: { 200: transactionPage },
      },
    },
    async (request) => {
      const page = await listTransactions(app.db, request.auth.userId, request.query);
      return { ...page, items: page.items.map(toTransactionDto) };
    },
  );

  app.post(
    '/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Create a transaction (idempotent on the client-generated id)',
        description:
          'Returns 201 when created and 200 when a transaction with the same id already exists. Set scheduledEventId (+ occurrenceDate) to convert a planned item into an actual transaction.',
        body: createSchema,
        response: { 200: transaction, 201: transaction },
      },
    },
    async (request, reply) => {
      const { row, created } = await createTransaction(app.db, request.auth.userId, request.body);
      return reply.status(created ? 201 : 200).send(toTransactionDto(row));
    },
  );

  app.get(
    '/transactions/export.csv',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Export transactions as CSV (same filters as the list)',
        querystring: transactionQuery.omit({ cursor: true, limit: true }),
      },
    },
    async (request, reply) => {
      const rows = await allTransactionsForExport(app.db, request.auth.userId, request.query);
      const csv = await exportCsv(app.db, request.auth.userId, rows);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="moneymoney-transactions.csv"')
        .send(csv);
    },
  );

  app.post(
    '/transactions/import',
    {
      bodyLimit: 6 * 1024 * 1024,
      schema: {
        tags: ['transactions'],
        summary:
          'Import transactions from CSV (dry run by default; duplicates skipped on re-import)',
        body: csvImportRequest,
        response: { 200: csvImportResult },
      },
    },
    async (request) => importCsv(app.db, request.auth.userId, request.body),
  );

  app.get(
    '/transactions/:id',
    { schema: { tags: ['transactions'], params: idParams, response: { 200: transaction } } },
    async (request) => {
      const row = await findTransaction(app.db, request.auth.userId, request.params.id);
      if (!row || row.deletedAt) throw notFound('Transaction');
      return toTransactionDto(row);
    },
  );

  app.patch(
    '/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        params: idParams,
        body: updateSchema,
        response: { 200: transaction },
      },
    },
    async (request) =>
      toTransactionDto(
        await updateTransaction(app.db, request.auth.userId, request.params.id, request.body),
      ),
  );

  app.delete(
    '/transactions/:id',
    { schema: { tags: ['transactions'], params: idParams, response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteTransaction(app.db, request.auth.userId, request.params.id);
      return reply.status(204).send(null);
    },
  );
};
