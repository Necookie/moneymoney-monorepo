import type { TransactionType } from '@mm/types';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { LocalTransaction } from '../sync/types';
import { rowToTransaction } from './sqliteStorage';

export type TypeFilter = TransactionType | 'all';

export interface TransactionFilter {
  type?: TypeFilter;
  q?: string;
  limit?: number;
}

/** Visible (not locally deleted) transactions, newest first, with search & type filter. */
export async function queryTransactions(
  db: SQLiteDatabase,
  filter: TransactionFilter = {},
): Promise<LocalTransaction[]> {
  const where = ['t.deleted_at IS NULL'];
  const params: (string | number)[] = [];
  if (filter.type && filter.type !== 'all') {
    where.push('t.type = ?');
    params.push(filter.type);
  }
  const q = filter.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(t.description LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }
  params.push(filter.limit ?? 300);
  const rows = await db.getAllAsync<Parameters<typeof rowToTransaction>[0]>(
    `SELECT t.* FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.occurred_on DESC, t.created_at DESC
     LIMIT ?`,
    ...params,
  );
  return rows.map(rowToTransaction);
}

export async function countByType(db: SQLiteDatabase): Promise<Record<TypeFilter, number>> {
  const rows = await db.getAllAsync<{ type: TransactionType; n: number }>(
    'SELECT type, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL GROUP BY type',
  );
  const out: Record<TypeFilter, number> = {
    all: 0,
    expense: 0,
    income: 0,
    transfer: 0,
    refund: 0,
    adjustment: 0,
  };
  for (const r of rows) {
    out[r.type] = r.n;
    out.all += r.n;
  }
  return out;
}

export async function syncCounts(db: SQLiteDatabase): Promise<{ pending: number; failed: number }> {
  const r = await db.getFirstAsync<{ pending: number; failed: number }>(
    `SELECT
       SUM(CASE WHEN sync_state = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN sync_state = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM transactions`,
  );
  return { pending: r?.pending ?? 0, failed: r?.failed ?? 0 };
}
