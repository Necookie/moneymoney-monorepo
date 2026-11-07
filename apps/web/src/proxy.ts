import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Next.js 16 Proxy (formerly middleware) running Clerk. Every page except the sign-in flow
 * requires a session; unauthenticated document requests are redirected to `/sign-in`.
 *
 * Defence in depth: the (app) layout re-checks the session on the server, and the API verifies
 * the bearer token and the owner allow-list on every request.
 */
// Android release metadata and the stable APK download link are public (the APK is published on
// GitHub Releases anyway, and the app itself is useless without the owner's sign-in).
const PUBLIC_PREFIXES = ['/sign-in', '/api/android', '/download/android'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default clerkMiddleware(
  async (auth, req) => {
    if (isPublic(req.nextUrl.pathname)) return;
    const { isAuthenticated, redirectToSignIn } = await auth();
    if (!isAuthenticated) return redirectToSignIn({ returnBackUrl: req.url });
  },
  { signInUrl: '/sign-in' },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
};
