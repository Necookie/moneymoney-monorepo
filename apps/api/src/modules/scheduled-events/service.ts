import { type Database, occurrenceOverrides, scheduledEvents, transactions } from '@mm/database';
import {
  effectiveRule,
  expandOccurrences,
  occurrenceAmounts,
  scheduleDates,
  todayInTimeZone,
} from '@mm/finance-engine';
import type {
  createScheduledEvent,
  markOccurrencePaid,
  updateScheduledEvent,
} from '@mm/validation';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { notFound, unprocessable } from '../../lib/errors.js';
import { toEngineEvent, toEngineOverride } from '../../lib/mappers.js';
import { getSettings } from '../settings/repository.js';
import { createTransaction } from '../transactions/service.js';

type CreateInput = z.output<typeof createScheduledEvent>;
type UpdateInput = z.output<typeof updateScheduledEvent>;
export type EventRow = typeof scheduledEvents.$inferSelect;

function recurrenceColumns(r: CreateInput['recurrence']) {
  return {
    frequency: r.frequency,
    interval: r.interval,
    dayOfMonth: r.dayOfMonth,
    secondDayOfMonth: r.secondDayOfMonth,
    monthEndRule: r.monthEndRule,
    endDate: r.endDate,
    occurrenceCount: r.count,
  };
}

export async function getEvent(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(scheduledEvents)
    .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, userId)));
  if (!row) throw notFound('Planned item');
  return row;
}

export async function listEvents(db: Database, userId: string) {
  return db
    .select()
    .from(scheduledEvents)
    .where(eq(scheduledEvents.userId, userId))
    .orderBy(scheduledEvents.startDate);
}

export async function createEvent(
  db: Database,
  userId: string,
  input: CreateInput,
  isDemo = false,
) {
  const { id, recurrence, ...rest } = input;
  const [row] = await db
    .insert(scheduledEvents)
    .values({
      ...(id ? { id } : {}),
      ...rest,
      ...recurrenceColumns(recurrence),
      amountMin: rest.amountMin ?? null,
      amountMax: rest.amountMax ?? null,
      accountId: rest.accountId ?? null,
      categoryId: rest.categoryId ?? null,
      installments: rest.installments ?? null,
      notes: rest.notes ?? null,
      userId,
      isDemo,
    })
    .returning();
  return row!;
}

export async function updateEvent(db: Database, userId: string, id: string, patch: UpdateInput) {
  const existing = await getEvent(db, userId, id);
  const { recurrence, ...rest } = patch;
  const amount = rest.amount ?? existing.amount;
  const amountMin = rest.amountMin !== undefined ? rest.amountMin : existing.amountMin;
  const amountMax = rest.amountMax !== undefined ? rest.amountMax : existing.amountMax;
  if ((amountMin != null && amountMin > amount) || (amountMax != null && amountMax < amount)) {
    throw unprocessable('The expected amount must sit within its range');
  }
  const [row] = await db
    .update(scheduledEvents)
    .set({ ...rest, ...(recurrence ? recurrenceColumns(recurrence) : {}), updatedAt: new Date() })
    .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, userId)))
    .returning();
  return row!;
}

/** Delete a planned item. Actual transactions created from it are kept and simply unlinked. */
export async function deleteEvent(db: Database, userId: string, id: string) {
  await getEvent(db, userId, id);
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ scheduledEventId: null, occurrenceDate: null, updatedAt: new Date() })
      .where(and(eq(transactions.scheduledEventId, id), eq(transactions.userId, userId)));
    await tx
      .delete(scheduledEvents)
      .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, userId)));
  });
}

function isSeries(row: EventRow) {
  return row.frequency !== 'none' || (row.installments ?? 0) > 1;
}

function assertOccurrence(row: EventRow, occurrenceDate: string) {
  for (const [index, date] of scheduleDates(
    row.startDate,
    effectiveRule(toEngineEvent(row)),
    occurrenceDate,
  )) {
    if (date === occurrenceDate) return index;
  }
  throw unprocessable(`${occurrenceDate} is not a scheduled date of "${row.name}"`);
}

