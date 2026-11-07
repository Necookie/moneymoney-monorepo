import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ForecastResponse } from '@mm/validation';
import { buildCashFlowRows, niceDomain, valueExtent } from './cash-flow.ts';
import { groupByDate, monthGrid } from './calendar.ts';

type Forecast = ForecastResponse['forecast'];

function forecast(points: Array<[string, number]>, overrides: Partial<Forecast> = {}): Forecast {
  return {
    asOf: points[0]![0],
    endDate: points.at(-1)![0],
    mode: 'expected',
    horizonDays: points.length - 1,
    startingBalance: 100_000,
    safetyBuffer: 0,
    points: points.map(([date, balance]) => ({
      date,
      balance,
      inflow: 0,
      outflow: 0,
      budgetedSpending: 0,
      items: [],
    })),
    endingBalance: points.at(-1)![1],
    lowest: { balance: Math.min(...points.map((p) => p[1])), date: points[0]![0] },
    monthEnd: null,
    totals: { inflow: 0, outflow: 0, budgetedSpending: 0 },
    firstShortfallDate: null,
    firstBelowBufferDate: null,
    safeToSpend: 0,
    excludedInflow: { amount: 0, count: 0 },
    assumptions: [],
    ...overrides,
  };
}

describe('buildCashFlowRows', () => {
  const history = [
    { date: '2026-11-05', balance: 90_000 },
    { date: '2026-11-06', balance: 95_000 },
    { date: '2026-11-07', balance: 100_000 },
  ];
  const expected = forecast([
    ['2026-11-07', 100_000],
    ['2026-11-08', 80_000],
    ['2026-11-09', 120_000],
  ]);

  it('keeps actual and projected as separate series', () => {
    const rows = buildCashFlowRows({ history, expected });
    assert.equal(rows.length, 5);
    assert.deepEqual(
      rows.map((r) => [r.date, r.actual, r.projected]),
      [
        ['2026-11-05', 90_000, null],
        ['2026-11-06', 95_000, null],
        ['2026-11-07', 100_000, 100_000],
        ['2026-11-08', null, 80_000],
        ['2026-11-09', null, 120_000],
      ],
    );
    assert.equal(rows.find((r) => r.isToday)?.date, '2026-11-07');
  });

  it('builds a conservative↔optimistic band that always contains the projection', () => {
    const conservative = forecast([
      ['2026-11-07', 100_000],
      ['2026-11-08', 70_000],
      ['2026-11-09', 90_000],
    ]);
    const optimistic = forecast([
      ['2026-11-07', 100_000],
      ['2026-11-08', 85_000],
      ['2026-11-09', 150_000],
    ]);
    const rows = buildCashFlowRows({ history, expected, conservative, optimistic });
    assert.deepEqual(rows.find((r) => r.date === '2026-11-08')?.band, [70_000, 85_000]);
    assert.deepEqual(rows.find((r) => r.date === '2026-11-09')?.band, [90_000, 150_000]);
    assert.equal(rows.find((r) => r.date === '2026-11-05')?.band, null);
  });

  it('computes an extent including extra reference values', () => {
    const rows = buildCashFlowRows({ history, expected });
    assert.deepEqual(valueExtent(rows, [200_000]), [80_000, 200_000]);
    const [lo, hi] = niceDomain([80_000, 200_000]);
    assert.ok(lo <= 80_000 && hi >= 200_000);
  });
});

describe('monthGrid', () => {
  it('pads weeks to whole Sunday-first weeks', () => {
    const weeks = monthGrid('2026-11'); // Nov 1, 2026 is a Sunday
    assert.equal(weeks[0]![0]!.date, '2026-11-01');
    assert.ok(weeks.every((w) => w.length === 7));
    assert.equal(weeks.at(-1)!.at(-1)!.date, '2026-12-05');
    assert.equal(weeks.flat().filter((d) => d.inMonth).length, 30);
  });
  it('starts in the previous month when the 1st is mid-week', () => {
    const weeks = monthGrid('2027-02'); // Feb 1, 2027 is a Monday
    assert.equal(weeks[0]![0]!.date, '2027-01-31');
    assert.equal(weeks[0]![0]!.inMonth, false);
  });
});

describe('groupByDate', () => {
  it('groups and sorts by date', () => {
    const groups = groupByDate(
      [
        { d: '2026-11-09', n: 1 },
        { d: '2026-11-07', n: 2 },
        { d: '2026-11-09', n: 3 },
      ],
      (x) => x.d,
    );
    assert.deepEqual(
      groups.map(([d, items]) => [d, items.map((i) => i.n)]),
      [
        ['2026-11-07', [2]],
        ['2026-11-09', [1, 3]],
      ],
    );
  });
});
