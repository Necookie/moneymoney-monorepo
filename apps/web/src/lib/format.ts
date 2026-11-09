/**
 * Pure display helpers (no React, no DOM) — unit-tested with `node --test`.
 * Imports are limited to workspace packages so the tests run without a bundler.
 */
import type {
  AccountType,
  AlertSeverity,
  Confidence,
  EventKind,
  EventStatus,
  GoalKind,
  RecurrenceFrequency,
  TransactionType,
} from '@mm/types';
import {
  formatDate,
  parseIsoDate,
  parseMoney,
  toDecimalString,
  addMonthsClamped,
  makeDate,
  daysInMonth,
} from '@mm/finance-engine';

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-wallet',
  savings: 'Savings',
  credit: 'Credit card',
};

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  expense: 'Expense',
  bill: 'Bill',
  purchase: 'Purchase',
  salary: 'Salary',
  freelance: 'Freelance',
  contract: 'Contract',
  income: 'Other income',
};

export const INFLOW_KINDS: readonly EventKind[] = ['salary', 'freelance', 'contract', 'income'];
export const OUTFLOW_KINDS: readonly EventKind[] = ['bill', 'expense', 'purchase'];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  planned: 'Planned',
  committed: 'Committed',
  recurring: 'Recurring',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: 'Confirmed',
  likely: 'Likely',
  uncertain: 'Uncertain',
};

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  emergency: 'Emergency fund',
  investment: 'Investment',
  vehicle: 'Vehicle',
  electronics: 'Electronics',
  travel: 'Travel',
  custom: 'Custom',
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export type BudgetState = 'ok' | 'approaching' | 'over_pace' | 'exceeded';
export const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
  ok: 'On track',
  approaching: 'Approaching limit',
  over_pace: 'Over pace',
  exceeded: 'Exceeded',
};

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface RecurrenceLike {
  frequency: RecurrenceFrequency;
  interval?: number | null;
  dayOfMonth?: number | null;
  secondDayOfMonth?: number | null;
  monthEndRule?: 'clamp' | 'last_day' | null;
  endDate?: string | null;
  count?: number | null;
}

/** Human description: "Twice a month · 15th & 30th · until Jun 30, 2027". */
export function describeRecurrence(rule: RecurrenceLike, startDate: string): string {
  const interval = Math.max(1, rule.interval ?? 1);
  const startDay = parseIsoDate(startDate).day;
  let base: string;
  switch (rule.frequency) {
    case 'none':
      return `Once · ${formatDate(startDate)}`;
    case 'daily':
      base = interval === 1 ? 'Daily' : `Every ${interval} days`;
      break;
    case 'weekly':
      base = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
      break;
    case 'biweekly':
      base = interval === 1 ? 'Every 2 weeks' : `Every ${interval * 2} weeks`;
      break;
    case 'semimonthly': {
      const first = rule.dayOfMonth ?? 15;
      const second = rule.secondDayOfMonth ?? 31;
      const [a, b] = [Math.min(first, second), Math.max(first, second)];
      const label = (d: number) => (d === 31 ? 'month end' : ordinal(d));
      base = `${interval === 1 ? 'Twice a month' : `Twice every ${interval} months`} · ${label(a)} & ${label(b)}`;
      break;
    }
    case 'monthly':
    case 'quarterly':
    case 'yearly': {
      const unit =
        rule.frequency === 'monthly'
          ? 'month'
          : rule.frequency === 'quarterly'
            ? 'quarter'
            : 'year';
      const head = interval === 1 ? FREQUENCY_LABEL[rule.frequency] : `Every ${interval} ${unit}s`;
      const day =
        rule.monthEndRule === 'last_day' ? 'last day' : ordinal(rule.dayOfMonth ?? startDay);
      base = `${head} · ${rule.frequency === 'yearly' ? formatDate(startDate, false) : `on the ${day}`}`;
      break;
    }
  }
  const tail: string[] = [];
  if (rule.endDate) tail.push(`until ${formatDate(rule.endDate)}`);
  if (rule.count) tail.push(`${rule.count} times`);
  return [base, ...tail].join(' · ');
}

export type ParsedMoney = { ok: true; value: number } | { ok: false; error: string };

/**
 * Parse user input into centavos via `parseMoney` (never floats). Empty input is an error unless
 * `allowEmpty` (then 0). Positive-only unless `allowNegative`.
 */
export function readMoney(
  input: string,
  options: { allowNegative?: boolean; allowZero?: boolean } = {},
): ParsedMoney {
  // Accept the typographic minus our own formatMoney prints ("−₱1,234.00", also the input
  // placeholder) and the en/em dashes some phone keyboards substitute for "-".
  const trimmed = input.trim().replace(/^[−–—]/, '-');
  if (!trimmed) return { ok: false, error: 'Enter an amount' };
  let value: number;
  try {
    value = parseMoney(trimmed);
  } catch {
    return { ok: false, error: 'Use a number like 1,234.50 (max 2 decimals)' };
  }
  if (!options.allowNegative && value < 0) return { ok: false, error: 'Amount must be positive' };
  if (!options.allowZero && value === 0) return { ok: false, error: 'Amount cannot be zero' };
  return { ok: true, value };
}

/** Optional money field: blank → null. */
export function readOptionalMoney(input: string): ParsedMoney | { ok: true; value: null } {
  if (!input.trim()) return { ok: true, value: null };
  return readMoney(input);
}

/** Centavos → editable string ("1234.5" style without symbol), exact. */
export function moneyToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = toDecimalString(value);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

/** Basis points → "42%" (or "42.5%" when `precise`). */
export function formatBps(bps: number, precise = false): string {
  const pct = bps / 100;
  return `${precise ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct)}%`;
}

/** "2026-11" ± n months. */
export function shiftMonth(key: string, delta: number): string {
  const first = `${key}-01`;
  return addMonthsClamped(first, delta, 1).slice(0, 7);
}

/** First and last calendar day of a `YYYY-MM` month. */
export function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return { from: makeDate(y, m, 1), to: makeDate(y, m, daysInMonth(y, m)) };
}

/** "Mon"… for a 0-based weekday index starting Sunday. */
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Relative day phrase for upcoming items: "Today", "Tomorrow", "In 5 days", "3 days ago". */
export function relativeDay(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Split comma-separated tags into a clean, de-duplicated list. */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const t = raw.trim().replace(/^#/, '');
    if (t && !out.includes(t)) out.push(t.slice(0, 32));
  }
  return out.slice(0, 20);
}
