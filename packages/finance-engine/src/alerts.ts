import type { AlertRule, AlertSeverity, Centavos, IsoDate } from '@mm/types';
import { addDays, monthKey } from './dates.js';
import { budgetStatus } from './budgets.js';
import { buildForecast, type ForecastInput } from './forecast.js';
import { formatMoney } from './money.js';
import { projectGoal } from './goals.js';
import { expandOccurrences } from './recurrence.js';

export interface AlertCandidate {
  rule: AlertRule;
  severity: AlertSeverity;
  /**
   * Stable de-duplication key. The same situation in the same period always yields the same
   * fingerprint, so storage can upsert instead of re-alerting (and respect dismissals).
   */
  fingerprint: string;
  title: string;
  reason: string;
  amount: Centavos | null;
  affectedDate: IsoDate | null;
  suggestion: string;
  subjectId: string | null;
}

export interface AlertBudget {
  id: string;
  name: string;
  limit: Centavos;
  spent: Centavos;
  periodStart: IsoDate;
  periodEnd: IsoDate;
}

export interface AlertGoal {
  id: string;
  name: string;
  target: Centavos;
  current: Centavos;
  targetDate: IsoDate | null;
  monthlyContribution: Centavos | null;
}

export interface AlertInput {
  today: IsoDate;
  /** Baseline forecast inputs; the evaluator runs expected and conservative projections itself. */
  forecast: ForecastInput;
  budgets: readonly AlertBudget[];
  goals: readonly AlertGoal[];
  /** Window for obligation checks (default 30 days). */
  obligationWindowDays?: number;
  /** Max planned purchases to attribute shortfalls to (each costs one extra projection). */
  maxPurchaseChecks?: number;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Rule-based financial warnings. Deterministic; no ML involved. */
export function evaluateAlerts(input: AlertInput): AlertCandidate[] {
  const { today } = input;
  const out: AlertCandidate[] = [];
  const fmt = (c: Centavos) => formatMoney(c);
  const buffer = input.forecast.safetyBuffer ?? 0;

  // ── Budgets: exceeded > approaching > pace (one alert per budget per month) ──
  for (const b of input.budgets) {
    const s = budgetStatus({
      limit: b.limit,
      spent: b.spent,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      today,
    });
    const period = monthKey(b.periodStart);
    if (s.state === 'exceeded') {
      out.push({
        rule: 'budget_exceeded',
        severity: 'critical',
        fingerprint: `budget_exceeded:${b.id}:${period}`,
        title: `${b.name} budget exceeded`,
        reason: `You've spent ${fmt(b.spent)} of your ${fmt(b.limit)} ${b.name} budget — ${fmt(-s.remaining)} over.`,
        amount: -s.remaining,
        affectedDate: today,
        suggestion: `Pause ${b.name} spending until ${b.periodEnd}, or raise the budget if it was too low.`,
        subjectId: b.id,
      });
    } else if (s.state === 'approaching') {
      out.push({
        rule: 'budget_approaching',
        severity: 'warning',
        fingerprint: `budget_approaching:${b.id}:${period}`,
        title: `${b.name} budget almost used`,
        reason: `${Math.floor(s.utilizationBps / 100)}% used with ${s.remainingDays} day(s) left; ${fmt(s.remaining)} remains.`,
        amount: s.remaining,
        affectedDate: b.periodEnd,
        suggestion: `Keep ${b.name} spending under ${fmt(s.dailyAllowance)} per day to stay within budget.`,
        subjectId: b.id,
      });
    } else if (s.state === 'over_pace') {
      out.push({
        rule: 'spending_pace',
        severity: 'warning',
        fingerprint: `spending_pace:${b.id}:${period}`,
        title: `${b.name} spending is running fast`,
        reason: `At this pace you'll spend about ${fmt(s.projectedSpend)} against a ${fmt(b.limit)} budget.`,
        amount: s.projectedSpend - b.limit,
        affectedDate: b.periodEnd,
        suggestion: `Limit ${b.name} to ${fmt(s.dailyAllowance)} per day for the rest of the month.`,
        subjectId: b.id,
      });
    }
  }

  // ── Forecast-based risks ────────────────────────────────────────────
  const expected = buildForecast({ ...input.forecast, mode: 'expected' });
  const conservative = buildForecast({ ...input.forecast, mode: 'conservative' });
  const windowEnd = addDays(today, input.obligationWindowDays ?? 30);

  const conservativeShortfall = conservative.firstShortfallDate;
  if (conservativeShortfall && conservativeShortfall <= windowEnd) {
    const point = conservative.points.find((p) => p.date === conservativeShortfall);
    out.push({
      rule: 'obligations_exceed_funds',
      severity: 'critical',
      fingerprint: `obligations_exceed_funds:${monthKey(conservativeShortfall)}`,
      title: 'Upcoming obligations exceed your funds',
      reason: `Counting only confirmed income, your balance reaches ${fmt(point?.balance ?? conservative.lowest.balance)} on ${conservativeShortfall}.`,
      amount: point?.balance ?? conservative.lowest.balance,
      affectedDate: conservativeShortfall,
      suggestion:
        'Postpone planned purchases, move money from savings, or confirm expected income before then.',
      subjectId: null,
    });
  }

  if (expected.firstBelowBufferDate) {
    const date = expected.firstBelowBufferDate;
    const negative = expected.firstShortfallDate !== null;
    out.push({
      rule: 'below_safety_buffer',
      severity: negative ? 'critical' : 'warning',
      fingerprint: `below_safety_buffer:${monthKey(date)}`,
      title: negative
        ? 'Projected balance goes negative'
        : 'Balance projected below your safety buffer',
      reason: negative
        ? `Your expected balance turns negative on ${expected.firstShortfallDate} and bottoms out at ${fmt(expected.lowest.balance)} on ${expected.lowest.date}.`
        : `Your expected balance falls below your ${fmt(buffer)} safety buffer on ${date} (low of ${fmt(expected.lowest.balance)}).`,
      amount: expected.lowest.balance,
      affectedDate: date,
      suggestion: 'Reduce discretionary spending or move planned purchases after your next income.',
      subjectId: null,
    });
  }

  if (
    expected.lowest.balance >= 0 &&
    conservative.lowest.balance < 0 &&
    !(conservativeShortfall && conservativeShortfall <= windowEnd)
  ) {
    out.push({
      rule: 'uncertain_income_risk',
      severity: 'warning',
      fingerprint: `uncertain_income_risk:${monthKey(conservative.lowest.date)}`,
      title: 'Your plan depends on uncertain income',
      reason: `Without unconfirmed income your balance would fall to ${fmt(conservative.lowest.balance)} on ${conservative.lowest.date}.`,
      amount: conservative.lowest.balance,
      affectedDate: conservative.lowest.date,
      suggestion: 'Confirm pending client payments or keep extra cash until they arrive.',
      subjectId: null,
    });
  }

  // ── Planned purchases that cause a buffer breach on their own ─────────
  if (expected.lowest.balance < buffer) {
    const purchases = expandOccurrences(input.forecast.events, input.forecast.overrides ?? [], {
      from: today,
      to: expected.endDate,
    }).filter((o) => o.direction === 'outflow' && o.kind === 'purchase' && o.status === 'planned');
    const seen = new Set<string>();
    for (const occ of purchases) {
      if (seen.has(occ.eventId) || seen.size >= (input.maxPurchaseChecks ?? 10)) continue;
      seen.add(occ.eventId);
      const without = buildForecast({
        ...input.forecast,
        mode: 'expected',
        events: input.forecast.events.filter((e) => e.id !== occ.eventId),
      });
      if (without.lowest.balance >= buffer) {
        out.push({
          rule: 'purchase_shortfall',
          severity: 'warning',
          fingerprint: `purchase_shortfall:${occ.eventId}`,
          title: `${occ.name} would strain your budget`,
          reason: `Without it your balance stays above your safety buffer; with it, it falls to ${fmt(expected.lowest.balance)} on ${expected.lowest.date}.`,
          amount: occ.amount,
          affectedDate: occ.date,
          suggestion: `Postpone ${occ.name}, split it into installments, or reduce its budget.`,
          subjectId: occ.eventId,
        });
      }
    }
  }

  // ── Goals ────────────────────────────────────────────────────────────
  for (const g of input.goals) {
    const p = projectGoal(g, today);
    if (p.onTrack !== false || !g.targetDate) continue;
    out.push({
      rule: 'goal_off_track',
      severity: 'warning',
      fingerprint: `goal_off_track:${g.id}:${monthKey(today)}`,
      title: `${g.name} is unlikely to be reached on time`,
      reason: p.estimatedCompletionDate
        ? `At the current plan you'd reach it around ${p.estimatedCompletionDate}, after your ${g.targetDate} target.`
        : `There's no monthly contribution planned, and ${fmt(p.remaining)} is still needed by ${g.targetDate}.`,
      amount: p.remaining,
      affectedDate: g.targetDate,
      suggestion: `Contribute about ${fmt(p.requiredMonthlyContribution ?? p.remaining)} per month, or move the target date.`,
      subjectId: g.id,
    });
  }

  // De-duplicate by fingerprint and order by severity.
  const unique = new Map<string, AlertCandidate>();
  for (const a of out) if (!unique.has(a.fingerprint)) unique.set(a.fingerprint, a);
  return [...unique.values()].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
}
