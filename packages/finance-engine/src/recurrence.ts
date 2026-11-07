import type {
  Centavos,
  Confidence,
  EventDirection,
  EventKind,
  EventStatus,
  IsoDate,
  MonthEndRule,
  OccurrenceAction,
  RecurrenceFrequency,
} from '@mm/types';
import { addDays, addMonthsClamped, daysInMonth, makeDate, parseIsoDate } from './dates.js';
import { allocate } from './money.js';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Every N periods (>= 1). */
  interval?: number;
  /** Anchor day for monthly/quarterly/yearly/semimonthly (first payday). Defaults to start date's day. */
  dayOfMonth?: number | null;
  /** Second day for semimonthly schedules (defaults to month-end, e.g. "15th and 30th"). */
  secondDayOfMonth?: number | null;
  monthEndRule?: MonthEndRule;
  /** Last date (inclusive) an occurrence may fall on — e.g. a contract's end date. */
  endDate?: IsoDate | null;
  /** Maximum number of occurrences counted from the start date. */
  count?: number | null;
}

/** A scheduled financial event as consumed by the engine (independent of storage). */
export interface EngineEvent {
  id: string;
  name: string;
  direction: EventDirection;
  kind: EventKind;
  status: EventStatus;
  /** Expected amount (positive centavos). For installment plans this is the total. */
  amount: Centavos;
  amountMin?: Centavos | null;
  amountMax?: Centavos | null;
  confidence: Confidence;
  accountId?: string | null;
  categoryId?: string | null;
  /** First expected date. */
  startDate: IsoDate;
  recurrence: RecurrenceRule;
  /** When set (>1), `amount` is split across this many occurrences (count is forced to it). */
  installments?: number | null;
}

/** A per-occurrence adjustment, keyed by the occurrence's original scheduled date. */
export interface OccurrenceOverride {
  eventId: string;
  occurrenceDate: IsoDate;
  action: OccurrenceAction;
  /** New date for `reschedule`. */
  newDate?: IsoDate | null;
  /** New amount for `amount` (and optional for `reschedule`). */
  amount?: Centavos | null;
  /** Actual transaction that realised this occurrence (`paid`). */
  transactionId?: string | null;
}

export interface Occurrence {
  eventId: string;
  name: string;
  direction: EventDirection;
  kind: EventKind;
  status: EventStatus;
  confidence: Confidence;
  accountId: string | null;
  categoryId: string | null;
  /** Effective date (after any reschedule). */
  date: IsoDate;
  /** Originally scheduled date — the stable key for overrides. */
  originalDate: IsoDate;
  amount: Centavos;
  amountMin: Centavos | null;
  amountMax: Centavos | null;
  /** 1-based index within the series. */
  index: number;
  installmentCount: number | null;
  rescheduled: boolean;
  /** A one-off whose date passed without being paid; projected on the window start. */
  overdue: boolean;
  /** Set when the occurrence was realised by an actual transaction (only returned with includeSettled). */
  settledTransactionId: string | null;
  /** Realised (event paid, or occurrence marked paid). Settled occurrences never affect forecasts. */
  settled: boolean;
  skipped: boolean;
}

const MAX_ITERATIONS = 10_000;

/** Active statuses project into the future; `paid` and `cancelled` never do. */
export function isActiveStatus(status: EventStatus): boolean {
  return status === 'planned' || status === 'committed' || status === 'recurring';
}

/**
 * Generate the original scheduled dates of a series, in order, until `until` (inclusive),
 * honouring end date and count. Yields `[index, date]` with 1-based indexes.
 */
