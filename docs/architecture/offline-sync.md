# Mobile offline-first sync

The Android app (`apps/mobile`) treats its local SQLite database as the source of truth for what
the user sees, and the API as the source of truth for what is **acknowledged**. Transactions can be
created, edited and deleted with no network; everything else (planner actions, budgets, goals,
settings, forecasts) is online-only and shows the last cached copy when offline.

Code: `apps/mobile/src/lib/sync/` (pure TypeScript, unit-tested) and
`apps/mobile/src/lib/db/` (expo-sqlite implementation).

## Local schema (`src/lib/db/database.ts`, versioned by `PRAGMA user_version`)

| Table | Purpose |
|---|---|
| `transactions` | Mirror of server transactions + local state: `sync_state` (`synced`/`pending`/`failed`), `sync_error`, `server_json` (last acknowledged server copy), `pulled_json` (server copy as of the last pull), `deleted_at` (local pending delete). |
| `outbox` | Ordered queue: `seq`, `op_id` (UUID), `entity_id`, `op`, `payload` (exact `SyncOperation`), `attempts`, `next_attempt_at`, `last_error`. |
| `accounts`, `categories`, `upcoming` | Replaced wholesale on every pull (server balances, 60-day occurrences). |
| `meta` | `lastPulledAt` (server time), `lastSyncedAt`, `lastSyncError`, `settings`, flags. |
| `notices` | Conflicts/rejections to surface to the user. |
| `cache` | Last good JSON for online-only screens (dashboard, forecast, budgets…), shown offline with an "Offline — …" banner. |
| `scheduled_notifications` | Dedupe map: occurrence key → local notification id. |

Migrations are append-only; never edit a shipped one.

## Writing (`mutations.ts`)

Every mutation writes the local row **and** enqueues one outbox op inside one storage transaction,
then returns immediately (the UI never waits for the network):

- **Create**: client UUID from `expo-crypto` `randomUUID()` → `create` op carrying that id. The
  server's create is idempotent on the id.
- **Edit**: sends the full editable field set (not a diff) with `baseUpdatedAt` = last acknowledged
  server `updatedAt`. If the last queued op for that row has never been attempted, the edit is
  folded into it instead of adding a new op.
- **Delete**: if the create was never sent, the row and its ops simply disappear. Otherwise unsent
  updates are dropped, the row is hidden (`deleted_at`), and a `delete` op is queued.
- **Retry / discard** for failed rows: re-queue the current content, or restore the last server copy.

All storage-level critical sections go through a promise mutex (`mutex.ts`), so an edit can never
be folded into an op that is already on the wire (batch selection + attempt marking happen under
the same lock).

## Sync run (`engine.ts`)

Single-flight (concurrent calls share one run). Push, then pull.

**Push** — repeated rounds until nothing is sendable:

1. Under the lock, select ≤ 200 ops in outbox order, **at most one per entity** (later ops for that
   entity wait), skipping ops still in their backoff window (manual "Sync now" ignores backoff), and
   increment their `attempts`.
2. `POST /sync/push`. Per result:
   - `applied` / `duplicate` → op removed. If no newer ops exist for the row, the row is replaced by
     the server copy and becomes `synced`. If newer local edits are queued, the local content is kept,
     the server copy is remembered and the queued updates are **rebased** onto the new `updatedAt`
     (they descend from our own just-applied op, so this is not a conflict).
   - `conflict` → server wins: the row becomes the server copy (or is removed if deleted remotely),
     all queued ops for that row are dropped, and a notice is recorded and shown in Activity.
   - `rejected` → op and dependent ops dropped (never retried automatically); row marked `failed`
     with the server's message; the user can fix + retry, or discard.
   - result missing → op deferred with backoff.
3. Whole-request failures:
   - network / timeout / 5xx / 429 → ops stay queued; `next_attempt_at = now + backoff` (exponential,
     5 s base, 15 min cap, equal jitter); the run stops.
   - 400/422 for a multi-op batch → retried one op at a time to isolate the malformed op, which is
     then marked rejected.
   - 401/403 → nothing changes in the queue; the error is surfaced (403 = "This Money Money instance
     is private" full-screen state).

**Pull** — `GET /sync/pull?since=<lastPulledAt>` (full snapshot the first time), in one transaction:
accounts, categories, upcoming occurrences and settings are replaced; each changed transaction is
upserted **unless the row has queued ops or is pending/failed locally** — in that case only its
`server_json`/`pulled_json` are updated so local content is never clobbered. Tombstones
(`deletedAt`) remove synced rows. A full snapshot also drops synced rows the server no longer has.
`lastPulledAt` = the response's `serverTime` (captured server-side before reading, so concurrent
writes are re-sent next time).

A row is **never** shown or counted as synced until the server acknowledged it (push result or
pull). The global indicator reads: `Synced` · `Syncing…` · `Pending N` · `Offline · N pending` ·
`Failed N` · `Access denied` · `Sign in again`.

## Offline balances (`balances.ts`)

Account balances come from the last pull. For each local row, the "unsynced delta" is the balance
effect of what the server *will* hold once queued work lands (pending → local content, failed →
last server copy, deleted → nothing) minus the effect of the copy that pull saw (`pulled_json`).
Displayed balance = server balance + delta; screens label it "includes N unsynced". Transfers net
to zero across own accounts and are never income or spending. Uses `transactionEffects` from
`@mm/finance-engine`, integer centavos only.

## Triggers

- after every local mutation (debounced 400 ms);
- app returns to foreground (`AppState`);
- connectivity regained (`NetInfo`);
- every 2 minutes while the app is open and active;
- when Clerk finishes loading (the app can open offline from the local DB before that);
- **background**: `expo-background-task` task `moneymoney-background-sync`, registered with a 30-minute
  minimum interval (Android WorkManager; the OS decides when it actually runs). In the background,
  Clerk is loaded headlessly from the SecureStore token cache to obtain a session token.

After each sync that pulled, bill reminders are rescheduled from the local `upcoming` table and new
critical alerts produce one local notification each.

## Auth & offline launch

Clerk tokens live in SecureStore (`@clerk/expo/token-cache`); `__experimental_resourceCache`
lets Clerk start offline. If Clerk can't load within 2.5 s and this device previously had a
session, the app opens in offline mode from SQLite; token failures are classified as "offline"
(retry later), never as sign-out. Sign-out wipes the local DB, cached queries, scheduled
notifications and the background task (the user is warned if unsynced changes would be lost).

## Tests

`apps/mobile/test/sync.test.ts` runs the engine against an in-memory storage and a fake server
that mirrors `apps/api/src/modules/sync/routes.ts` semantics: idempotent retries (lost response +
replay → one record), duplicate replay, conflicts (edit and delete elsewhere), rejected ops (never
retried; retry/discard), schema-level 400 isolation, backoff timing and caps, 403 handling,
batching (200 + 50), per-entity ordering & rebasing, edits during an in-flight push, pull not
clobbering pending rows, tombstones, and offline balance deltas. Run with `pnpm --filter @mm/mobile test`.
