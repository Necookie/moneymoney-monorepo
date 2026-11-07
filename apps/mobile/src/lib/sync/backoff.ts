export interface BackoffOptions {
  /** Delay after the first failure (ms). */
  baseMs: number;
  /** Upper bound (ms). */
  maxMs: number;
  /** 0..1 random source for jitter (injectable for tests). */
  random?: () => number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 5_000, maxMs: 15 * 60_000 };

/**
 * Exponential backoff with "equal jitter": after `attempts` failures the delay is somewhere in
 * [d/2, d] where d = min(max, base · 2^(attempts−1)).
 */
export function backoffDelay(attempts: number, options: BackoffOptions = DEFAULT_BACKOFF): number {
  const n = Math.max(1, attempts);
  const exp = Math.min(options.maxMs, options.baseMs * 2 ** Math.min(n - 1, 30));
  const r = (options.random ?? Math.random)();
  return Math.round(exp / 2 + (exp / 2) * Math.min(1, Math.max(0, r)));
}
