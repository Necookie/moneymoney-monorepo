import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeRecurrence,
  formatBps,
  monthRange,
  moneyToInput,
  ordinal,
  parseTags,
  readMoney,
  relativeDay,
  shiftMonth,
} from './format.ts';

describe('readMoney', () => {
  it('parses money exactly into centavos', () => {
    assert.deepEqual(readMoney('1,234.50'), { ok: true, value: 123450 });
    assert.deepEqual(readMoney('₱0.10'), { ok: true, value: 10 });
    assert.deepEqual(readMoney('19.99'), { ok: true, value: 1999 });
  });
  it('rejects empty, malformed, negative and zero by default', () => {
    assert.equal(readMoney('').ok, false);
    assert.equal(readMoney('12.345').ok, false);
    assert.equal(readMoney('abc').ok, false);
    assert.equal(readMoney('-5').ok, false);
    assert.equal(readMoney('0').ok, false);
  });
  it('accepts the typographic minus and dashes phone keyboards insert', () => {
    assert.deepEqual(readMoney('−₱1,234.00', { allowNegative: true }), {
      ok: true,
      value: -123400,
    });
    assert.deepEqual(readMoney('–5', { allowNegative: true }), { ok: true, value: -500 });
    assert.deepEqual(readMoney(' —0.50', { allowNegative: true }), { ok: true, value: -50 });
    assert.equal(readMoney('−5').ok, false);
  });
  it('allows negatives and zero when asked', () => {
    assert.deepEqual(readMoney('-5', { allowNegative: true }), { ok: true, value: -500 });
    assert.deepEqual(readMoney('0', { allowZero: true }), { ok: true, value: 0 });
  });
});

describe('moneyToInput', () => {
  it('round-trips centavos to an editable string', () => {
    assert.equal(moneyToInput(123450), '1234.50');
    assert.equal(moneyToInput(500000), '5000');
    assert.equal(moneyToInput(-2500), '-25');
    assert.equal(moneyToInput(null), '');
  });
});

describe('describeRecurrence', () => {
  it('describes a semimonthly salary', () => {
    assert.equal(
      describeRecurrence(
        { frequency: 'semimonthly', dayOfMonth: 15, secondDayOfMonth: 30 },
        '2026-11-15',
      ),
      'Twice a month · 15th & 30th',
    );
    assert.equal(
      describeRecurrence(
        { frequency: 'semimonthly', dayOfMonth: 15, secondDayOfMonth: 31 },
        '2026-11-15',
      ),
      'Twice a month · 15th & month end',
    );
  });
  it('describes monthly with end date and last-day rule', () => {
    assert.equal(
      describeRecurrence(
        { frequency: 'monthly', monthEndRule: 'last_day', endDate: '2027-06-30' },
        '2026-11-30',
      ),
      'Monthly · on the last day · until Jun 30, 2027',
    );
    assert.equal(
      describeRecurrence({ frequency: 'monthly', interval: 2, dayOfMonth: 5 }, '2026-11-05'),
      'Every 2 months · on the 5th',
    );
  });
  it('describes one-offs', () => {
    assert.equal(describeRecurrence({ frequency: 'none' }, '2026-12-25'), 'Once · Dec 25, 2026');
  });
});

describe('small helpers', () => {
  it('ordinal', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 30, 31].map(ordinal), [
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '30th',
      '31st',
    ]);
  });
  it('shiftMonth and monthRange', () => {
    assert.equal(shiftMonth('2026-11', 1), '2026-12');
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  });
  it('formatBps', () => {
    assert.equal(formatBps(4250), '43%');
    assert.equal(formatBps(4250, true), '42.5%');
  });
  it('relativeDay', () => {
    assert.equal(relativeDay(0), 'Today');
    assert.equal(relativeDay(1), 'Tomorrow');
    assert.equal(relativeDay(5), 'In 5 days');
    assert.equal(relativeDay(-3), '3 days ago');
  });
  it('parseTags', () => {
    assert.deepEqual(parseTags(' trip, #work,trip ,, '), ['trip', 'work']);
  });
});
