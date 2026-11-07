import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  MoneyError,
  parseMoney,
  todayInTimeZone,
} from '@mm/finance-engine';
import { config } from './config';

export { formatDate, formatMoney, formatMoneyCompact };

/** Today's calendar date in the user's timezone (Asia/Manila). */
export function today(): string {
  return todayInTimeZone(config.timeZone);
}

/** Parse user input into centavos; returns null instead of throwing. Never uses floats. */
export function tryParseMoney(input: string): number | null {
  if (!input.trim()) return null;
  try {
    return parseMoney(input);
  } catch (err) {
    if (err instanceof MoneyError) return null;
    throw err;
  }
}

/** "Today", "Yesterday", "Tomorrow" or "Nov 7". */
export function relativeDay(date: string, ref: string = today()): string {
  if (date === ref) return 'Today';
  const d = Date.parse(`${date}T00:00:00Z`);
  const r = Date.parse(`${ref}T00:00:00Z`);
  const diff = Math.round((d - r) / 86_400_000);
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return formatDate(date, date.slice(0, 4) !== ref.slice(0, 4));
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function percent(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

export const TYPE_LABEL = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
} as const;
