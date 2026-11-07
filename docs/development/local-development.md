# Local development

## Prerequisites

Node ≥ 22.12 (24 recommended), `corepack enable` (pnpm 12 via `packageManager`), a PostgreSQL 17
for running the API locally (Docker or native), a Clerk **development** instance key pair.

```bash
pnpm install
pnpm build          # turbo: types → finance-engine → validation → database → api-client → apps
```

## Run each app independently

| App | Command | Env file |
|---|---|---|
| API | `pnpm --filter @mm/api dev` (tsx watch, :3001) | `apps/api/.env` from `.env.example` (`MIGRATE_ON_START=true` applies migrations) |
| Web | `pnpm --filter @mm/web dev` (:3000) | `apps/web/.env.local` from `.env.example` (`NEXT_PUBLIC_API_URL=http://localhost:3001`) |
| Web on workerd | `pnpm --filter @mm/web preview` | `apps/web/.dev.vars` |
| Mobile | `pnpm --filter @mm/mobile start` | `apps/mobile/.env` (`EXPO_PUBLIC_API_URL` must be reachable from the device, e.g. your LAN IP) |

Postgres via Docker:

```bash
docker run -d --name mm-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=moneymoney postgres:17-alpine
```

Explore without real data: sign in, then *Settings → Load demo data* (flagged, removable).

## Quality gates

```bash
pnpm format:check
pnpm turbo run lint typecheck test
pnpm --filter @mm/api test            # API integration tests on in-process Postgres (PGlite)
pnpm --filter @mm/finance-engine test # engine unit tests
pnpm --filter @mm/web test:e2e        # Playwright
```

## Database changes

Edit `packages/database/src/schema.ts`, then `pnpm --filter @mm/database db:generate --name <change>`
and commit the generated SQL. See [migration policy](../database/erd.md#migration-policy).
