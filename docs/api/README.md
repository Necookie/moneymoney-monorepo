# API reference

- Base URL: `https://api.moneymoney.necookie.dev` — all business routes under **`/api/v1`**.
- Machine-readable spec: [`openapi.json`](openapi.json) (regenerate: `pnpm --filter @mm/api openapi`).
  The running API also serves `/openapi.json` and Swagger UI at `/docs`.
- Auth: `Authorization: Bearer <Clerk session token>` on every `/api/v1` route.
- Money: integer **centavos** (`₱1,234.50` → `123450`). Dates: `YYYY-MM-DD` (user timezone).
- Errors: `{ "error": { "code", "message", "requestId", "details?" } }` — `requestId` also in the
  `x-request-id` response header (send your own `x-request-id` to correlate).

| Status | Meaning |
|---|---|
| 400 `validation_failed` | Body/query failed Zod validation (`details` lists paths) |
| 401 `unauthorized` | Missing/invalid/expired token |
| 403 `forbidden` | Signed in, but not an owner of this private instance |
| 404 `not_found` | Missing — or owned by someone else (indistinguishable by design) |
| 409 `conflict` | Duplicate (e.g. occurrence already realised), account still in use |
| 422 `unprocessable` | Business rule (future-dated transaction, category kind mismatch, FK) |
| 429 | Rate limited (default 300 req/min per client IP) |

## Endpoints

| Method & path | Purpose |
|---|---|
| `GET /health` · `GET /ready` | Liveness · readiness (DB) — unauthenticated |
| `GET /api/v1/me` | Current user + settings (provisions on first call) |
| `GET/PATCH /api/v1/settings` | Timezone, safety buffer, emergency-fund goal |
| `GET /api/v1/dashboard` | Overview: position, month, safe-to-spend, upcoming, health, alerts |
| `GET/POST /api/v1/accounts` · `GET/PATCH/DELETE /api/v1/accounts/:id` | Accounts with live balances |
| `GET/POST /api/v1/categories` · `PATCH /api/v1/categories/:id` | Categories |
| `GET /api/v1/transactions` | Search/filter (`from,to,accountId,categoryId,type,tag,q,limit,cursor`) + totals |
| `POST /api/v1/transactions` | **Idempotent** create (client UUID `id`; 201 new / 200 replay) |
| `GET/PATCH/DELETE /api/v1/transactions/:id` | Read / edit / soft delete |
| `GET /api/v1/transactions/export.csv` · `POST /api/v1/transactions/import` | CSV export / import (dry run default) |
| `GET/POST /api/v1/scheduled-events` · `GET/PATCH/DELETE …/:id` | Planned income & expenses |
| `GET /api/v1/scheduled-events/occurrences?from&to` | Calendar/timeline occurrences (incl. paid/skipped) |
| `POST …/:id/postpone` · `/skip` · `/cancel` · `/split` · `/mark-paid` | Planner actions (`mark-paid` → transaction) |
| `GET/POST /api/v1/budgets` · `PATCH/DELETE …/:id` | Monthly budgets with pace (`?month=YYYY-MM`) |
| `GET/POST /api/v1/goals` · `PATCH/DELETE …/:id` · `GET/POST …/:id/allocations` | Goals + allocations |
| `GET /api/v1/forecast?horizonDays&mode&historyDays&includeBudgetedSpending` | History + projection |
| `POST /api/v1/forecast/scenarios` | Compare scenarios vs baseline |
| `POST /api/v1/forecast/affordability` | Can I afford this? (never persists) |
| `GET /api/v1/alerts?status` · `POST …/:id/dismiss` | Rule-based warnings |
| `POST /api/v1/sync/push` · `GET /api/v1/sync/pull?since` | Offline sync for mobile |
| `POST /api/v1/demo` · `DELETE /api/v1/demo` | Load / remove flagged demo data |

## Idempotency & sync semantics

- `POST /transactions` with an existing `id` returns the stored record (200) — safe to retry.
- `/sync/push` applies ops in order; each `opId` is recorded, replays return `duplicate`.
  Updates with a stale `baseUpdatedAt` return `conflict` with the server copy (server wins).
  Rule violations return `rejected` (don't retry). 5xx means retry the batch later.
- `/sync/pull?since=<serverTime>` returns changed transactions including tombstones
  (`deletedAt`), all accounts (with balances), categories, settings and 60 days of upcoming items.
