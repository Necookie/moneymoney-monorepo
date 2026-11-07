# Authentication & security architecture

## Identity — Clerk

- Uses the existing Clerk application **`app_3LlSjooEyrZX7xnK1JH0NEnQnJK`** (no new application).
- Web: `@clerk/nextjs` (`ClerkProvider`, `proxy.ts` route protection, `/sign-in`).
  Mobile: `@clerk/expo` with the SecureStore token cache.
- Clients send the short-lived Clerk **session token** as `Authorization: Bearer …`.

### Private single-user access

1. In Clerk → *Configure → Restrictions*: disable sign-ups (or use an allow-list with your email).
2. The API additionally enforces **`OWNER_CLERK_USER_IDS`** (required in production): any other
   valid Clerk user gets `403 This Money Money instance is private`.

## API verification

`@clerk/backend` `verifyToken()` validates signature (JWKS via secret key, cached; or networkless
`CLERK_JWT_KEY`), expiry/not-before and — when `CLERK_AUTHORIZED_PARTIES` is set — the `azp`
origin (`https://moneymoney.necookie.dev`). The verified `sub` is mapped to an internal UUID
(`users.clerk_user_id`); **client-supplied user ids are never read** (unknown body fields are
stripped). Every repository query filters by that internal id, and composite foreign keys make
cross-user references impossible at the database level. Other users' records return 404.

## Controls

| Control | Implementation |
|---|---|
| Input validation | Zod on every body/query/param; response serialization validated too |
| Rate limiting | `@fastify/rate-limit`, 300 req/min per client (`CF-Connecting-IP`) |
| CORS | Allow-list (`CORS_ORIGINS`); native apps send no Origin |
| Request limits | 1 MB body (6 MB for CSV import), 15 s statement timeout, 20 s client timeout |
| Headers | `@fastify/helmet` |
| Errors | Uniform envelope; no stack traces/SQL; DB constraint errors mapped to 4xx |
| Logging | Pino JSON, correlation ids, `authorization`/cookies/secrets redacted |
| Transport | HTTPS only via Cloudflare; API has no published host port |
| Secrets | Coolify env vars / Wrangler secrets / EAS env; `.env*`, `.secrets*`, keys gitignored |
| DB exposure | Postgres on an `internal` Docker network, no port, dedicated credentials |
| Mobile | Tokens in SecureStore; optional biometric lock; SQLite in app sandbox |
| CSV export | Formula-injection neutralised |

## Never

Commit secrets, `.env` files, keys or dumps · expose SSH, Coolify admin, Postgres or Docker APIs ·
trust a client user id · treat projected income as cash.
