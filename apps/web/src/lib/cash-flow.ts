/**
 * Pure transformation of `/forecast` responses into chart rows (unit-tested with `node --test`).
 *
 * Honesty rule: actual history and projection are separate series. The projection starts at
 * today (anchored to the actual balance) and is never merged into the "actual" line.
 */
import type { ForecastResponse } from '@mm/validation';

export type ForecastItem = ForecastResponse['forecast']['points'][number]['items'][number];

export interface CashFlowRow {
  date: string;
  /** Actual recorded balance (null after today). */
  actual: number | null;
  /** Projected balance in the selected mode (null before today). */
  projected: number | null;
  /** [conservative, optimistic] projection band (null before today or when unavailable). */
  band: [number, number] | null;
  inflow: number;
  outflow: number;
  budgetedSpending: number;
  items: ForecastItem[];
  isToday: boolean;
}

export interface CashFlowInput {
  history: ForecastResponse['history'];
  expected: ForecastResponse['forecast'];
  conservative?: ForecastResponse['forecast'] | null;
  optimistic?: ForecastResponse['forecast'] | null;
}

export function buildCashFlowRows(input: CashFlowInput): CashFlowRow[] {
  const { history, expected, conservative, optimistic } = input;
  const today = expected.asOf;
  const rows = new Map<string, CashFlowRow>();
  const empty = (date: string): CashFlowRow => ({
    date,
    actual: null,
    projected: null,
    band: null,
    inflow: 0,
    outflow: 0,
    budgetedSpending: 0,
    items: [],
    isToday: date === today,
  });

  for (const p of history) {
    if (p.date > today) continue;
    rows.set(p.date, { ...empty(p.date), actual: p.balance });
  }

  const low = new Map((conservative?.points ?? []).map((p) => [p.date, p.balance]));
  const high = new Map((optimistic?.points ?? []).map((p) => [p.date, p.balance]));

  for (const p of expected.points) {
    const row = rows.get(p.date) ?? empty(p.date);
    row.projected = p.balance;
    row.inflow = p.inflow;
    row.outflow = p.outflow;
    row.budgetedSpending = p.budgetedSpending;
    row.items = p.items;
    const lo = low.get(p.date);
    const hi = high.get(p.date);
    if (lo !== undefined && hi !== undefined) {
      row.band = [Math.min(lo, hi, p.balance), Math.max(lo, hi, p.balance)];
    }
    rows.set(p.date, row);
  }

  // Anchor the projection on today's actual balance so the dashed line starts where the solid
  // line ends (today's own scheduled items still show via the point's value on later days).
  const todayRow = rows.get(today);
  if (todayRow && todayRow.actual === null) todayRow.actual = expected.startingBalance;

  return [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Min/max across every plotted value (for a padded Y domain that always includes the buffer). */
export function valueExtent(rows: readonly CashFlowRow[], extra: number[] = []): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const take = (v: number | null | undefined) => {
    if (v === null || v === undefined) return;
    if (v < min) min = v;
    if (v > max) max = v;
  };
  for (const r of rows) {
    take(r.actual);
    take(r.projected);
    if (r.band) {
      take(r.band[0]);
      take(r.band[1]);
    }
  }
  extra.forEach(take);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0];
  return [min, max];
}

/** Rounded, padded domain so lines never touch the plot edges. */
export function niceDomain([min, max]: [number, number]): [number, number] {
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 100_00);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const step = magnitude(hi - lo);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

function magnitude(range: number): number {
  const exp = Math.floor(Math.log10(Math.max(range, 1)));
  return Math.max(100, 10 ** Math.max(0, exp - 1));
}
