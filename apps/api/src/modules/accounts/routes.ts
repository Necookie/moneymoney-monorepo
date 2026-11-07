import { account, createAccount, updateAccount, uuid } from '@mm/validation';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { toAccountDto } from '../../lib/mappers.js';
import {
  accountInUse,
  currentBalances,
  deleteAccount,
  getAccount,
  insertAccount,
  listAccounts,
  patchAccount,
} from './repository.js';

const idParams = z.object({ id: uuid });

export const accountsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/accounts',
    {
      schema: {
        tags: ['accounts'],
        summary: 'List accounts with current balances',
        response: { 200: z.array(account) },
      },
    },
    async (request) => {
      const { userId } = request.auth;
      const [rows, balances] = await Promise.all([
        listAccounts(app.db, userId),
        currentBalances(app.db, userId),
      ]);
      return rows.map((r) => toAccountDto(r, balances.get(r.id) ?? 0));
    },
  );

  app.post(
    '/accounts',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Create account',
        body: createAccount,
        response: { 201: account },
      },
    },
    async (request, reply) => {
      const row = await insertAccount(app.db, request.auth.userId, request.body);
      return reply.status(201).send(toAccountDto(row, row.openingBalance));
    },
  );

  app.get(
    '/accounts/:id',
    { schema: { tags: ['accounts'], params: idParams, response: { 200: account } } },
    async (request) => {
      const row = await getAccount(app.db, request.auth.userId, request.params.id);
      if (!row) throw notFound('Account');
      const balances = await currentBalances(app.db, request.auth.userId);
      return toAccountDto(row, balances.get(row.id) ?? 0);
    },
  );

  app.patch(
    '/accounts/:id',
    {
      schema: {
        tags: ['accounts'],
        params: idParams,
        body: updateAccount,
        response: { 200: account },
      },
    },
    async (request) => {
      const row = await patchAccount(app.db, request.auth.userId, request.params.id, request.body);
      if (!row) throw notFound('Account');
      const balances = await currentBalances(app.db, request.auth.userId);
      return toAccountDto(row, balances.get(row.id) ?? 0);
    },
  );

  app.delete(
    '/accounts/:id',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Delete an unused account (archive accounts that have transactions)',
        params: idParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { userId } = request.auth;
      if (await accountInUse(app.db, userId, request.params.id)) {
        throw conflict(
          'This account has transactions. Archive it instead to keep your history intact.',
        );
      }
      if (!(await deleteAccount(app.db, userId, request.params.id))) throw notFound('Account');
      return reply.status(204).send(null);
    },
  );
};
