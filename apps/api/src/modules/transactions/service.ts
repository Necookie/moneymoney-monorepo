import {
  accounts,
  categories,
  type Database,
  occurrenceOverrides,
  scheduledEvents,
  transactions,
} from '@mm/database';
import {
  addDays,
  isValidIsoDate,
  parseMoney,
  todayInTimeZone,
  toDecimalString,
} from '@mm/finance-engine';
import type { TransactionType } from '@mm/types';
import type { createTransaction as createSchema, CsvImportResult } from '@mm/validation';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { parseCsv, toCsv } from '../../lib/csv.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { getSettings } from '../settings/repository.js';
import { findTransaction, type TransactionRow } from './repository.js';

export type CreateTransactionInput = z.output<typeof createSchema>;

async function userToday(db: Database, userId: string) {
  const settings = await getSettings(db, userId);
  return todayInTimeZone(settings.timezone);
}

async function assertCategoryFits(
  db: Database,
  userId: string,
  categoryId: string | null | undefined,
  type: TransactionType,
) {
  if (!categoryId) return;
  const [cat] = await db
    .select({ kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (!cat) throw unprocessable('Category not found');
  if (type === 'transfer') throw unprocessable('Transfers are not categorised');
  const expected =
    type === 'income' ? 'income' : type === 'expense' || type === 'refund' ? 'expense' : null;
  if (expected && cat.kind !== expected) {
    throw unprocessable(`A ${type} needs an ${expected} category`);
  }
}

function assertNotFuture(occurredOn: string, today: string) {
  // Allow one day of slack for clients ahead of the server clock; plan future items instead.
  if (occurredOn > addDays(today, 1)) {
    throw unprocessable(
      'Transactions record money that already moved. Use the planner for future items.',
    );
  }
}

/**
 * Create a transaction idempotently. The id is client-generated: replaying the same request
 * returns the stored record instead of creating a duplicate. When `scheduledEventId` is set, the
 * matching planned occurrence is marked paid in the same database transaction, so the plan stops
 * projecting it (no double counting).
 */
export async function createTransaction(
  db: Database,
  userId: string,
  input: CreateTransactionInput,
  options: { isDemo?: boolean; today?: string } = {},
): Promise<{ row: TransactionRow; created: boolean }> {
  const existing = await findTransaction(db, userId, input.id);
  if (existing) return { row: existing, created: false };

  const today = options.today ?? (await userToday(db, userId));
  assertNotFuture(input.occurredOn, today);
  await assertCategoryFits(db, userId, input.categoryId, input.type);

  return db.transaction(async (tx) => {
    let occurrenceDate = input.occurrenceDate ?? null;
    let event: typeof scheduledEvents.$inferSelect | undefined;
    if (input.scheduledEventId) {
      [event] = await tx
        .select()
        .from(scheduledEvents)
        .where(
          and(eq(scheduledEvents.id, input.scheduledEventId), eq(scheduledEvents.userId, userId)),
        );
      if (!event) throw unprocessable('Planned item not found');
      occurrenceDate ??= event.startDate;
    }

    const inserted = await tx
      .insert(transactions)
      .values({
        id: input.id,
        userId,
        type: input.type,
        amount: input.amount,
        accountId: input.accountId,
        counterAccountId: input.type === 'transfer' ? (input.counterAccountId ?? null) : null,
        categoryId: input.categoryId ?? null,
        occurredOn: input.occurredOn,
        description: input.description ?? '',
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        scheduledEventId: input.scheduledEventId ?? null,
        occurrenceDate: input.scheduledEventId ? occurrenceDate : null,
        isDemo: options.isDemo ?? false,
      })
      .onConflictDoNothing({ target: transactions.id })
      .returning();

    const row = inserted[0];
    if (!row) {
      // Raced with an identical retry, or the id belongs to someone else.
      const again = await findTransaction(tx, userId, input.id);
      if (again) return { row: again, created: false };
      throw conflict('Transaction id already in use');
    }

    if (event && occurrenceDate) {
      await tx
        .insert(occurrenceOverrides)
        .values({
          userId,
          eventId: event.id,
          occurrenceDate,
          action: 'paid',
          transactionId: row.id,
        })
        .onConflictDoUpdate({
          target: [occurrenceOverrides.eventId, occurrenceOverrides.occurrenceDate],
          set: { action: 'paid', transactionId: row.id, newDate: null, updatedAt: new Date() },
        });
      const oneOff = event.frequency === 'none' && !event.installments;
      if (oneOff) {
        await tx
          .update(scheduledEvents)
          .set({ status: 'paid', updatedAt: new Date() })
          .where(eq(scheduledEvents.id, event.id));
      }
    }
    return { row, created: true };
  });
}

export interface TransactionPatch {
  type?: TransactionType | undefined;
  amount?: number | undefined;
  accountId?: string | undefined;
  counterAccountId?: string | null | undefined;
  categoryId?: string | null | undefined;
  occurredOn?: string | undefined;
  description?: string | undefined;
  notes?: string | null | undefined;
  tags?: string[] | undefined;
}

export async function updateTransaction(
  db: Database,
  userId: string,
  id: string,
  patch: TransactionPatch,
) {
  const existing = await findTransaction(db, userId, id);
  if (!existing || existing.deletedAt) throw notFound('Transaction');
  const type = patch.type ?? existing.type;
  const merged = {
    type,
    amount: patch.amount ?? existing.amount,
    accountId: patch.accountId ?? existing.accountId,
    counterAccountId:
      type === 'transfer'
        ? patch.counterAccountId !== undefined
          ? patch.counterAccountId
          : existing.counterAccountId
        : null,
    categoryId:
      type === 'transfer'
        ? null
        : patch.categoryId !== undefined
          ? patch.categoryId
          : existing.categoryId,
    occurredOn: patch.occurredOn ?? existing.occurredOn,
  };
  if (type === 'transfer' && !merged.counterAccountId)
    throw unprocessable('Transfers need a destination account');
  if (merged.counterAccountId && merged.counterAccountId === merged.accountId) {
    throw unprocessable('Cannot transfer to the same account');
  }
  if (type !== 'adjustment' && merged.amount <= 0) throw unprocessable('Amount must be positive');
  assertNotFuture(merged.occurredOn, await userToday(db, userId));
  await assertCategoryFits(db, userId, merged.categoryId, type);

  const [row] = await db
    .update(transactions)
    .set({
      ...merged,
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();
  return row!;
}

/**
 * Soft delete (keeps a tombstone for offline clients). If the transaction realised a planned
 * occurrence, that occurrence becomes pending again.
 */
export async function deleteTransaction(db: Database, userId: string, id: string) {
  const existing = await findTransaction(db, userId, id);
  if (!existing) throw notFound('Transaction');
  if (existing.deletedAt) return existing;
  return db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(transactions)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    if (existing.scheduledEventId) {
      await tx
        .delete(occurrenceOverrides)
        .where(
          and(eq(occurrenceOverrides.transactionId, id), eq(occurrenceOverrides.userId, userId)),
        );
      await tx
        .update(scheduledEvents)
        .set({ status: 'committed', updatedAt: now })
        .where(
          and(
            eq(scheduledEvents.id, existing.scheduledEventId),
            eq(scheduledEvents.userId, userId),
            eq(scheduledEvents.status, 'paid'),
          ),
        );
    }
    return row!;
  });
}

// ── CSV ──────────────────────────────────────────────────────────────────
export const CSV_HEADERS = [
  'date',
  'type',
  'amount',
  'account',
  'to_account',
  'category',
  'description',
  'notes',
  'tags',
];

export async function exportCsv(db: Database, userId: string, rows: TransactionRow[]) {
  const [accountRows, categoryRows] = await Promise.all([
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
  ]);
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
  return toCsv([
    CSV_HEADERS,
    ...rows.map((t) => [
      t.occurredOn,
      t.type,
      toDecimalString(t.amount),
      accountName.get(t.accountId) ?? '',
      t.counterAccountId ? (accountName.get(t.counterAccountId) ?? '') : '',
      t.categoryId ? (categoryName.get(t.categoryId) ?? '') : '',
      t.description,
      t.notes ?? '',
      t.tags.join(';'),
    ]),
  ]);
}

function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (isValidIsoDate(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // MM/DD/YYYY
  if (m) {
    const iso = `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

/** Deterministic id from the row content so re-importing the same file skips duplicates. */
function importId(userId: string, key: string): string {
  const h = createHash('sha256').update(`${userId}|${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function importCsv(
  db: Database,
  userId: string,
  options: { csv: string; defaultAccountId?: string | undefined; dryRun: boolean },
): Promise<CsvImportResult> {
  const rows = parseCsv(options.csv);
  const result: CsvImportResult = {
    dryRun: options.dryRun,
    imported: 0,
    skippedDuplicates: 0,
    errors: [],
    preview: [],
  };
  if (rows.length < 2) {
    result.errors.push({
      line: 1,
      message: 'The file needs a header row and at least one transaction',
    });
    return result;
  }
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => header.indexOf(name);
  for (const required of ['date', 'amount']) {
    if (col(required) < 0) result.errors.push({ line: 1, message: `Missing "${required}" column` });
  }
  if (col('account') < 0 && !options.defaultAccountId) {
    result.errors.push({ line: 1, message: 'Add an "account" column or choose a default account' });
  }
  if (result.errors.length) return result;

  const [accountRows, categoryRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
  ]);
  const accountByName = new Map(accountRows.map((a) => [a.name.trim().toLowerCase(), a]));
  const defaultAccount = options.defaultAccountId
    ? accountRows.find((a) => a.id === options.defaultAccountId)
    : undefined;
  if (options.defaultAccountId && !defaultAccount) {
    result.errors.push({ line: 1, message: 'Default account not found' });
    return result;
  }
  const categoryByKey = new Map(
    categoryRows.map((c) => [`${c.kind}:${c.name.trim().toLowerCase()}`, c]),
  );
  const today = await userToday(db, userId);
  const seen = new Map<string, number>();
  const prepared: Array<
    CreateTransactionInput & { categoryName: string | null; kind: 'income' | 'expense' | null }
  > = [];

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');
    const occurredOn = normaliseDate(get('date'));
    if (!occurredOn) return result.errors.push({ line, message: `Invalid date "${get('date')}"` });
    if (occurredOn > addDays(today, 1))
      return result.errors.push({ line, message: 'Date is in the future' });

    let amount: number;
    try {
      amount = parseMoney(get('amount'));
    } catch {
      return result.errors.push({ line, message: `Invalid amount "${get('amount')}"` });
    }
    const rawType = get('type').toLowerCase();
    let type: TransactionType;
    if (rawType) {
      if (!['income', 'expense', 'transfer', 'refund', 'adjustment'].includes(rawType)) {
        return result.errors.push({ line, message: `Unknown type "${rawType}"` });
      }
      type = rawType as TransactionType;
      if (type !== 'adjustment') amount = Math.abs(amount);
    } else {
      type = amount < 0 ? 'expense' : 'income';
      amount = Math.abs(amount);
    }
    if (amount === 0) return result.errors.push({ line, message: 'Amount is zero' });

    const account = get('account')
      ? accountByName.get(get('account').toLowerCase())
      : defaultAccount;
    if (!account)
      return result.errors.push({ line, message: `Unknown account "${get('account')}"` });
    let counterAccountId: string | null = null;
    if (type === 'transfer') {
      const to = accountByName.get(get('to_account').toLowerCase());
      if (!to || to.id === account.id)
        return result.errors.push({ line, message: 'Transfer needs a different "to_account"' });
      counterAccountId = to.id;
    }

    const kind =
      type === 'income' ? 'income' : type === 'expense' || type === 'refund' ? 'expense' : null;
    const categoryName = kind && get('category') ? get('category') : null;
    const description = get('description').slice(0, 200);
    const key = [
      occurredOn,
      type,
      amount,
      account.id,
      counterAccountId ?? '',
      categoryName ?? '',
      description,
    ].join('|');
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    prepared.push({
      id: importId(userId, `${key}|${n}`),
      type,
      amount,
      accountId: account.id,
      counterAccountId,
      categoryId: null,
      occurredOn,
      description,
      notes: get('notes') || null,
      tags: get('tags')
        ? get('tags')
            .split(/[;|]/)
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 20)
        : [],
      categoryName,
      kind,
    });
    result.preview.push({
      line,
      occurredOn,
      type,
      amount,
      description,
      account: account.name,
      category: categoryName,
    });
  });

  result.preview = result.preview.slice(0, 50);
  if (options.dryRun || result.errors.length > 0) return result;

  await db.transaction(async (tx) => {
    for (const item of prepared) {
      const { categoryName, kind, ...input } = item;
      if (categoryName && kind) {
        const key = `${kind}:${categoryName.toLowerCase()}`;
        let cat = categoryByKey.get(key);
        if (!cat) {
          [cat] = await tx
            .insert(categories)
            .values({ userId, name: categoryName, kind })
            .returning();
          categoryByKey.set(key, cat!);
        }
        input.categoryId = cat!.id;
      }
      const inserted = await tx
        .insert(transactions)
        .values({
          ...input,
          userId,
          counterAccountId: input.counterAccountId ?? null,
          categoryId: input.categoryId ?? null,
        })
        .onConflictDoNothing({ target: transactions.id })
        .returning({ id: transactions.id });
      if (inserted.length) result.imported += 1;
      else result.skippedDuplicates += 1;
    }
  });
  return result;
}
