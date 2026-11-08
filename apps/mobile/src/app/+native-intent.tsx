/**
 * Rewrites incoming deep links before Expo Router handles them.
 *
 * `moneymoney://sso-callback` is the Google sign-in redirect: expo-web-browser's auth session
 * consumes it, so the router must not also try to open a (non-existent) `/sso-callback` screen.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.includes('sso-callback')) return initial ? '/' : null;
    return path;
  } catch {
    return '/';
  }
}
