import type {
  Centavos,
  Confidence,
  EventDirection,
  EventKind,
  ForecastMode,
  IsoDate,
} from '@mm/types';
import { addDays, eachDay, endOfMonth, monthKey, startOfMonth } from './dates.js';
import { add, allocate, assertCentavos } from './money.js';
import {
  expandOccurrences,
  type EngineEvent,
  type Occurrence,
  type OccurrenceOverride,
} from './recurrence.js';

/** A monthly spending limit used to project day-to-day (unscheduled) spending. */
export interface BudgetInput {
  id?: string;
  /** `null` = overall monthly spending limit. */
  categoryId: string | null;
  limit: Centavos;
  /** Net spending already recorded in the current month for this category (or overall). */
  spentThisMonth: Centavos;
}

export interface ForecastInput {
  /** "Today" in the user's timezone. Day 0 of the forecast. */
  asOf: IsoDate;
  /** Number of days after `asOf` to project (7, 30, 90, 365…). */
  horizonDays: number;
  /** Actual net position at the end of `asOf` (already includes today's real transactions). */
  startingBalance: Centavos;
  events: readonly EngineEvent[];
  overrides?: readonly OccurrenceOverride[];
  budgets?: readonly BudgetInput[];
  mode?: ForecastMode;
  safetyBuffer?: Centavos;
  /** Project remaining budgeted spending evenly across each month. Default true. */
  includeBudgetedSpending?: boolean;
}

export interface ForecastItem {
  eventId: string;
  name: string;
  kind: EventKind;
  direction: EventDirection;
  confidence: Confidence;
  /** Positive amount used in this mode. */
  amount: Centavos;
  originalDate: IsoDate;
  overdue: boolean;
  installment: { index: number; count: number } | null;
}

export interface ForecastPoint {
  date: IsoDate;
  /** Projected net position at the end of the day. */
  balance: Centavos;
  inflow: Centavos;
  outflow: Centavos;
  /** Projected unscheduled spending from budgets on this day. */
  budgetedSpending: Centavos;
  items: ForecastItem[];
}

export interface ForecastResult {
  asOf: IsoDate;
  endDate: IsoDate;
  mode: ForecastMode;
  horizonDays: number;
  startingBalance: Centavos;
  safetyBuffer: Centavos;
  points: ForecastPoint[];
  endingBalance: Centavos;
  lowest: { balance: Centavos; date: IsoDate };
  /** Balance at the end of the current month, when inside the horizon. */
  monthEnd: { balance: Centavos; date: IsoDate } | null;
  totals: { inflow: Centavos; outflow: Centavos; budgetedSpending: Centavos };
  firstShortfallDate: IsoDate | null;
  firstBelowBufferDate: IsoDate | null;
  /**
   * Most you could spend today without the projected balance dropping below the safety buffer
   * at any point within the horizon. Never negative.
   */
  safeToSpend: Centavos;
  /** Inflows left out because they are not reliable enough for this mode. */
  excludedInflow: { amount: Centavos; count: number };
  /** Human-readable statements explaining how the projection was computed. */
  assumptions: string[];
}

/**
 * Whether an occurrence counts in a mode, and at what amount.
 *
 * | mode         | inflows counted               | inflow amount | outflows counted     | outflow amount |
 * |--------------|-------------------------------|---------------|----------------------|----------------|
 * | conservative | confirmed only                | min of range  | all                  | max of range   |
 * | expected     | confirmed + likely            | expected      | all                  | expected       |
 * | optimistic   | all                           | max of range  | confirmed + likely   | min of range   |
 */
export function amountForMode(occ: Occurrence, mode: ForecastMode): Centavos | null {
  const expected = occ.amount;
  const low = occ.amountMin ?? expected;
  const high = occ.amountMax ?? expected;
  if (occ.direction === 'inflow') {
    if (mode === 'conservative') return occ.confidence === 'confirmed' ? low : null;
    if (mode === 'expected') return occ.confidence === 'uncertain' ? null : expected;
    return high;
  }
  if (mode === 'conservative') return high;
  if (mode === 'expected') return expected;
  return occ.confidence === 'uncertain' ? null : low;
}

