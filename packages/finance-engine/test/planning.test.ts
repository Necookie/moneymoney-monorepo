import { describe, expect, it } from 'vitest';
import {
  assessAffordability,
  budgetStatus,
  compareScenarios,
  evaluateAlerts,
  projectGoal,
  type ForecastInput,
} from '../src/index.js';
import { ev, peso } from './fixtures.js';

const forecast: ForecastInput = {
  asOf: '2026-11-07',
  horizonDays: 90,
  startingBalance: peso(60_000),
  safetyBuffer: peso(10_000),
  includeBudgetedSpending: false,
  events: [
    ev({
      id: 'salary',
      direction: 'inflow',
      kind: 'salary',
      amount: peso(35_000),
      startDate: '2026-11-30',
      status: 'recurring',
      recurrence: { frequency: 'monthly', monthEndRule: 'last_day' },
    }),
    ev({
      id: 'rent',
      kind: 'bill',
      amount: peso(20_000),
      startDate: '2026-12-01',
      status: 'recurring',
      recurrence: { frequency: 'monthly' },
    }),
    ev({
      id: 'living',
      kind: 'expense',
      amount: peso(12_000),
      startDate: '2026-11-20',
      status: 'recurring',
      recurrence: { frequency: 'monthly' },
    }),
  ],
};

describe('budgets', () => {
  it('computes utilisation, pace and daily allowance', () => {
    const s = budgetStatus({
      limit: peso(10_000),
      spent: peso(6_000),
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      today: '2026-11-10',
    });
    expect(s.elapsedDays).toBe(10);
    expect(s.remainingDays).toBe(21);
    expect(s.projectedSpend).toBe(peso(18_000));
    expect(s.state).toBe('over_pace');
    expect(s.dailyAllowance).toBe(Math.floor(peso(4_000) / 21));
    expect(
      budgetStatus({
        limit: 100,
        spent: 85,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        today: '2026-11-28',
      }).state,
    ).toBe('approaching');
    expect(
      budgetStatus({
        limit: 100,
        spent: 101,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        today: '2026-11-05',
      }).state,
    ).toBe('exceeded');
    expect(
      budgetStatus({
        limit: 100,
        spent: 50,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        today: '2026-11-01',
      }).state,
    ).toBe('ok');
  });
});

describe('goals', () => {
  it('projects completion and required contribution', () => {
    const p = projectGoal(
      {
        target: peso(100_000),
        current: peso(40_000),
        targetDate: '2027-05-07',
        monthlyContribution: peso(10_000),
      },
      '2026-11-07',
    );
    expect(p.progressBps).toBe(4_000);
    expect(p.monthsToComplete).toBe(6);
    expect(p.estimatedCompletionDate).toBe('2027-05-07');
    expect(p.onTrack).toBe(true);
    const late = projectGoal(
      {
        target: peso(100_000),
        current: 0,
        targetDate: '2027-02-07',
        monthlyContribution: peso(10_000),
      },
      '2026-11-07',
    );
    expect(late.onTrack).toBe(false);
    expect(late.requiredMonthlyContribution).toBe(Math.ceil(peso(100_000) / 3));
    expect(projectGoal({ target: 100, current: 150 }, '2026-11-07')).toMatchObject({
      complete: true,
      progressBps: 10_000,
      onTrack: true,
    });
  });
});

describe('scenarios', () => {
  it('compares delay, loss, purchase, postponement and spending cuts', () => {
    const withLaptop: ForecastInput = {
      ...forecast,
      events: [
        ...forecast.events,
        ev({ id: 'laptop', kind: 'purchase', amount: peso(25_000), startDate: '2026-12-15' }),
      ],
    };
    const results = compareScenarios(withLaptop, [
      { type: 'salary_delayed', days: 10 },
      { type: 'income_lost', fromDate: '2027-01-01' },
      { type: 'purchase_added', amount: peso(15_000), date: '2026-11-20', name: 'Phone' },
      { type: 'purchase_postponed', eventId: 'laptop', newDate: '2027-03-01' },
      { type: 'spending_reduced', percent: 25 },
    ]);
    const byType = Object.fromEntries(results.map((r) => [r.scenario.type, r]));
    expect(byType.baseline!.delta).toEqual({ endingBalance: 0, lowestBalance: 0 });
    // Delay: last salary in window slides out of the 90-day horizon.
    expect(byType.salary_delayed!.delta.endingBalance).toBe(-peso(35_000));
    // Only the Jan 31 salary falls inside the 90-day window after Jan 1.
    expect(byType.income_lost!.delta.endingBalance).toBe(-peso(35_000));
    expect(byType.purchase_added!.delta.endingBalance).toBe(-peso(15_000));
    expect(byType.purchase_postponed!.delta.endingBalance).toBe(peso(25_000));
    expect(byType.spending_reduced!.delta.endingBalance).toBe(peso(3_000) * 3);
    // Baseline inputs untouched.
    expect(withLaptop.events).toHaveLength(4);
  });
});