export function* scheduleDates(
  startDate: IsoDate,
  rule: RecurrenceRule,
  until: IsoDate,
): Generator<[number, IsoDate]> {
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  const last = rule.endDate && rule.endDate < until ? rule.endDate : until;
  const maxCount = rule.count ?? Number.POSITIVE_INFINITY;
  let index = 0;
  const emit = function* (date: IsoDate): Generator<[number, IsoDate]> {
    index += 1;
    yield [index, date];
  };

  if (startDate > last) return;

  switch (rule.frequency) {
    case 'none': {
      yield* emit(startDate);
      return;
    }
    case 'daily':
    case 'weekly':
    case 'biweekly': {
      const step = rule.frequency === 'daily' ? 1 : rule.frequency === 'weekly' ? 7 : 14;
      for (let k = 0; k < MAX_ITERATIONS && index < maxCount; k++) {
        const date = addDays(startDate, k * step * interval);
        if (date > last) return;
        yield* emit(date);
      }
      return;
    }
    case 'monthly':
    case 'quarterly':
    case 'yearly': {
      const monthsPerStep =
        rule.frequency === 'monthly' ? 1 : rule.frequency === 'quarterly' ? 3 : 12;
      const anchor = rule.dayOfMonth ?? parseIsoDate(startDate).day;
      const lastDay = rule.monthEndRule === 'last_day';
      for (let k = 0; k < MAX_ITERATIONS && index < maxCount; k++) {
        const base = addMonthsClamped(startDate, k * monthsPerStep * interval, 1);
        const { year, month } = parseIsoDate(base);
        const dim = daysInMonth(year, month);
        const date = makeDate(year, month, lastDay ? dim : Math.min(anchor, dim));
        if (date > last) return;
        if (date < startDate) continue; // anchor earlier than start in the first month
        yield* emit(date);
      }
      return;
    }
    case 'semimonthly': {
      const first = rule.dayOfMonth ?? 15;
      const second = rule.secondDayOfMonth ?? 31;
      const days = [Math.min(first, second), Math.max(first, second)];
      for (let k = 0; k < MAX_ITERATIONS && index < maxCount; k++) {
        const base = addMonthsClamped(startDate, k * interval, 1);
        const { year, month } = parseIsoDate(base);
        const dim = daysInMonth(year, month);
        const candidates = [
          ...new Set(days.map((d) => makeDate(year, month, Math.min(d as number, dim)))),
        ];
        for (const date of candidates) {
          if (date > last) return;
          if (date < startDate) continue;
          if (index >= maxCount) return;
          yield* emit(date);
        }
      }
      return;
    }
  }
}

/** The rule actually used for expansion (installment plans become a counted monthly series). */
export function effectiveRule(event: EngineEvent): RecurrenceRule {
  const installments = event.installments && event.installments > 1 ? event.installments : null;
  if (!installments) return event.recurrence;
  return {
    ...event.recurrence,
    frequency: event.recurrence.frequency === 'none' ? 'monthly' : event.recurrence.frequency,
    count: installments,
  };
}

/** Amount of the occurrence at a 1-based `index` (installments split the total exactly). */
export function occurrenceAmounts(event: EngineEvent, index: number) {
  const installments = event.installments && event.installments > 1 ? event.installments : null;
  if (!installments) {
    return {
      amount: event.amount,
      amountMin: event.amountMin ?? null,
      amountMax: event.amountMax ?? null,
    };
  }
  const pick = (total: Centavos | null | undefined) =>
    total == null ? null : (allocate(total, installments)[index - 1] ?? 0);
  return {
    amount: pick(event.amount) ?? 0,
    amountMin: pick(event.amountMin),
    amountMax: pick(event.amountMax),
  };
}

export interface ExpandOptions {
  /** Window start (inclusive) — normally "today". */
  from: IsoDate;
  /** Window end (inclusive). */
  to: IsoDate;
  /**
   * Project unpaid one-off events whose date already passed onto `from` (flagged `overdue`).
   * Recurring occurrences in the past are never projected: they are assumed realised by actual
   * transactions or missed, which avoids double counting.
   */
  includeOverdue?: boolean;
  /** Also return skipped and paid occurrences (for calendars). They never affect forecasts. */
  includeSettled?: boolean;
}