const SPENDING_KINDS: readonly EventKind[] = ['expense', 'bill', 'purchase'];

/** Deterministic daily projection of the user's net position. */
export function buildForecast(input: ForecastInput): ForecastResult {
  const mode = input.mode ?? 'expected';
  const safetyBuffer = input.safetyBuffer ?? 0;
  const includeBudgets = input.includeBudgetedSpending ?? true;
  assertCentavos(input.startingBalance, 'startingBalance');
  assertCentavos(safetyBuffer, 'safetyBuffer');
  const horizonDays = Math.max(0, Math.floor(input.horizonDays));
  const asOf = input.asOf;
  const endDate = addDays(asOf, horizonDays);
  // Expand to the end of the last month so budget netting sees the whole month's schedule.
  const expandTo = endOfMonth(endDate);
  const occurrences = expandOccurrences(input.events, input.overrides ?? [], {
    from: asOf,
    to: expandTo,
    includeOverdue: true,
  });

  const assumptions: string[] = [
    `Starts from your actual net position on ${asOf}; nothing projected changes recorded balances.`,
    describeMode(mode),
  ];

  // ── Scheduled items per day ──────────────────────────────────────────
  const itemsByDate = new Map<IsoDate, ForecastItem[]>();
  const counted: Array<{ occ: Occurrence; amount: Centavos }> = [];
  let excludedAmount = 0;
  let excludedCount = 0;
  for (const occ of occurrences) {
    const amount = amountForMode(occ, mode);
    if (amount === null) {
      if (occ.direction === 'inflow' && occ.date <= endDate) {
        excludedAmount = add(excludedAmount, occ.amount);
        excludedCount += 1;
      }
      continue;
    }
    counted.push({ occ, amount });
    if (occ.date > endDate) continue;
    const list = itemsByDate.get(occ.date) ?? [];
    list.push({
      eventId: occ.eventId,
      name: occ.name,
      kind: occ.kind,
      direction: occ.direction,
      confidence: occ.confidence,
      amount,
      originalDate: occ.originalDate,
      overdue: occ.overdue,
      installment: occ.installmentCount ? { index: occ.index, count: occ.installmentCount } : null,
    });
    itemsByDate.set(occ.date, list);
  }
  if (excludedCount > 0) {
    assumptions.push(
      `${excludedCount} less-certain income payment(s) are excluded in the ${mode} view.`,
    );
  }
  if (occurrences.some((o) => o.overdue)) {
    assumptions.push(
      'Planned items whose date has passed but are not yet paid are treated as due today.',
    );
  }

  // ── Budgeted (unscheduled) spending ──────────────────────────────────
  const burnByDate = includeBudgets
    ? budgetBurn(input.budgets ?? [], counted, asOf, endDate)
    : new Map();
  if (includeBudgets && (input.budgets?.length ?? 0) > 0) {
    assumptions.push(
      'Remaining budgets are spread evenly over the rest of each month, net of scheduled items in the same category.',
    );
  } else if (includeBudgets) {
    assumptions.push(
      'No budgets are set, so day-to-day spending is not projected — only scheduled items.',
    );
  }

  // ── Roll forward ─────────────────────────────────────────────────────
  const points: ForecastPoint[] = [];
  let balance = input.startingBalance;
  let totalIn = 0;
  let totalOut = 0;
  let totalBurn = 0;
  let lowest = { balance: input.startingBalance, date: asOf };
  let firstShortfallDate: IsoDate | null = input.startingBalance < 0 ? asOf : null;
  let firstBelowBufferDate: IsoDate | null = input.startingBalance < safetyBuffer ? asOf : null;
  let monthEnd: ForecastResult['monthEnd'] = null;
  const currentMonthEnd = endOfMonth(asOf);

  for (const date of eachDay(asOf, endDate)) {
    const items = itemsByDate.get(date) ?? [];
    let inflow = 0;
    let outflow = 0;
    for (const item of items) {
      if (item.direction === 'inflow') inflow = add(inflow, item.amount);
      else outflow = add(outflow, item.amount);
    }
    const burn = burnByDate.get(date) ?? 0;
    balance = add(balance, inflow, -outflow, -burn);
    totalIn = add(totalIn, inflow);
    totalOut = add(totalOut, outflow);
    totalBurn = add(totalBurn, burn);
    points.push({ date, balance, inflow, outflow, budgetedSpending: burn, items });
    if (balance < lowest.balance) lowest = { balance, date };
    if (firstShortfallDate === null && balance < 0) firstShortfallDate = date;
    if (firstBelowBufferDate === null && balance < safetyBuffer) firstBelowBufferDate = date;
    if (date === currentMonthEnd) monthEnd = { balance, date };
  }

  return {
    asOf,
    endDate,
    mode,
    horizonDays,
    startingBalance: input.startingBalance,
    safetyBuffer,
    points,
    endingBalance: balance,
    lowest,
    monthEnd,
    totals: { inflow: totalIn, outflow: totalOut, budgetedSpending: totalBurn },
    firstShortfallDate,
    firstBelowBufferDate,
    safeToSpend: Math.max(0, lowest.balance - safetyBuffer),
    excludedInflow: { amount: excludedAmount, count: excludedCount },
    assumptions,
  };
}

