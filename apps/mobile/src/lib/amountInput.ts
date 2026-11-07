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
