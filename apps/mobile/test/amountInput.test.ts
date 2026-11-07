import { parseMoney } from '@mm/finance-engine';
import { describe, expect, it } from 'vitest';
import { applyKey } from '../src/lib/amountInput';

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