describe('affordability', () => {
  it('distinguishes affordable today from affordable without compromising obligations', () => {
    const tight = assessAffordability({
      forecast,
      purchase: { amount: peso(45_000), date: '2026-11-08' },
    });
    expect(tight.verdict).toBe('tight'); // dips under the ₱10k buffer but never negative
    const r = assessAffordability({
      forecast,
      purchase: { amount: peso(55_000), date: '2026-11-08' },
    });
    expect(r.affordableToday).toBe(true);
    expect(r.affordableWithoutCompromise).toBe(false);
    expect(r.verdict).toBe('creates_shortfall');
    expect(r.affectedObligations.length).toBeGreaterThan(0);
    expect(r.baseline.startingBalance).toBe(forecast.startingBalance);
  });

  it('is comfortable when the buffer holds even on confirmed income', () => {
    const r = assessAffordability({
      forecast,
      purchase: { amount: peso(5_000), date: '2026-11-08' },
    });
    expect(r.verdict).toBe('comfortable');
    expect(r.affordableWithoutCompromise).toBe(true);
  });

  it('flags emergency fund compromise and installment first payment', () => {
    const r = assessAffordability({
      forecast,
      purchase: { amount: peso(30_000), date: '2026-11-08', installments: 3 },
      emergencyFundReserved: peso(30_000),
    });
    expect(r.firstPayment).toBe(peso(10_000));
    expect(r.verdict).toBe('compromises_emergency_fund');
    expect(r.emergencyFund.compromised).toBe(true);
  });

  it('reports not affordable today when the paying account is short', () => {
    const r = assessAffordability({
      forecast,
      purchase: { amount: peso(5_000), date: '2026-11-08' },
      paymentAccountBalance: peso(1_000),
    });
    expect(r.verdict).toBe('not_affordable_today');
    expect(r.affordableToday).toBe(false);
  });
});

describe('alerts', () => {
  it('raises budget, shortfall, uncertain-income, purchase and goal alerts with stable fingerprints', () => {
    const input = {
      today: '2026-11-07',
      forecast: {
        ...forecast,
        startingBalance: peso(25_000),
        events: [
          ...forecast.events.filter((e) => e.id !== 'salary'),
          ev({
            id: 'salary',
            direction: 'inflow' as const,
            kind: 'salary' as const,
            amount: peso(35_000),
            confidence: 'likely' as const,
            startDate: '2026-11-30',
            status: 'recurring' as const,
            recurrence: { frequency: 'monthly' as const },
          }),
          ev({ id: 'tv', kind: 'purchase' as const, amount: peso(9_000), startDate: '2026-11-15' }),
        ],
      },
      budgets: [
        {
          id: 'food',
          name: 'Food',
          limit: peso(8_000),
          spent: peso(9_000),
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
        },
        {
          id: 'fun',
          name: 'Fun',
          limit: peso(5_000),
          spent: peso(4_200),
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
        },
        {
          id: 'transport',
          name: 'Transport',
          limit: peso(3_000),
          spent: peso(1_500),
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
        },
      ],
      goals: [
        {
          id: 'efund',
          name: 'Emergency fund',
          target: peso(100_000),
          current: 0,
          targetDate: '2027-01-01',
          monthlyContribution: peso(5_000),
        },
      ],
    };
    const alerts = evaluateAlerts(input);
    const rules = alerts.map((a) => a.rule);
    expect(rules).toContain('budget_exceeded');
    expect(rules).toContain('budget_approaching');
    expect(rules).toContain('spending_pace');
    expect(rules).toContain('obligations_exceed_funds');
    expect(rules).toContain('below_safety_buffer');
    expect(rules).toContain('goal_off_track');
    expect(alerts[0]!.severity).toBe('critical');
    for (const a of alerts) {
      expect(a.reason.length).toBeGreaterThan(0);
      expect(a.suggestion.length).toBeGreaterThan(0);
    }
    // Same inputs → same fingerprints (no duplicate alerts on re-evaluation).
    expect(evaluateAlerts(input).map((a) => a.fingerprint)).toEqual(
      alerts.map((a) => a.fingerprint),
    );
    expect(new Set(alerts.map((a) => a.fingerprint)).size).toBe(alerts.length);
  });

  it('flags uncertain-income risk and attributes shortfalls to a planned purchase', () => {
    const alerts = evaluateAlerts({
      today: '2026-11-07',
      forecast: {
        asOf: '2026-11-07',
        horizonDays: 60,
        startingBalance: peso(30_000),
        safetyBuffer: peso(5_000),
        includeBudgetedSpending: false,
        events: [
          ev({
            id: 'gig',
            direction: 'inflow',
            kind: 'freelance',
            amount: peso(40_000),
            confidence: 'likely',
            startDate: '2026-12-10',
          }),
          ev({ id: 'rent', kind: 'bill', amount: peso(20_000), startDate: '2026-12-15' }),
          ev({ id: 'phone', kind: 'purchase', amount: peso(30_000), startDate: '2026-11-20' }),
        ],
      },
      budgets: [],
      goals: [],
    });
    const rules = alerts.map((a) => a.rule);
    expect(rules).toContain('purchase_shortfall');
    expect(alerts.find((a) => a.rule === 'purchase_shortfall')!.subjectId).toBe('phone');
  });
});
