import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a production build (`next build && next start`).
 *
 * Clerk keys are read from the environment only — nothing is hard-coded here:
 *   E2E_CLERK_PUBLISHABLE_KEY / E2E_CLERK_SECRET_KEY (falls back to the regular
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY).
 *
 * The unauthenticated suite works with syntactically valid placeholder keys. Use a
 * *production-format* (`pk_live_…`) placeholder: Clerk development instances (`pk_test_…`)
 * redirect first-time browser visits through the Clerk "handshake" on the Clerk domain, which
 * cannot complete without a real instance. See docs/deployment/cloudflare-web.md.
 *
 * Set E2E_BASE_URL to test an already-running deployment instead of starting a server.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? `http://localhost:${PORT}`;

const publishableKey =
  process.env.E2E_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.E2E_CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;

if (!externalBaseUrl && (!publishableKey || !secretKey)) {
  throw new Error(
    'Playwright needs Clerk keys to build the app: set E2E_CLERK_PUBLISHABLE_KEY and E2E_CLERK_SECRET_KEY ' +
      '(placeholder pk_live_/sk_live_ values are fine for the unauthenticated tests), or set E2E_BASE_URL.',
  );
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npx next build && npx next start -p ${PORT}`,
        url: `${baseURL}/sign-in`,
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          NEXT_DIST_DIR: '.next-e2e',
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey ?? '',
          CLERK_SECRET_KEY: secretKey ?? '',
        },
      },
});
