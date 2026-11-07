# money money.

**Know your money before you spend it.**

Money Money is a private personal-finance command center: actual balances, a future-expense
planner, salary/contract income forecasting, overspending warnings, "Can I afford this?"
simulations, budgets and savings goals — on the web and as a native Android app.

| | |
|---|---|
| Web | https://moneymoney.necookie.dev (Next.js on Cloudflare Workers) |
| API | https://api.moneymoney.necookie.dev (Fastify + PostgreSQL on Coolify, via a dedicated Cloudflare Tunnel) |
| Android | Expo / React Native APK (EAS Build) — iOS-ready codebase |
| Currency / TZ | PHP (integer centavos) · Asia/Manila |

## Monorepo

```text
apps/
  api/        Fastify 5 API — modular monolith (/api/v1), Clerk JWT auth, Drizzle, OpenAPI
  web/        Next.js 16 App Router, Tailwind v4, TanStack Query, Recharts, Clerk, OpenNext
  mobile/     Expo SDK 58 / React Native, Expo Router, NativeWind, SQLite offline sync, Clerk
packages/
  finance-engine/  Pure, deterministic forecasting engine (money, dates, recurrence, forecasts,
                   scenarios, affordability, budgets, goals, alerts) — 44 unit tests
  database/        Drizzle schema + SQL migrations + client
  validation/      Zod schemas = the wire contract
  api-client/      Typed fetch client used by web and mobile
  types/           Shared domain vocabulary
  design-tokens/   Colours, radii, type scale (TS + CSS variables)
  config/          Shared TypeScript / ESLint config
infra/
  docker/     API + backup images
  coolify/    Isolated Money Money compose stack (api, postgres, tunnel, backup)
  cloudflare/ Tunnel + Workers notes
  scripts/    Idempotent provisioning scripts (Cloudflare tunnel, Coolify)
docs/         Product, architecture, database, API, security, deployment, decisions
```

## Quick start

```bash
corepack enable && pnpm install
pnpm build                      # builds packages + apps (turbo)
pnpm test                       # engine unit tests + API integration tests (PGlite Postgres)
pnpm --filter @mm/api dev       # API on :3001 (needs apps/api/.env — see .env.example)
pnpm --filter @mm/web dev       # web on :3000 (needs apps/web/.env.local)
pnpm --filter @mm/mobile start  # Expo dev server
```

See [docs/development/local-development.md](docs/development/local-development.md).

## Principles

- **Actual ≠ projected.** Planned items change projections only, never recorded balances.
- **Uncertain income is never spendable cash.** Conservative / expected / optimistic modes.
- **Exact money.** Integer centavos end to end; no floating-point totals.
- **Transfers are not income or spending.**
- **One server, isolated stacks.** Money Money owns its API, database, credentials, volumes,
  network, tunnel and backups inside its own Coolify project.

## Documentation

| Topic | Doc |
|---|---|
| Product requirements | [docs/product/requirements.md](docs/product/requirements.md) |
| System architecture | [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md) |
| Forecasting specification | [docs/architecture/forecasting-spec.md](docs/architecture/forecasting-spec.md) |
| Offline sync design | [docs/architecture/offline-sync.md](docs/architecture/offline-sync.md) |
| Database ERD & migrations | [docs/database/erd.md](docs/database/erd.md) |
| API reference | [docs/api/README.md](docs/api/README.md) · [openapi.json](docs/api/openapi.json) |
| Authentication & security | [docs/security/authentication.md](docs/security/authentication.md) |
| Local development | [docs/development/local-development.md](docs/development/local-development.md) |
| Coolify deployment | [docs/deployment/coolify.md](docs/deployment/coolify.md) |
| Cloudflare web deployment | [docs/deployment/cloudflare-web.md](docs/deployment/cloudflare-web.md) |
| Android APK build | [docs/mobile/android-apk-build.md](docs/mobile/android-apk-build.md) |
| Backup & restore | [docs/deployment/backup-restore.md](docs/deployment/backup-restore.md) |
| Environment variables | [docs/deployment/environment-variables.md](docs/deployment/environment-variables.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Design direction | [docs/design/visual-direction.md](docs/design/visual-direction.md) |
| Decisions (ADRs) | [docs/decisions](docs/decisions) |
