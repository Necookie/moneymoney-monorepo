import { parseMoney } from '@mm/finance-engine';
import { describe, expect, it } from 'vitest';
import { applyKey, centavosToInput, formatAmountInput } from '../src/lib/amountInput';

const type = (keys: string[]) => keys.reduce(applyKey, '');

describe('keypad input', () => {
  it('builds valid parseMoney input without floats', () => {
    expect(type(['1', '2', '3', '4', '.', '5'])).toBe('1234.5');
    expect(parseMoney(type(['1', '2', '3', '4', '.', '5']))).toBe(123_450);
    expect(parseMoney(type(['0', '.', '1']))).toBe(10);
  });
  it('limits decimals, dots and leading zeros', () => {
    expect(type(['.', '9', '9', '9'])).toBe('0.99');
    expect(type(['1', '.', '.', '2'])).toBe('1.2');
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(['5', 'del'])).toBe('');
  });
});

describe('keypad display', () => {
  it('shows exactly what was typed, grouped', () => {
    expect(formatAmountInput('')).toBe('₱0');
    expect(formatAmountInput('7')).toBe('₱7');
    expect(formatAmountInput('1234567')).toBe('₱1,234,567');
    // A trailing dot must not render as "₱12.00."
    expect(formatAmountInput('12.')).toBe('₱12.');
    expect(formatAmountInput('1234.5')).toBe('₱1,234.5');
    expect(formatAmountInput('0.05')).toBe('₱0.05');
  });
});

describe('editing an existing amount', () => {
  it('round-trips centavos through the keypad string exactly', () => {
    for (const c of [1, 5, 10, 50, 99, 100, 123_450, 123_456, 9_999_999_999]) {
      expect(parseMoney(centavosToInput(c))).toBe(c);
    }
    expect(centavosToInput(123_450)).toBe('1234.5');
    expect(centavosToInput(5)).toBe('0.05');
    expect(centavosToInput(100)).toBe('1');
  });
  it('keeps further typing valid after loading an amount', () => {
    expect(applyKey(centavosToInput(123_450), '6')).toBe('1234.56');
    expect(applyKey(centavosToInput(123_456), '7')).toBe('1234.56');
  });
});
