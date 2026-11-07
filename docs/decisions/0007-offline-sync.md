# ADR 0007 — Mobile offline sync via outbox + idempotent operations

**Status:** accepted · 2026-11-07

**Decision.** The Android app writes transactions to SQLite immediately and appends operations to
an outbox. Each transaction has a client-generated UUID and each operation an `opId`; the server
records applied ops (`sync_operations`) so retries never duplicate. Conflicts resolve server-wins
using `baseUpdatedAt`; invalid ops are `rejected` and surfaced. Pull uses a server timestamp cursor
and tombstones. Nothing is shown as synced until the server acknowledges it.