function describeMode(mode: ForecastMode): string {
  switch (mode) {
    case 'conservative':
      return 'Conservative: only confirmed income at its lowest expected amount; every expense at its highest.';
    case 'expected':
      return 'Expected: confirmed and likely income at expected amounts; uncertain income is excluded.';
    case 'optimistic':
      return 'Optimistic: all income including uncertain payments at their highest amounts; uncertain expenses excluded.';
  }
}

/**
 * Spread each budget's remaining allowance evenly across the remaining days of each month,
 * after subtracting scheduled outflows in the same category (so they are not counted twice).
 */
function budgetBurn(
  budgets: readonly BudgetInput[],
  counted: ReadonlyArray<{ occ: Occurrence; amount: Centavos }>,
  asOf: IsoDate,
  endDate: IsoDate,
): Map<IsoDate, Centavos> {
  const burn = new Map<IsoDate, Centavos>();
  if (budgets.length === 0) return burn;
  const currentMonth = monthKey(asOf);

  const scheduledIn = (month: string, categoryId: string | null) => {
    let total = 0;
    for (const { occ, amount } of counted) {
      if (occ.direction !== 'outflow' || !SPENDING_KINDS.includes(occ.kind)) continue;
      if (monthKey(occ.date) !== month) continue;
      if (categoryId !== null && occ.categoryId !== categoryId) continue;
      total = add(total, amount);
    }
    return total;
  };

  for (
    let monthStart = startOfMonth(asOf);
    monthStart <= endDate;
    monthStart = addDays(endOfMonth(monthStart), 1)
  ) {
    const month = monthKey(monthStart);
    const isCurrent = month === currentMonth;
    const from = isCurrent ? asOf : monthStart;
    const days = eachDay(from, endOfMonth(monthStart));

    const categoryBudgets = budgets.filter((b) => b.categoryId !== null);
    let categoryRemainingTotal = 0;
    const spreads: Centavos[] = [];
    for (const b of categoryBudgets) {
      const remaining = Math.max(
        0,
        b.limit - (isCurrent ? b.spentThisMonth : 0) - scheduledIn(month, b.categoryId),
      );
      categoryRemainingTotal = add(categoryRemainingTotal, remaining);
      spreads.push(remaining);
    }
    for (const overall of budgets.filter((b) => b.categoryId === null)) {
      const remaining = Math.max(
        0,
        overall.limit -
          (isCurrent ? overall.spentThisMonth : 0) -
          scheduledIn(month, null) -
          categoryRemainingTotal,
      );
      spreads.push(remaining);
    }

    for (const amount of spreads) {
      if (amount <= 0) continue;
      const pieces = allocate(amount, days.length);
      days.forEach((date, i) => {
        if (date > endDate) return;
        burn.set(date, add(burn.get(date) ?? 0, pieces[i] ?? 0));
      });
    }
  }
  return burn;
}
