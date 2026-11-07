import { describe, expect, it } from 'vitest';
import {
  add,
  addDays,
  addMonthsClamped,
  allocate,
  basisPoints,
  dateInTimeZone,
  daysInMonth,
  dayOfWeek,
  diffDays,
  endOfMonth,
  formatMoney,
  isLeapYear,
  isValidIsoDate,
  MoneyError,
  multiplyRatio,
  parseMoney,
  toDecimalString,
} from '../src/index.js';

describe('money', () => {
  it('parses user input to exact centavos without floating point', () => {
    expect(parseMoney('1234')).toBe(123_400);
    expect(parseMoney('1,234.5')).toBe(123_450);
    expect(parseMoney('₱1,234.56')).toBe(123_456);
    expect(parseMoney('PHP 0.07')).toBe(7);
    expect(parseMoney('-50')).toBe(-5_000);
    // 0.1 + 0.2 style inputs stay exact
    expect(add(parseMoney('0.10'), parseMoney('0.20'))).toBe(30);
  });

  it('rejects malformed or over-precise amounts', () => {
    expect(() => parseMoney('12.345')).toThrow(MoneyError);
    expect(() => parseMoney('abc')).toThrow(MoneyError);
    expect(() => parseMoney('')).toThrow(MoneyError);
  });

  it('refuses non-integer centavos', () => {
    expect(() => add(1.5)).toThrow(MoneyError);
    expect(() => add(Number.MAX_SAFE_INTEGER, 1)).toThrow(MoneyError);
  });

  it('formats exactly', () => {
    expect(formatMoney(123_456_789)).toBe('₱1,234,567.89');
    expect(formatMoney(-5)).toBe('−₱0.05');
    expect(formatMoney(100_000, { compactZeroCents: true })).toBe('₱1,000');
    expect(formatMoney(2_500, { signed: true })).toBe('+₱25.00');
    expect(toDecimalString(-123_405)).toBe('-1234.05');
  });

  it('allocates remainders so parts always sum to the total', () => {
    expect(allocate(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(allocate(2_500_000, 12).reduce((a, b) => a + b, 0)).toBe(2_500_000);
    expect(allocate(-100, 3)).toEqual([-34, -33, -33]);
  });

  it('multiplies by integer ratios with half-up rounding via BigInt', () => {
    expect(multiplyRatio(1_000, 1, 3)).toBe(333);
    expect(multiplyRatio(1_000, 2, 3)).toBe(667);
    expect(multiplyRatio(Number.MAX_SAFE_INTEGER, 1, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(basisPoints(8_000, 10_000)).toBe(8_000);
    expect(basisPoints(1, 0)).toBe(0);
  });
});

describe('dates', () => {
  it('handles leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('clamps month arithmetic at month end', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
    expect(endOfMonth('2026-11-07')).toBe('2026-11-30');
  });

  it('does day arithmetic independent of host timezone', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(dayOfWeek('2026-11-07')).toBe(6); // Saturday
  });

  it('resolves "today" in Asia/Manila (UTC+8) at day boundaries', () => {
    // 16:30 UTC on Nov 6 is already 00:30 Nov 7 in Manila.
    expect(dateInTimeZone(new Date('2026-11-06T16:30:00Z'), 'Asia/Manila')).toBe('2026-11-07');
    // 15:59 UTC is still Nov 6 in Manila.
    expect(dateInTimeZone(new Date('2026-11-06T15:59:59Z'), 'Asia/Manila')).toBe('2026-11-06');
    expect(dateInTimeZone(new Date('2026-12-31T16:00:00Z'), 'Asia/Manila')).toBe('2027-01-01');
  });
});
