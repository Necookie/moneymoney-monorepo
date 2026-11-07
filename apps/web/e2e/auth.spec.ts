import { expect, test } from '@playwright/test';

/**
 * Unauthenticated behaviour. Authenticated journeys need a real Clerk instance and test user —
 * see docs/deployment/cloudflare-web.md ("Authenticated E2E with Clerk testing tokens").
 */

const PROTECTED_ROUTES = [
  '/',
  '/transactions',
  '/calendar',
  '/forecast',
  '/budgets',
  '/goals',
  '/accounts',
  '/insights',
  '/settings',
];

test.describe('signed-out visitors', () => {
  for (const path of PROTECTED_ROUTES) {
    test(`${path} redirects to /sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in(\?|\/|$)/);
      const url = new URL(page.url());
      // The original destination is preserved for after sign-in.
      expect(url.searchParams.get('redirect_url') ?? '').toContain(path === '/' ? '' : path);
    });
  }

  test('protected responses never contain app data markup', async ({ request }) => {
    const res = await request.get('/transactions', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(res.status());
    expect(res.headers()['location']).toContain('/sign-in');
  });
});

test.describe('sign-in page', () => {
  test('renders the brand and tagline', async ({ page }) => {
    const response = await page.goto('/sign-in');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/money money\./);
    await expect(page.getByText('money money', { exact: false }).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Know your money before you spend it.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('This is a private instance for its owner.')).toBeVisible();
  });

  test('offers no public sign-up route', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page).not.toHaveURL(/\/sign-up$/);
  });

  test('sends security headers and asks search engines not to index', async ({ page }) => {
    const response = await page.goto('/sign-in');
    const headers = response?.headers() ?? {};
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
