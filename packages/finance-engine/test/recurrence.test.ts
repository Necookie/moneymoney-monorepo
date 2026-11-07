import { describe, expect, it } from 'vitest';
import { expandOccurrences, scheduleDates } from '../src/index.js';
import { ev, peso } from './fixtures.js';

const dates = (start: string, rule: Parameters<typeof scheduleDates>[1], until: string) =>
  [...scheduleDates(start, rule, until)].map(([, d]) => d);

describe('recurrence', () => {
  it('monthly on the 31st clamps to shorter months (leap year aware)', () => {
    expect(dates('2028-01-31', { frequency: 'monthly' }, '2028-05-31')).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
      '2028-05-31',
    ]);
    expect(dates('2027-01-31', { frequency: 'monthly' }, '2027-03-01')).toEqual([
      '2027-01-31',
      '2027-02-28',
    ]);
  });

  it('last_day rule always lands on month end', () => {
    expect(
      dates('2026-11-30', { frequency: 'monthly', monthEndRule: 'last_day' }, '2027-02-28'),
    ).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  });

  it('semimonthly payday on the 15th and month end (PH payroll)', () => {
    expect(
      dates(
        '2026-11-15',
        { frequency: 'semimonthly', dayOfMonth: 15, secondDayOfMonth: 31 },
        '2027-02-28',
      ),
    ).toEqual([
      '2026-11-15',
      '2026-11-30',
      '2026-12-15',
      '2026-12-31',
      '2027-01-15',
      '2027-01-31',
      '2027-02-15',
      '2027-02-28',
    ]);
  });

  it('weekly, biweekly and yearly (Feb 29 anchor)', () => {
    expect(dates('2026-11-06', { frequency: 'weekly' }, '2026-11-27')).toEqual([
      '2026-11-06',
      '2026-11-13',
      '2026-11-20',
      '2026-11-27',
    ]);
    expect(dates('2026-11-06', { frequency: 'biweekly' }, '2026-12-31')).toEqual([
      '2026-11-06',
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
    ]);
    expect(dates('2028-02-29', { frequency: 'yearly' }, '2032-03-01')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('contract income stops at the contract end date and never projects indefinitely', () => {
    expect(
      dates('2026-11-30', { frequency: 'monthly', endDate: '2027-01-31' }, '2030-01-01'),
    ).toEqual(['2026-11-30', '2026-12-30', '2027-01-30']);
  });

  it('honours occurrence counts', () => {
    expect(dates('2026-12-01', { frequency: 'monthly', count: 2 }, '2030-01-01')).toEqual([
      '2026-12-01',
      '2027-01-01',
    ]);
  });

  it('splits installment plans exactly', () => {
    const occ = expandOccurrences(
      [ev({ id: 'laptop', amount: peso(25_000) + 1, startDate: '2026-12-15', installments: 3 })],
      [],
      { from: '2026-11-07', to: '2027-12-31' },
    );
    expect(occ.map((o) => [o.date, o.amount, o.index])).toEqual([
      ['2026-12-15', 833_334, 1],
      ['2027-01-15', 833_334, 2],
      ['2027-02-15', 833_333, 3],
    ]);
    expect(occ.reduce((s, o) => s + o.amount, 0)).toBe(peso(25_000) + 1);
  });

  it('applies skip, paid, amount and reschedule overrides', () => {
    const rent = ev({
      id: 'rent',
      amount: peso(15_000),
      startDate: '2026-11-10',
      status: 'recurring',
      recurrence: { frequency: 'monthly' },
    });
    const occ = expandOccurrences(
      [rent],
      [
        { eventId: 'rent', occurrenceDate: '2026-11-10', action: 'paid', transactionId: 'tx1' },
        {
          eventId: 'rent',
          occurrenceDate: '2026-12-10',
          action: 'reschedule',
          newDate: '2026-12-20',
        },
        { eventId: 'rent', occurrenceDate: '2027-01-10', action: 'skip' },
        { eventId: 'rent', occurrenceDate: '2027-02-10', action: 'amount', amount: peso(16_000) },
      ],
      { from: '2026-11-07', to: '2027-02-28' },
    );
    expect(occ.map((o) => [o.date, o.amount, o.rescheduled])).toEqual([
      ['2026-12-20', peso(15_000), true],
      ['2027-02-10', peso(16_000), false],
    ]);
  });

  it('a rescheduled occurrence can move into the window from before it', () => {
    const occ = expandOccurrences(
      [
        ev({
          id: 'bill',
          amount: 100,
          startDate: '2026-10-01',
          recurrence: { frequency: 'monthly' },
          status: 'recurring',
        }),
      ],
      [
        {
          eventId: 'bill',
          occurrenceDate: '2026-11-01',
          action: 'reschedule',
          newDate: '2026-11-20',
        },
      ],
      { from: '2026-11-07', to: '2026-11-30' },
    );
    expect(occ.map((o) => o.date)).toEqual(['2026-11-20']);
  });

  it('ignores cancelled and paid events', () => {
    const occ = expandOccurrences(
      [
        ev({ id: 'a', amount: 1, startDate: '2026-12-01', status: 'cancelled' }),
        ev({ id: 'b', amount: 1, startDate: '2026-12-01', status: 'paid' }),
        ev({ id: 'c', amount: 1, startDate: '2026-12-01', status: 'committed' }),
      ],
      [],
      { from: '2026-11-07', to: '2026-12-31' },
    );
    expect(occ.map((o) => o.eventId)).toEqual(['c']);
  });

  it('projects overdue one-offs onto today but never past recurring occurrences', () => {
    const occ = expandOccurrences(
      [
        ev({ id: 'oneoff', amount: 1, startDate: '2026-11-01' }),
        ev({
          id: 'monthly',
          amount: 1,
          startDate: '2026-10-01',
          status: 'recurring',
          recurrence: { frequency: 'monthly' },
        }),
      ],
      [],
      { from: '2026-11-07', to: '2026-11-30' },
    );
    expect(occ.map((o) => [o.eventId, o.date, o.overdue])).toEqual([
      ['oneoff', '2026-11-07', true],
    ]);
  });

  it('orders inflows before outflows on the same day', () => {
    const occ = expandOccurrences(
      [
        ev({ id: 'a-bill', amount: 1, startDate: '2026-11-15' }),
        ev({
          id: 'z-salary',
          amount: 1,
          startDate: '2026-11-15',
          direction: 'inflow',
          kind: 'salary',
        }),
      ],
      [],
      { from: '2026-11-07', to: '2026-11-30' },
    );
    expect(occ.map((o) => o.eventId)).toEqual(['z-salary', 'a-bill']);
  });
});
