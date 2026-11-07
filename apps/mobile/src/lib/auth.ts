import { getClerkInstance } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { config } from './config';

/** An error the sync engine classifies as "offline" (status 0) rather than "signed out". */
class AuthUnavailableError extends Error {
  readonly status = 0;
  override name = 'AuthUnavailableError';
}

let headless = false;

/** Called by the background task: Clerk may need loading without the React tree. */
export function markHeadless(): void {
  headless = true;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new AuthUnavailableError('Timed out loading session')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * A fresh Clerk session token for API calls, or null when signed out.
 * Throws a status-0 error when the session cannot be determined (offline, still loading) so
 * callers treat it like a network failure and retry later instead of signing the user out.
 */
export async function getAuthToken(): Promise<string | null> {
  if (!config.clerkPublishableKey) throw new AuthUnavailableError('Clerk is not configured');
  const clerk = getClerkInstance({ publishableKey: config.clerkPublishableKey, tokenCache });
  if (!clerk.loaded) {
    if (!headless) throw new AuthUnavailableError('Session not loaded yet');
    try {
      await withTimeout((clerk as { load: () => Promise<void> }).load(), 15_000);
    } catch {
      throw new AuthUnavailableError('Could not load session');
    }
  }
  if (!clerk.session) return null;
  try {
    return (await clerk.session.getToken()) ?? null;
  } catch {
    throw new AuthUnavailableError('Could not refresh session (offline?)');
  }
}