async function upsertOverride(
  db: Database,
  userId: string,
  values: {
    eventId: string;
    occurrenceDate: string;
    action: 'skip' | 'reschedule';
    newDate?: string | null;
  },
) {
  const [row] = await db
    .insert(occurrenceOverrides)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: [occurrenceOverrides.eventId, occurrenceOverrides.occurrenceDate],
      set: { action: values.action, newDate: values.newDate ?? null, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

/** Postpone: a one-off moves its date; a series moves just the chosen occurrence. */
export async function postpone(
  db: Database,
  userId: string,
  id: string,
  occurrenceDate: string,
  newDate: string,
) {
  const row = await getEvent(db, userId, id);
  if (!isSeries(row)) {
    if (row.endDate && newDate > row.endDate) throw unprocessable('New date is after the end date');
    return updateEvent(db, userId, id, { startDate: newDate });
  }
  assertOccurrence(row, occurrenceDate);
  await upsertOverride(db, userId, { eventId: id, occurrenceDate, action: 'reschedule', newDate });
  return getEvent(db, userId, id);
}

export async function skip(db: Database, userId: string, id: string, occurrenceDate: string) {
  const row = await getEvent(db, userId, id);
  if (!isSeries(row)) return updateEvent(db, userId, id, { status: 'cancelled' });
  assertOccurrence(row, occurrenceDate);
  await upsertOverride(db, userId, { eventId: id, occurrenceDate, action: 'skip' });
  return getEvent(db, userId, id);
}

/** Split part of a one-off planned item into a new item on another date (e.g. pay half now). */
export async function split(
  db: Database,
  userId: string,
  id: string,
  input: { amount: number; startDate: string; name?: string | undefined },
) {
  const row = await getEvent(db, userId, id);
  if (isSeries(row))
    throw unprocessable('Only one-off items can be split; edit installments instead');
  if (input.amount >= row.amount)
    throw unprocessable('The split amount must be less than the full amount');
  return db.transaction(async (tx) => {
    const [original] = await tx
      .update(scheduledEvents)
      .set({
        amount: row.amount - input.amount,
        amountMin: null,
        amountMax: null,
        updatedAt: new Date(),
      })
      .where(eq(scheduledEvents.id, id))
      .returning();
    const [created] = await tx
      .insert(scheduledEvents)
      .values({
        userId,
        name: input.name ?? `${row.name} (part)`,
        direction: row.direction,
        kind: row.kind,
        status: row.status,
        amount: input.amount,
        currency: row.currency,
        confidence: row.confidence,
        accountId: row.accountId,
        categoryId: row.categoryId,
        startDate: input.startDate,
        notes: row.notes,
        isDemo: row.isDemo,
      })
      .returning();
    return { original: original!, created: created! };
  });
}

/** Mark one occurrence paid by recording the actual transaction (idempotent on transactionId). */
export async function markPaid(
  db: Database,
  userId: string,
  id: string,
  input: z.output<typeof markOccurrencePaid>,
) {
  const row = await getEvent(db, userId, id);
  if (row.status === 'cancelled') throw unprocessable('This item was cancelled');
  const index = assertOccurrence(row, input.occurrenceDate);
  const accountId = input.accountId ?? row.accountId;
  if (!accountId) throw unprocessable('Choose the account the money moved through');
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone);
  const amount = input.amount ?? occurrenceAmounts(toEngineEvent(row), index).amount;
  return createTransaction(db, userId, {
    id: input.transactionId,
    type: row.direction === 'inflow' ? 'income' : 'expense',
    amount,
    accountId,
    counterAccountId: null,
    categoryId: input.categoryId !== undefined ? input.categoryId : row.categoryId,
    occurredOn: input.occurredOn ?? (input.occurrenceDate <= today ? input.occurrenceDate : today),
    description: row.name,
    notes: null,
    tags: [],
    scheduledEventId: row.id,
    occurrenceDate: input.occurrenceDate,
  });
}

/** Occurrences in a date range for calendars/timelines, including settled and skipped ones. */
export async function occurrencesBetween(db: Database, userId: string, from: string, to: string) {
  const [eventRows, overrideRows] = await Promise.all([
    listEvents(db, userId),
    db.select().from(occurrenceOverrides).where(eq(occurrenceOverrides.userId, userId)),
  ]);
  return expandOccurrences(eventRows.map(toEngineEvent), overrideRows.map(toEngineOverride), {
    from,
    to,
    includeOverdue: false,
    includeSettled: true,
  });
}
