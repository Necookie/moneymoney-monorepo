import { fileURLToPath } from 'node:url';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

/** Monorepo root: dependencies are hoisted there (pnpm `nodeLinker: hoisted`). */
const monorepoRoot = fileURLToPath(new URL('../../', import.meta.url));

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the Playwright web server build into its own folder without touching `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  // Non-secret Clerk routing config, inlined at build time (sign-in only; no public sign-up).
  env: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL || '/',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

// Makes Cloudflare bindings available to `next dev` (per the OpenNext Cloudflare docs). Only in
// dev: `next build` doesn't need the local workerd proxy, and starting it there makes builds
// fail on machines where workerd can't run.
if (process.env.NODE_ENV === 'development') void initOpenNextCloudflareForDev();
