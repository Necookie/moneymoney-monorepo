# Web app on Cloudflare Workers (`apps/web`)

The web app is a Next.js 16 (App Router) app deployed to Cloudflare Workers with the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`).
All financial data comes from the Money Money API (`NEXT_PUBLIC_API_URL`, base path `/api/v1`) with
a Clerk session token as a bearer token; the Worker itself stores nothing.

## Files

| File | Purpose |
|---|---|
| `apps/web/wrangler.jsonc` | Worker `moneymoney-web`, `nodejs_compat`, assets binding `ASSETS`, self-reference service binding. **No routes / custom domain** — add one when you deploy. |
| `apps/web/open-next.config.ts` | OpenNext config. No incremental cache (every page is user-specific and dynamic). |
| `apps/web/next.config.ts` | Security headers, monorepo tracing root, `initOpenNextCloudflareForDev()` for `next dev`. |
| `apps/web/src/proxy.ts` | Next 16 Proxy (formerly `middleware.ts`) running `clerkMiddleware`; redirects signed-out visitors to `/sign-in`. |
| `apps/web/public/_headers` | Long-lived immutable caching for `/_next/static/*`. |
| `apps/web/.env.example`, `apps/web/.dev.vars.example` | Placeholders only. Real values go in `.env.local` / `.dev.vars` (git-ignored). |

## Environment variables

| Name | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **build** environment | Inlined into the bundle at build time. |
| `NEXT_PUBLIC_API_URL` | **build** environment | Defaults to `https://api.moneymoney.necookie.dev`. No trailing slash, no `/api/v1`. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | build (defaults to `/sign-in` in `next.config.ts`) | Also set as a Worker var in `wrangler.jsonc`. |
| `CLERK_SECRET_KEY` | **Worker secret** | `npx wrangler secret put CLERK_SECRET_KEY` (from `apps/web`). Never commit it. |

`NEXT_PUBLIC_*` values are compiled into the JavaScript, so they must be present in the shell (or a
git-ignored `apps/web/.env.production.local`) when running the build — setting them only as Worker
vars is not enough.

## Clerk configuration (dashboard)

1. **Sign-up mode → Restricted** (Configure → Restrictions). The app has no sign-up page and the
   `<SignIn>` component is rendered with `withSignUp={false}` and `transferable={false}`, but only
   the dashboard setting actually prevents new accounts.
2. **Paths**: sign-in URL `/sign-in`, after sign-in `/`.
3. **Production instance domain**: add the web app's domain; use `pk_live_…` / `sk_live_…` keys.
4. The API must trust the web origin: set the API's `CORS_ORIGINS` (and the token `azp` allow-list)
   to the deployed web origin, and `OWNER_CLERK_USER_IDS` to your Clerk user id. Any other signed-in
   user gets the API's 403 "This Money Money instance is private", which the web app shows as a
   dedicated "private instance" screen with a sign-out button.

## Build, preview, deploy

```sh
# from the repo root: build the workspace packages the app depends on
pnpm --filter "@mm/web^..." build

cd apps/web
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
export NEXT_PUBLIC_API_URL=https://api.moneymoney.necookie.dev

pnpm preview          # opennextjs-cloudflare build + local Workers runtime (needs .dev.vars)
npx wrangler secret put CLERK_SECRET_KEY   # once per environment
pnpm deploy           # opennextjs-cloudflare build + deploy
```

For `pnpm preview`, copy `.dev.vars.example` to `.dev.vars` and fill in `CLERK_SECRET_KEY`.
For `pnpm dev` (plain `next dev`), copy `.env.example` to `.env.local`.

### Notes from verification (Nov 2026)

- `npx opennextjs-cloudflare build` succeeded on **native Windows** (no WSL needed) with
  `@opennextjs/cloudflare` 1.20.16, Next 16.4.5, wrangler 4.158.
- Next 16's `proxy.ts` always runs on the Node.js runtime. OpenNext supports this since 1.20.3 but
  prints: *"Node.js middleware support is experimental in cloudflare, and not officially maintained
  by OpenNext maintainers."* Next 16 does not allow `runtime = 'edge'` in `proxy.ts`, so there is no
  edge alternative short of the deprecated `middleware.ts`. Re-check the OpenNext release notes when
  upgrading.
- `wrangler deploy --dry-run` reported **10.3 MiB raw / 2.2 MiB gzip** — within the 3 MiB (free) and
  10 MiB (paid) compressed Worker limits.
- `compatibility_date` is `2026-11-01`; it must not be newer than the installed `workerd` supports.

## Tests

```sh
cd apps/web
pnpm test        # unit tests for pure helpers (node:test, no extra deps)
pnpm typecheck
pnpm lint
```

### Playwright E2E

`playwright.config.ts` builds the app into `.next-e2e` and serves it with `next start`. It reads the
Clerk keys only from the environment:

```sh
npx playwright install chromium
E2E_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuZXhhbXBsZS5jb20k \
E2E_CLERK_SECRET_KEY=sk_live_placeholder \
pnpm test:e2e
```

The placeholder above is a syntactically valid *production-format* key for the non-existent
`clerk.example.com`. It is enough for the signed-out suite (redirects to `/sign-in`, brand on the
sign-in page, security headers). A *development* key (`pk_test_…`) makes Clerk send first-time
browser visits through its handshake on the Clerk domain, which cannot complete without a real
instance. To run against an existing deployment instead, set `E2E_BASE_URL`.

### Authenticated E2E with Clerk testing tokens (not enabled)

Signed-in journeys need a real Clerk **development** instance and a real API, so they are not part of
the committed suite. To add them:

1. `pnpm --filter @mm/web add -D @clerk/testing` (respect the repo's install lock).
2. Use the dev instance keys as `E2E_CLERK_PUBLISHABLE_KEY` / `E2E_CLERK_SECRET_KEY`, and create a
   test user with a password. Put its Clerk user id in the API's `OWNER_CLERK_USER_IDS` (or run a
   separate API with that owner) and allow `http://localhost:3100` in the API's `CORS_ORIGINS`.
3. Add a Playwright global setup that calls `clerkSetup()` from `@clerk/testing/playwright` (it
   fetches a testing token so bot protection does not block automated sign-in).
4. In tests, call `setupClerkTestingToken({ page })`, then
   `clerk.signIn({ page, signInParams: { strategy: 'password', identifier, password } })` before
   navigating to app pages. Keep credentials in CI secrets (`E2E_CLERK_USER_USERNAME`,
   `E2E_CLERK_USER_PASSWORD`), never in the repo.
5. Prefer running against a disposable database with demo data (`POST /api/v1/demo`), and remove it
   afterwards (`DELETE /api/v1/demo`).
