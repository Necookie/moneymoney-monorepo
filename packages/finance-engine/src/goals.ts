import type { Centavos, IsoDate } from '@mm/types';
import { addMonthsClamped } from './dates.js';
import { basisPoints } from './money.js';

export interface GoalInput {
  target: Centavos;
  /** Amount already allocated to the goal. */
  current: Centavos;
  targetDate?: IsoDate | null;
  /** Planned monthly contribution. */
  monthlyContribution?: Centavos | null;
}

export interface GoalProjection {
  remaining: Centavos;
  progressBps: number;
  complete: boolean;
  /** Monthly contributions still needed at the planned rate (null without a contribution plan). */
  monthsToComplete: number | null;
  estimatedCompletionDate: IsoDate | null;
  /** Monthly contributions possible before the target date (contributions on today's day-of-month). */
  contributionsBeforeTarget: number | null;
  /** Contribution per month needed to hit the target date. */
  requiredMonthlyContribution: Centavos | null;
  /** null when there is no target date or no contribution plan to judge against. */
  onTrack: boolean | null;
}

export function projectGoal(goal: GoalInput, today: IsoDate): GoalProjection {
  const remaining = Math.max(0, goal.target - goal.current);
  const progressBps = Math.min(10_000, Math.max(0, basisPoints(goal.current, goal.target)));
  const complete = remaining === 0;
  const monthly = goal.monthlyContribution ?? 0;

  const monthsToComplete = complete ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null;
  const estimatedCompletionDate =
    monthsToComplete === null
      ? null
      : monthsToComplete === 0
        ? today
        : addMonthsClamped(today, monthsToComplete);

  let contributionsBeforeTarget: number | null = null;
  let requiredMonthlyContribution: Centavos | null = null;
  if (goal.targetDate) {
    let n = 0;
    while (n < 1_200 && addMonthsClamped(today, n + 1) <= goal.targetDate) n++;
    contributionsBeforeTarget = n;
    requiredMonthlyContribution = complete ? 0 : n > 0 ? Math.ceil(remaining / n) : remaining;
  }

  let onTrack: boolean | null = null;
  if (complete) onTrack = true;
  else if (goal.targetDate && estimatedCompletionDate)
    onTrack = estimatedCompletionDate <= goal.targetDate;
  else if (goal.targetDate && monthsToComplete === null) onTrack = false;

  return {
    remaining,
    progressBps,
    complete,
    monthsToComplete,
    estimatedCompletionDate,
    contributionsBeforeTarget,
    requiredMonthlyContribution,
    onTrack,
  };
}
