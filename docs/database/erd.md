# Database (PostgreSQL 17) — ERD and migrations

Schema source: `packages/database/src/schema.ts`. Migrations: `packages/database/drizzle/*.sql`.

```mermaid
erDiagram
  users ||--|| user_settings : has
  users ||--o{ accounts : owns
  users ||--o{ categories : owns
  users ||--o{ transactions : owns
  users ||--o{ scheduled_events : owns
  users ||--o{ budgets : owns
  users ||--o{ goals : owns
  users ||--o{ alerts : receives
  users ||--o{ sync_operations : logs
  accounts ||--o{ transactions : "account_id / counter_account_id"
  categories ||--o{ transactions : categorises
  scheduled_events ||--o{ occurrence_overrides : adjusts
  scheduled_events ||--o{ transactions : "realised by (scheduled_event_id, occurrence_date)"
  transactions ||--o| occurrence_overrides : "paid via"
  accounts ||--o{ scheduled_events : "pays from"
  categories ||--o{ scheduled_events : categorises
  categories ||--o{ budgets : limits
  goals ||--o{ goal_allocations : funded_by
  accounts ||--o{ goals : "held in"

  users { uuid id PK; text clerk_user_id UK; text email }
  user_settings { uuid user_id PK; text timezone; bigint safety_buffer; uuid emergency_fund_goal_id; bool demo_mode }
  accounts { uuid id PK; uuid user_id; enum type; bigint opening_balance; date opening_date; timestamptz archived_at; bool is_demo }
  categories { uuid id PK; uuid user_id; text name; enum kind }
  transactions { uuid id PK "client-generated"; uuid user_id; enum type; bigint amount; uuid account_id; uuid counter_account_id; uuid category_id; date occurred_on; text[] tags; uuid scheduled_event_id; date occurrence_date; timestamptz deleted_at }
  scheduled_events { uuid id PK; enum direction; enum kind; enum status; bigint amount; bigint amount_min; bigint amount_max; enum confidence; date start_date; enum frequency; int interval; int day_of_month; int second_day_of_month; enum month_end_rule; date end_date; int occurrence_count; int installments }
  occurrence_overrides { uuid id PK; uuid event_id; date occurrence_date; enum action; date new_date; bigint amount; uuid transaction_id }
  budgets { uuid id PK; uuid category_id "NULL = overall"; bigint amount }
  goals { uuid id PK; enum kind; bigint target_amount; date target_date; bigint monthly_contribution; uuid account_id }
  goal_allocations { uuid id PK; uuid goal_id; bigint amount; date allocated_on }
  alerts { uuid id PK; enum rule; enum severity; text fingerprint; enum status }
  sync_operations { uuid id PK "client op id"; text entity; uuid entity_id; enum op; text status; jsonb result }
```

## Integrity rules

- **Ownership:** composite FKs `(child.x_id, child.user_id) → parent(id, user_id)` on every
  cross-table reference (accounts, categories, events, goals).
- **Money:** `BIGINT` centavos. `transactions_amount_sign`: positive except `adjustment` (non-zero).
  `transactions_transfer_shape`: transfers need a different destination account; others none.
- **No double counting:** partial unique index on `(scheduled_event_id, occurrence_date)` for live
  transactions.
- **Idempotency:** `transactions.id` and `sync_operations.id` are client-generated keys.
- **Alert dedup:** unique `(user_id, fingerprint)`.
- **Budgets:** one per category, one overall (partial unique indexes).
- Deletes: financial history is soft-deleted (`transactions.deleted_at`, tombstones for sync);
  accounts with history must be archived, not deleted.

## Migration policy

1. Change `schema.ts` → `pnpm --filter @mm/database db:generate --name <change>` → review the SQL.
2. Migrations must be **additive / non-destructive** (add columns nullable or with defaults, add
   tables/indexes). Destructive changes (drop/rename/type change) require an approved two-step plan
   and a fresh verified backup first.
3. Applied automatically by `node dist/migrate.js` on every API start (Drizzle journal in
   `drizzle.__drizzle_migrations`, serialised by a Postgres advisory lock).
4. Migration history is part of every backup; restore verification checks it is present.

| # | File | Change |
|---|---|---|
| 0000 | `0000_initial_schema.sql` | Initial schema (12 tables, enums, constraints, indexes) |
