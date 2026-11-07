import { type Database, transactions } from '@mm/database';
import type { TransactionQuery } from '@mm/validation';
import { and, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

export type TransactionRow = typeof transactions.$inferSelect;

export async function findTransaction(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  return row ?? null;
}

interface Cursor {
  occurredOn: string;
  createdAt: string;
  id: string;
}

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    return c.occurredOn && c.createdAt && c.id ? c : null;
  } catch {
    return null;
  }
}

function filters(userId: string, q: TransactionQuery): SQL[] {
  const where: SQL[] = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
  if (q.from) where.push(gte(transactions.occurredOn, q.from));
  if (q.to) where.push(lte(transactions.occurredOn, q.to));
  if (q.accountId) {
    where.push(
      or(eq(transactions.accountId, q.accountId), eq(transactions.counterAccountId, q.accountId))!,
    );
  }
  if (q.categoryId) where.push(eq(transactions.categoryId, q.categoryId));
  if (q.type) where.push(eq(transactions.type, q.type));
  if (q.tag) where.push(sql`${transactions.tags} @> ARRAY[${q.tag}]::text[]`);
  if (q.q) {
    const term = `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(transactions.description, term), ilike(transactions.notes, term))!);
  }
  return where;
}

/** Keyset-paginated, newest first. */
export async function listTransactions(db: Database, userId: string, q: TransactionQuery) {
  const limit = Number(q.limit ?? 100);
  const where = filters(userId, q);
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  const pageWhere = [...where];
  if (cursor) {
    pageWhere.push(
      sql`(${transactions.occurredOn}, ${transactions.createdAt}, ${transactions.id}) < (${cursor.occurredOn}::date, ${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }
  const rows = await db
    .select()
    .from(transactions)
    .where(and(...pageWhere))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit + 1);

  const [totals] = await db
    .select({
      income: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} end), 0)`,
      expenses: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} end), 0)`,
      refunds: sql<string>`coalesce(sum(case when ${transactions.type} = 'refund' then ${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(and(...where));

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const income = Number(totals?.income ?? 0);
  const expenses = Number(totals?.expenses ?? 0);
  const refunds = Number(totals?.refunds ?? 0);
  return {
    items: page,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({
            occurredOn: last.occurredOn,
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
    totals: { income, expenses, refunds, net: income - expenses + refunds },
  };
}

export async function allTransactionsForExport(db: Database, userId: string, q: TransactionQuery) {
  return db
    .select()
    .from(transactions)
    .where(and(...filters(userId, q)))
    .orderBy(transactions.occurredOn, transactions.createdAt);
}

export async function changedSince(db: Database, userId: string, since: Date | null) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        since ? gte(transactions.updatedAt, since) : isNull(transactions.deletedAt),
      ),
    )
    .orderBy(transactions.updatedAt);
}
