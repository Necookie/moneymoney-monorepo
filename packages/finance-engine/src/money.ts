import type { Centavos } from '@mm/types';

/**
 * Exact money arithmetic on integer centavos.
 *
 * JavaScript numbers represent every integer up to 2^53 exactly (about PHP 90 trillion in
 * centavos), so integer add/subtract is exact. We never multiply by fractional factors without
 * rounding explicitly (BigInt for intermediates), and public functions assert safe integers.
 */

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function assertCentavos(value: number, label = 'amount'): asserts value is Centavos {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer number of centavos, got ${value}`);
  }
}

export function add(...values: Centavos[]): Centavos {
  let total = 0;
  for (const v of values) {
    assertCentavos(v);
    total += v;
  }
  assertCentavos(total, 'sum');
  return total;
}

export function sum(values: readonly Centavos[]): Centavos {
  return add(...values);
}

export function subtract(a: Centavos, b: Centavos): Centavos {
  assertCentavos(a);
  assertCentavos(b);
  const r = a - b;
  assertCentavos(r, 'difference');
  return r;
}

/**
 * Multiply by a ratio expressed as integers (numerator/denominator), rounding half away from
 * zero. BigInt intermediates mean the product can never lose precision.
 */
export function multiplyRatio(amount: Centavos, numerator: number, denominator: number): Centavos {
  assertCentavos(amount);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    throw new MoneyError('ratio must be integers with a non-zero denominator');
  }
  const n = BigInt(amount) * BigInt(numerator);
  const d = BigInt(denominator);
  const negative = n < 0n !== d < 0n;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  const q = (absN * 2n + absD) / (absD * 2n);
  return Number(negative ? -q : q);
}

/** Ratio of part to whole in basis points (1% = 100 bps), rounded. Whole of 0 yields 0. */
export function basisPoints(part: Centavos, whole: Centavos): number {
  assertCentavos(part);
  assertCentavos(whole);
  if (whole === 0) return 0;
  return multiplyRatio(part, 10_000, whole);
}

/**
 * Split an amount into `parts` integer pieces that sum exactly to the amount.
 * The remainder is distributed one centavo at a time to the earliest parts.
 */
export function allocate(amount: Centavos, parts: number): Centavos[] {
  assertCentavos(amount);
  if (!Number.isInteger(parts) || parts < 1)
    throw new MoneyError('parts must be a positive integer');
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const base = Math.floor(abs / parts);
  let remainder = abs - base * parts;
  const out: Centavos[] = [];
  for (let i = 0; i < parts; i++) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    out.push(sign * (base + extra));
  }
  return out;
}

export function minAmount(a: Centavos, b: Centavos): Centavos {
  return a < b ? a : b;
}
export function maxAmount(a: Centavos, b: Centavos): Centavos {
  return a > b ? a : b;
}

/**
 * Parse a user-entered money string into centavos without floating point.
 * Accepts "1234", "1,234.5", "₱1,234.56", "-50", "PHP 12.30". Rejects more than 2 decimals.
 */
export function parseMoney(input: string): Centavos {
  const cleaned = input
    .trim()
    .replace(/^PHP\s*/i, '')
    .replace(/[₱,\s]/g, '');
  const match = /^([+-])?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`Invalid money amount: "${input}"`);
  const signPart = match[1];
  const whole = match[2] ?? '0';
  const frac = match[3] ?? '';
  const centavos = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  const value = signPart === '-' ? -centavos : centavos;
  assertCentavos(value);
  return value;
}

/** Convert centavos to a plain decimal string ("1234.50"), exactly. */
export function toDecimalString(amount: Centavos): string {
  assertCentavos(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export interface FormatMoneyOptions {
  /** Prefix symbol; defaults to ₱. */
  symbol?: string;
  /** Hide centavos when they are zero. */
  compactZeroCents?: boolean;
  /** Always show a sign (+/−). */
  signed?: boolean;
}

/** Format centavos as "₱1,234.50" using exact integer formatting. */
export function formatMoney(amount: Centavos, options: FormatMoneyOptions = {}): string {
  assertCentavos(amount);
  const { symbol = '₱', compactZeroCents = false, signed = false } = options;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = compactZeroCents && cents === 0 ? '' : `.${String(cents).padStart(2, '0')}`;
  const sign = negative ? '−' : signed && amount > 0 ? '+' : '';
  return `${sign}${symbol}${grouped}${fraction}`;
}

/** Compact format for chart axes: ₱1.2k, ₱3.4M. Display only (uses float for scaling). */
export function formatMoneyCompact(amount: Centavos, symbol = '₱'): string {
  assertCentavos(amount);
  const pesos = Math.abs(amount) / 100;
  const sign = amount < 0 ? '−' : '';
  const trim = (s: string) => (s.endsWith('.0') ? s.slice(0, -2) : s);
  if (pesos >= 1_000_000) return `${sign}${symbol}${trim((pesos / 1_000_000).toFixed(1))}M`;
  if (pesos >= 1_000) return `${sign}${symbol}${trim((pesos / 1_000).toFixed(1))}k`;
  return `${sign}${symbol}${Math.round(pesos)}`;
}