function overrideKey(eventId: string, date: IsoDate) {
  return `${eventId}|${date}`;
}

/**
 * Expand events into concrete dated occurrences within a window, applying overrides.
 * Pure and deterministic: identical inputs always give identical, date-sorted output.
 */
export function expandOccurrences(
  events: readonly EngineEvent[],
  overrides: readonly OccurrenceOverride[],
  options: ExpandOptions,
): Occurrence[] {
  const { from, to, includeOverdue = true, includeSettled = false } = options;
  const byKey = new Map<string, OccurrenceOverride>();
  for (const o of overrides) byKey.set(overrideKey(o.eventId, o.occurrenceDate), o);

  const out: Occurrence[] = [];

  for (const event of events) {
    if (!isActiveStatus(event.status) && !(includeSettled && event.status === 'paid')) continue;
    const rule = effectiveRule(event);
    const installmentCount =
      event.installments && event.installments > 1 ? event.installments : null;
    const settledEvent = event.status === 'paid';

    const make = (
      index: number,
      originalDate: IsoDate,
      override?: OccurrenceOverride,
    ): Occurrence => {
      const amounts = occurrenceAmounts(event, index);
      const amountOverride =
        override && (override.action === 'amount' || override.action === 'reschedule')
          ? override.amount
          : null;
      const amount = amountOverride ?? amounts.amount;
      return {
        eventId: event.id,
        name: event.name,
        direction: event.direction,
        kind: event.kind,
        status: event.status,
        confidence: event.confidence,
        accountId: event.accountId ?? null,
        categoryId: event.categoryId ?? null,
        date:
          override?.action === 'reschedule' && override.newDate ? override.newDate : originalDate,
        originalDate,
        amount,
        // An explicit amount override pins the range to the new amount.
        amountMin: amountOverride != null ? amount : amounts.amountMin,
        amountMax: amountOverride != null ? amount : amounts.amountMax,
        index,
        installmentCount,
        rescheduled: override?.action === 'reschedule',
        overdue: false,
        settledTransactionId: override?.action === 'paid' ? (override.transactionId ?? null) : null,
        settled: settledEvent || override?.action === 'paid',
        skipped: override?.action === 'skip',
      };
    };

    // Originals that fall inside the window (or before it for overdue one-offs).
    for (const [index, originalDate] of scheduleDates(event.startDate, rule, to)) {
      const override = byKey.get(overrideKey(event.id, originalDate));
      const settled = settledEvent || override?.action === 'paid' || override?.action === 'skip';
      if (settled && !includeSettled) continue;
      if (override?.action === 'reschedule') continue; // handled below by its new date

      if (originalDate < from) {
        if (includeOverdue && rule.frequency === 'none' && !settled) {
          out.push({ ...make(index, originalDate, override), date: from, overdue: true });
        }
        continue;
      }
      out.push(make(index, originalDate, override));
    }

    // Rescheduled occurrences land on their new date, which may be outside the original window.
    if (!settledEvent) {
      for (const o of overrides) {
        if (o.eventId !== event.id || o.action !== 'reschedule' || !o.newDate) continue;
        if (o.newDate < from || o.newDate > to) continue;
        let index = 0;
        for (const [i, d] of scheduleDates(event.startDate, rule, o.occurrenceDate)) {
          if (d === o.occurrenceDate) index = i;
        }
        if (index === 0) continue; // override refers to a date that is not part of the series
        out.push(make(index, o.occurrenceDate, o));
      }
    }
  }

  return out.sort(compareOccurrences);
}

/** Stable ordering: date, then inflows before outflows (salary lands before bills), then id. */
export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.direction !== b.direction) return a.direction === 'inflow' ? -1 : 1;
  if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1;
  return a.originalDate < b.originalDate ? -1 : a.originalDate > b.originalDate ? 1 : 0;
}
