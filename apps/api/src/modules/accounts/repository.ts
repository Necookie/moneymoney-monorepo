import { accounts, type Database, transactions } from '@mm/database';
import { accountBalances, todayInTimeZone } from '@mm/finance-engine';
import type { CreateAccount, UpdateAccount } from '@mm/validation';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getSettings } from '../settings/repository.js';

export async function listAccounts(db: Database, userId: string) {
  return db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.createdAt);
}

export async function getAccount(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  return row ?? null;
}

/** Current signed balances (as of today in the user's timezone) for all of a user's accounts. */
export async function currentBalances(db: Database, userId: string): Promise<Map<string, number>> {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone);
  const [accountRows, txRows] = await Promise.all([
    listAccounts(db, userId),
    db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        accountId: transactions.accountId,
        counterAccountId: transactions.counterAccountId,
        occurredOn: transactions.occurredOn,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))),
  ]);
  return accountBalances(accountRows, txRows, today);
}

export async function insertAccount(db: Database, userId: string, input: CreateAccount) {
  const [row] = await db
    .insert(accounts)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId,
      name: input.name,
      type: input.type,
      currency: input.currency ?? 'PHP',
      openingBalance: input.openingBalance ?? 0,
      openingDate: input.openingDate,
      color: input.color ?? null,
      icon: input.icon ?? null,
    })
    .returning();
  return row!;
}

export async function patchAccount(db: Database, userId: string, id: string, patch: UpdateAccount) {
  const { archived, ...rest } = patch;
  const [row] = await db
    .update(accounts)
    .set({
      ...rest,
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function accountInUse(db: Database, userId: string, id: string) {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        or(eq(transactions.accountId, id), eq(transactions.counterAccountId, id)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function deleteAccount(db: Database, userId: string, id: string) {
  const deleted = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning({ id: accounts.id });
  return deleted.length > 0;
}
