import type { Centavos, IsoDate } from '@mm/types';
import { diffDays } from './dates.js';
import { basisPoints, multiplyRatio } from './money.js';

export type BudgetState = 'ok' | 'approaching' | 'over_pace' | 'exceeded';

export interface BudgetStatusInput {
  limit: Centavos;
  /** Net spending in the period so far. */
  spent: Centavos;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  today: IsoDate;
  /** Utilisation that counts as "approaching" (basis points). Default 8000 = 80%. */
  approachingBps?: number;
  /** Minimum elapsed days before pace warnings fire (avoids day-1 noise). Default 3. */
  minDaysForPace?: number;
}

export interface BudgetStatus {
  limit: Centavos;
  spent: Centavos;
  remaining: Centavos;
  utilizationBps: number;
  totalDays: number;
  /** Days elapsed including today. */
  elapsedDays: number;
  /** Days left including today. */
  remainingDays: number;
  /** Spending expected by today if spending evenly. */
  expectedSpendToDate: Centavos;
  /** Spending at the current daily rate by period end. */
  projectedSpend: Centavos;
  /** Spent ÷ expected-to-date in bps (10000 = exactly on pace). */
  paceBps: number;
  /** What can be spent per day for the rest of the period and still finish within the limit. */
  dailyAllowance: Centavos;
  state: BudgetState;
}

/** Budget utilisation and spending pace for one period. */
export function budgetStatus(input: BudgetStatusInput): BudgetStatus {
  const { limit, spent, periodStart, periodEnd, today } = input;
  const approachingBps = input.approachingBps ?? 8_000;
  const minDays = input.minDaysForPace ?? 3;
  const totalDays = diffDays(periodStart, periodEnd) + 1;
  const elapsedDays = Math.min(totalDays, Math.max(0, diffDays(periodStart, today) + 1));
  const remainingDays = Math.max(0, totalDays - elapsedDays + 1);
  const remaining = limit - spent;
  const expectedSpendToDate = multiplyRatio(limit, elapsedDays, totalDays);
  const projectedSpend = elapsedDays > 0 ? multiplyRatio(spent, totalDays, elapsedDays) : spent;
  const utilizationBps = basisPoints(spent, limit);
  const paceBps = expectedSpendToDate > 0 ? basisPoints(spent, expectedSpendToDate) : 0;
  const dailyAllowance =
    remaining > 0 && remainingDays > 0 ? Math.floor(remaining / remainingDays) : 0;

  let state: BudgetState = 'ok';
  if (spent > limit) state = 'exceeded';
  else if (limit > 0 && utilizationBps >= approachingBps) state = 'approaching';
  else if (elapsedDays >= minDays && projectedSpend > limit) state = 'over_pace';

  return {
    limit,
    spent,
    remaining,
    utilizationBps,
    totalDays,
    elapsedDays,
    remainingDays,
    expectedSpendToDate,
    projectedSpend,
    paceBps,
    dailyAllowance,
    state,
  };
}
