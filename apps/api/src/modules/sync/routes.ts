import { categories, syncOperations } from '@mm/database';
import { addDays, expandOccurrences } from '@mm/finance-engine';
import {
  syncPullQuery,
  syncPullResponse,
  syncPushRequest,
  syncPushResponse,
  type SyncOpResult,
} from '@mm/validation';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError, fromDatabaseError } from '../../lib/errors.js';
import {
  toAccountDto,
  toCategoryDto,
  toOccurrenceDto,
  toSettingsDto,
  toTransactionDto,
} from '../../lib/mappers.js';
import { loadSnapshot } from '../../lib/snapshot.js';
import { currentBalances, listAccounts } from '../accounts/repository.js';
import { changedSince, findTransaction } from '../transactions/repository.js';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '../transactions/service.js';

export const syncRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/sync/push',
    {
      schema: {
        tags: ['sync'],
        summary: 'Apply queued offline operations (idempotent per opId)',
        description:
          'Operations are applied in order. Replaying an opId returns status "duplicate" without re-applying. Updates carrying a stale baseUpdatedAt return "conflict" with the server copy (server wins). Validation failures return "rejected" so clients stop retrying them.',
        body: syncPushRequest,
        response: { 200: syncPushResponse },
      },
    },
    async (request) => {
      const { userId } = request.auth;
      const results: SyncOpResult[] = [];

      for (const op of request.body.operations) {
        const [seen] = await app.db
          .select()
          .from(syncOperations)
          .where(and(eq(syncOperations.id, op.opId), eq(syncOperations.userId, userId)));
        if (seen) {
          const current = await findTransaction(app.db, userId, seen.entityId);
          results.push({
            opId: op.opId,
            status: 'duplicate',
            transaction: current ? toTransactionDto(current) : null,
          });
          continue;
        }

        const entityId = op.op === 'create' ? op.data.id : op.id;
        let result: SyncOpResult;
        try {
          if (op.op === 'create') {
            const { row, created } = await createTransaction(app.db, userId, op.data);
            result = {
              opId: op.opId,
              status: created ? 'applied' : 'duplicate',
              transaction: toTransactionDto(row),
            };
          } else if (op.op === 'update') {
            const existing = await findTransaction(app.db, userId, op.id);
            if (!existing) {
              result = {
                opId: op.opId,
                status: 'rejected',
                message: 'Transaction not found',
                transaction: null,
              };
            } else if (
              existing.deletedAt ||
              (op.baseUpdatedAt && existing.updatedAt > new Date(op.baseUpdatedAt))
            ) {
              result = {
                opId: op.opId,
                status: 'conflict',
                message: existing.deletedAt
                  ? 'Deleted on another device'
                  : 'Changed on another device; server copy kept',
                transaction: toTransactionDto(existing),
              };
            } else {
              const row = await updateTransaction(app.db, userId, op.id, op.data);
              result = { opId: op.opId, status: 'applied', transaction: toTransactionDto(row) };
            }
          } else {
            const existing = await findTransaction(app.db, userId, op.id);
            if (!existing) {
              result = {
                opId: op.opId,
                status: 'applied',
                message: 'Already gone',
                transaction: null,
              };
            } else {
              const row = await deleteTransaction(app.db, userId, op.id);
              result = { opId: op.opId, status: 'applied', transaction: toTransactionDto(row) };
            }
          }
        } catch (err) {
          const appErr = err instanceof AppError ? err : fromDatabaseError(err);
          if (!appErr || appErr.statusCode >= 500) throw err; // transient: let the client retry the batch
          result = {
            opId: op.opId,
            status: 'rejected',
            message: appErr.message,
            transaction: null,
          };
        }

        await app.db
          .insert(syncOperations)
          .values({
            id: op.opId,
            userId,
            entity: op.entity,
            entityId,
            op: op.op,
            status: result.status,
            result: { message: result.message ?? null },
          })
          .onConflictDoNothing();
        results.push(result);
      }

      return { results, serverTime: new Date().toISOString() };
    },
  );

  app.get(
    '/sync/pull',
    {
      schema: {
        tags: ['sync'],
        summary: 'Changes since a server timestamp (full snapshot when omitted)',
        querystring: syncPullQuery,
        response: { 200: syncPullResponse },
      },
    },
    async (request) => {
      const { userId } = request.auth;
      // Captured before reading so concurrent writes are re-sent next time (clients upsert).
      const serverTime = new Date().toISOString();
      const since = request.query.since ? new Date(request.query.since) : null;
      const [accountRows, balances, categoryRows, txRows, snap] = await Promise.all([
        listAccounts(app.db, userId),
        currentBalances(app.db, userId),
        app.db.select().from(categories).where(eq(categories.userId, userId)),
        changedSince(app.db, userId, since),
        loadSnapshot(app.db, userId),
      ]);
      const upcoming = expandOccurrences(snap.events, snap.overrides, {
        from: snap.today,
        to: addDays(snap.today, 60),
      });
      return {
        serverTime,
        accounts: accountRows.map((a) => toAccountDto(a, balances.get(a.id) ?? 0)),
        categories: categoryRows.map(toCategoryDto),
        transactions: txRows.map(toTransactionDto),
        upcoming: upcoming.map(toOccurrenceDto),
        settings: toSettingsDto(snap.settings),
      };
    },
  );
};
