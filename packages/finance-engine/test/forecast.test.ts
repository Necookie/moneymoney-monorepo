import { describe, expect, it } from 'vitest';
import { buildForecast, type ForecastInput } from '../src/index.js';
import { ev, peso } from './fixtures.js';

const base: ForecastInput = {
  asOf: '2026-11-07',
  horizonDays: 60,
  startingBalance: peso(40_000),
  safetyBuffer: peso(10_000),
  events: [
    ev({
      id: 'salary',
      direction: 'inflow',
      kind: 'salary',
      amount: peso(30_000),
      startDate: '2026-11-15',
      status: 'recurring',
      recurrence: { frequency: 'semimonthly', dayOfMonth: 15, secondDayOfMonth: 31 },
    }),
    ev({
      id: 'rent',
      kind: 'bill',
      amount: peso(18_000),
      startDate: '2026-11-10',
      status: 'recurring',
      recurrence: { frequency: 'monthly' },
    }),
    ev({ id: 'laptop', kind: 'purchase', amount: peso(25_000), startDate: '2026-12-15' }),
    ev({
      id: 'client',
      direction: 'inflow',
      kind: 'contract',
      amount: peso(20_000),
      amountMin: peso(15_000),
      amountMax: peso(25_000),
      confidence: 'likely',
      startDate: '2026-11-25',
      status: 'recurring',
      recurrence: { frequency: 'monthly', endDate: '2026-12-31' },
    }),
    ev({
      id: 'bonus',
      direction: 'inflow',
      kind: 'income',
      amount: peso(50_000),
      confidence: 'uncertain',
      startDate: '2026-12-20',
    }),
  ],
};

describe('buildForecast', () => {
  it('follows projectedBalance = start + inflows − outflows, chronologically', () => {
    const r = buildForecast({ ...base, includeBudgetedSpending: false });
    expect(r.points).toHaveLength(61);
    expect(r.points[0]!.date).toBe('2026-11-07');
    let running = base.startingBalance;
    for (const p of r.points) {
      running += p.inflow - p.outflow;
      expect(p.balance).toBe(running);
    }
    const nov10 = r.points.find((p) => p.date === '2026-11-10')!;
    expect(nov10.balance).toBe(peso(40_000 - 18_000));
    expect(r.endingBalance).toBe(base.startingBalance + r.totals.inflow - r.totals.outflow);
  });

  it('planned purchases change projections but not the starting (actual) balance', () => {
    const r = buildForecast({ ...base, includeBudgetedSpending: false });
    const without = buildForecast({
      ...base,
      includeBudgetedSpending: false,
      events: base.events.filter((e) => e.id !== 'laptop'),
    });
    expect(r.startingBalance).toBe(without.startingBalance);
    expect(without.endingBalance - r.endingBalance).toBe(peso(25_000));
  });

  it('contract income stops after its end date', () => {
    const r = buildForecast({ ...base, horizonDays: 120, includeBudgetedSpending: false });
    const clientDates = r.points.flatMap((p) =>
      p.items.filter((i) => i.eventId === 'client').map(() => p.date),
    );
    expect(clientDates).toEqual(['2026-11-25', '2026-12-25']);
  });

  it('modes treat uncertain income and ranges differently', () => {
    const opts = { ...base, includeBudgetedSpending: false };
    const conservative = buildForecast({ ...opts, mode: 'conservative' });
    const expected = buildForecast({ ...opts, mode: 'expected' });
    const optimistic = buildForecast({ ...opts, mode: 'optimistic' });
    // Conservative: no likely client income, no uncertain bonus.
    expect(conservative.points.some((p) => p.items.some((i) => i.eventId === 'client'))).toBe(
      false,
    );
    // Expected: client at expected amount, bonus excluded.
    expect(expected.excludedInflow).toEqual({ amount: peso(50_000), count: 1 });
    // Optimistic: everything at max.
    expect(optimistic.endingBalance - expected.endingBalance).toBe(peso(50_000) + 2 * peso(5_000));
    expect(conservative.endingBalance).toBeLessThan(expected.endingBalance);
  });

  it('never treats uncertain income as spendable today', () => {
    const r = buildForecast({
      asOf: '2026-11-07',
      horizonDays: 30,
      startingBalance: peso(1_000),
      events: [
        ev({
          id: 'maybe',
          direction: 'inflow',
          kind: 'freelance',
          amount: peso(100_000),
          confidence: 'uncertain',
          startDate: '2026-11-08',
        }),
      ],
      mode: 'expected',
    });
    expect(r.safeToSpend).toBe(peso(1_000));
  });

  it('reports lowest balance, shortfall and buffer breach dates and safe-to-spend', () => {
    const r = buildForecast({
      asOf: '2026-11-07',
      horizonDays: 30,
      startingBalance: peso(20_000),
      safetyBuffer: peso(5_000),
      includeBudgetedSpending: false,
      events: [
        ev({ id: 'a', amount: peso(18_000), startDate: '2026-11-10' }),
        ev({ id: 'b', amount: peso(5_000), startDate: '2026-11-12' }),
        ev({
          id: 'pay',
          direction: 'inflow',
          kind: 'salary',
          amount: peso(30_000),
          startDate: '2026-11-15',
        }),
      ],
    });
    expect(r.firstBelowBufferDate).toBe('2026-11-10');
    expect(r.firstShortfallDate).toBe('2026-11-12');
    expect(r.lowest).toEqual({ balance: -peso(3_000), date: '2026-11-12' });
    expect(r.safeToSpend).toBe(0);
    expect(r.monthEnd).toEqual({ balance: peso(27_000), date: '2026-11-30' });
  });

  it('projects remaining budgets without double counting scheduled spending', () => {
    const r = buildForecast({
      asOf: '2026-11-21', // 10 days left including today
      horizonDays: 9,
      startingBalance: peso(50_000),
      events: [
        ev({ id: 'groceries', amount: peso(2_000), startDate: '2026-11-25', categoryId: 'food' }),
      ],
      budgets: [{ categoryId: 'food', limit: peso(10_000), spentThisMonth: peso(5_000) }],
    });
    // Remaining 5,000 − scheduled 2,000 = 3,000 spread over 10 days.
    expect(r.totals.budgetedSpending).toBe(peso(3_000));
    expect(r.points[0]!.budgetedSpending).toBe(peso(300));
    expect(r.endingBalance).toBe(peso(50_000 - 2_000 - 3_000));
  });

  it('is deterministic', () => {
    expect(buildForecast(base)).toEqual(buildForecast(base));
  });

  it('handles a 12-month horizon across a leap day', () => {
    const r = buildForecast({
      asOf: '2027-11-07',
      horizonDays: 365,
      startingBalance: 0,
      events: [
        ev({
          id: 'm',
          amount: 100,
          startDate: '2027-11-30',
          status: 'recurring',
          recurrence: { frequency: 'monthly' },
        }),
      ],
      includeBudgetedSpending: false,
    });
    const feb = r.points.find((p) => p.items.length > 0 && p.date.startsWith('2028-02'));
    expect(feb?.date).toBe('2028-02-29');
    expect(r.points).toHaveLength(366);
  });
});
