/** Pure month-grid helpers for the Financial Calendar (unit-tested with `node --test`). */
import { addDays, dayOfWeek, endOfMonth } from '@mm/finance-engine';

export interface GridDay {
  date: string;
  inMonth: boolean;
}

/**
 * Weeks (Sunday-first) covering a `YYYY-MM` month, padded with days from the adjacent months so
 * every week has 7 days.
 */
export function monthGrid(monthKey: string): GridDay[][] {
  const first = `${monthKey}-01`;
  const last = endOfMonth(first);
  const start = addDays(first, -dayOfWeek(first));
  const end = addDays(last, 6 - dayOfWeek(last));
  const weeks: GridDay[][] = [];
  let week: GridDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    week.push({ date: d, inMonth: d.startsWith(monthKey) });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}

/** Group items by a date key, preserving order, returning entries sorted by date. */
export function groupByDate<T>(
  items: readonly T[],
  key: (item: T) => string,
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
