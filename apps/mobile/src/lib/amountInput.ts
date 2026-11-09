const MAX_WHOLE_DIGITS = 10;

/**
 * Apply a key to the amount string. Keeps it a valid `parseMoney` input: digits, at most one
 * dot, at most two decimals, no leading zeros.
 */
export function applyKey(current: string, key: string): string {
  if (key === 'del') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const [whole = '', frac] = current.split('.');
  if (frac !== undefined) return frac.length >= 2 ? current : `${current}${key}`;
  if (whole === '0') return key;
  if (whole.length >= MAX_WHOLE_DIGITS) return current;
  return `${current}${key}`;
}

/** Keypad string for an existing amount in centavos ("1234.5" style, no grouping, unsigned). */
export function centavosToInput(amount: number): string {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return cents ? `${whole}.${String(cents).padStart(2, '0').replace(/0$/, '')}` : String(whole);
}

/**
 * What the keypad display shows while typing: exactly the digits entered, grouped, so "12."
 * reads "₱12." (not "₱12.00.") and "12.5" reads "₱12.5".
 */
export function formatAmountInput(input: string): string {
  if (!input) return '₱0';
  const [whole = '', frac] = input.split('.');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? `₱${grouped}` : `₱${grouped}.${frac}`;
}
