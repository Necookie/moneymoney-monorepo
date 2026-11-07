import type { SyncOpResult, SyncPullResponse } from '@mm/api-client';
import { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from './backoff';
import { fromServer } from './mutations';
import {
  META,
  type Clock,
  type LocalTransaction,
  type OutboxEntry,
  type SyncApi,
  type SyncStorage,
} from './types';

export const MAX_BATCH = 200;

export type SyncErrorKind = 'offline' | 'server' | 'auth' | 'forbidden' | 'client';

export interface SyncErrorInfo {
  kind: SyncErrorKind;
  status: number;
  message: string;
}

export interface SyncResult {
  ok: boolean;
  applied: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  /** Ops still waiting in the outbox after this run. */
  remaining: number;
  pulled: boolean;
  error: SyncErrorInfo | null;
}

export interface SyncEngineOptions {
  storage: SyncStorage;
  api: SyncApi;
  clock?: Clock;
  uuid: () => string;
  batchSize?: number;
  backoff?: BackoffOptions;
}

export interface SyncRunOptions {
  /** Ignore backoff windows (manual "Sync now"). */
  force?: boolean;
  /** Skip the pull phase. */
  pushOnly?: boolean;
}

/** HTTP status of a thrown error (0 = network/unknown). Works with the api-client's ApiError. */
export function errorStatus(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

export function classifyError(err: unknown): SyncErrorInfo {
  const status = errorStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status === 0) return { kind: 'offline', status, message };
  if (status === 401) return { kind: 'auth', status, message };
  if (status === 403) return { kind: 'forbidden', status, message };
  if (status === 408 || status === 429 || status >= 500) return { kind: 'server', status, message };
  return { kind: 'client', status, message };
}

const isRetryable = (e: SyncErrorInfo) => e.kind === 'offline' || e.kind === 'server';

/**
 * Offline-first sync engine: push the outbox in order, then pull changes.
 *
 * Guarantees:
 * - Single flight: concurrent `sync()` calls share one run.
 * - A row only becomes `synced` after the server acknowledged it (applied/duplicate/pull).
 * - At most one op per entity per batch, so per-entity order is preserved and later updates
 *   can be rebased onto the server's new `updatedAt` from our own earlier op.
 * - Conflicts: server wins, remaining ops for that entity are dropped, a notice is recorded.
 * - Rejections: the op (and dependent ops) are dropped, the row is marked `failed`.
 * - Network / 5xx / 429: ops stay queued with exponential backoff.
 */
export class SyncEngine {
  private readonly storage: SyncStorage;
  private readonly api: SyncApi;
  private readonly clock: Clock;
  private readonly uuid: () => string;
  private readonly batchSize: number;
  private readonly backoff: BackoffOptions;
  private inflight: Promise<SyncResult> | null = null;

  constructor(options: SyncEngineOptions) {
    this.storage = options.storage;
    this.api = options.api;
    this.clock = options.clock ?? { now: () => Date.now() };
    this.uuid = options.uuid;
    this.batchSize = Math.min(MAX_BATCH, Math.max(1, options.batchSize ?? MAX_BATCH));
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
  }

  get running(): boolean {
    return this.inflight !== null;
  }

  sync(options: SyncRunOptions = {}): Promise<SyncResult> {
    if (!this.inflight) {
      this.inflight = this.run(options).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async run(options: SyncRunOptions): Promise<SyncResult> {
    const result: SyncResult = {
      ok: true,
      applied: 0,
      duplicates: 0,
      conflicts: 0,
      rejected: 0,
      remaining: 0,
      pulled: false,
      error: null,
    };

    const pushError = await this.pushAll(options.force ?? false, result);
    if (pushError) {
      result.ok = false;
      result.error = pushError;
    }

    // Pull unless we know we are offline or not allowed in (a 5xx push may still allow a pull).
    const blocked =
      pushError !== null &&
      (pushError.kind === 'offline' || pushError.kind === 'auth' || pushError.kind === 'forbidden');
    if (!options.pushOnly && !blocked) {
      try {
        await this.pull();
        result.pulled = true;
      } catch (err) {
        result.ok = false;
        result.error = result.error ?? classifyError(err);
      }
    }

    result.remaining = (await this.storage.listOutbox()).length;
    const now = new Date(this.clock.now()).toISOString();
    await this.storage.setMeta(
      META.lastSyncError,
      result.error ? JSON.stringify(result.error) : null,
    );
    if (result.ok) await this.storage.setMeta(META.lastSyncedAt, now);
    return result;
  }

  /** Select the next batch: outbox order, ≤ batchSize, one op per entity, respecting backoff. */
  private selectBatch(
    outbox: OutboxEntry[],
    force: boolean,
    size: number,
    tried: ReadonlySet<string>,
  ): OutboxEntry[] {
    const now = this.clock.now();
    const batch: OutboxEntry[] = [];
    const touched = new Set<string>();
    for (const entry of outbox) {
      if (touched.has(entry.entityId)) continue;
      touched.add(entry.entityId); // later ops for this entity must wait for this one
      // Already attempted (and deferred) during this run, or still backing off: wait.
      if (tried.has(entry.opId)) continue;
      if (!force && entry.nextAttemptAt > now) continue;
      batch.push(entry);
      if (batch.length >= size) break;
    }
    return batch;
  }

  private async pushAll(force: boolean, result: SyncResult): Promise<SyncErrorInfo | null> {
    let size = this.batchSize;
    const tried = new Set<string>();
    // Each round removes or defers at least one op, so this terminates; the cap is a safety net.
    for (let round = 0; round < 10_000; round++) {
      // Selecting and marking happen under the storage lock so a concurrent local edit can never
      // be folded into an op that is already on the wire (it gets its own op instead).
      const batch = await this.storage.transaction(async () => {
        const selected = this.selectBatch(await this.storage.listOutbox(), force, size, tried);
        for (const e of selected) {
          tried.add(e.opId);
          await this.storage.updateOutbox(e.opId, { attempts: e.attempts + 1 });
        }
        return selected;
      });
      if (batch.length === 0) return null;

      let results: SyncOpResult[];
      try {
        const res = await this.api.push({ operations: batch.map((e) => e.payload) });
        results = res.results;
      } catch (err) {
        const info = classifyError(err);
        if (isRetryable(info)) {
          await this.defer(batch, info.message);
          return info;
        }
        if (info.kind === 'client') {
          if (batch.length > 1) {
            // The whole request was refused (e.g. one malformed op failed schema validation).
            // Isolate the offender by sending one op at a time.
            for (const e of batch) {
              tried.delete(e.opId);
              await this.storage.updateOutbox(e.opId, { attempts: e.attempts });
            }
            size = 1;
            continue;
          }
          const only = batch[0]!;
          await this.handleResult(
            only,
            { opId: only.opId, status: 'rejected', message: info.message, transaction: null },
            result,
          );
          continue;
        }
        // auth / forbidden: keep everything queued untouched, surface the error.
        for (const e of batch) {
          await this.storage.updateOutbox(e.opId, {
            attempts: e.attempts,
            lastError: info.message,
          });
        }
        return info;
      }

      const byOp = new Map(results.map((r) => [r.opId, r]));
      const missing: OutboxEntry[] = [];
      for (const e of batch) {
        const r = byOp.get(e.opId);
        if (!r) missing.push(e);
        else await this.handleResult(e, r, result);
      }
      if (missing.length) await this.defer(missing, 'No result returned for this operation');
    }
    return null;
  }

  private async defer(entries: OutboxEntry[], message: string): Promise<void> {
    const now = this.clock.now();
    for (const e of entries) {
      const attempts = e.attempts + 1;
      await this.storage.updateOutbox(e.opId, {
        attempts,
        lastError: message,
        nextAttemptAt: now + backoffDelay(attempts, this.backoff),
      });
    }
  }

  private async handleResult(entry: OutboxEntry, r: SyncOpResult, result: SyncResult) {
    await this.storage.transaction(async () => {
      const ops = (await this.storage.listOutbox()).filter(
        (o) => o.entityId === entry.entityId && o.opId !== entry.opId,
      );
      const row = await this.storage.getTransaction(entry.entityId);
      const at = new Date(this.clock.now()).toISOString();

      switch (r.status) {
        case 'applied':
        case 'duplicate': {
          if (r.status === 'applied') result.applied++;
          else result.duplicates++;
          await this.storage.removeOutbox([entry.opId]);
          if (!row) return; // discarded locally meanwhile
          const server = r.transaction;
          if (ops.length === 0) {
            if (!server || server.deletedAt) await this.storage.removeTransaction(row.id);
            else await this.storage.putTransaction(fromServer(server, row.pulledCopy));
            return;
          }
          // Newer local edits are queued: keep local content, remember the server copy and
          // rebase queued updates onto it (they descend from the op that was just applied).
          if (server) {
            await this.storage.putTransaction({ ...row, serverCopy: server });
            for (const o of ops) {
              if (o.payload.op === 'update') {
                await this.storage.updateOutbox(o.opId, {
                  payload: { ...o.payload, baseUpdatedAt: server.updatedAt },
                });
              }
            }
          }
          return;
        }
        case 'conflict': {
          result.conflicts++;
          await this.storage.removeOutbox([entry.opId, ...ops.map((o) => o.opId)]);
          const server = r.transaction;
          if (server && !server.deletedAt) {
            await this.storage.putTransaction(fromServer(server, row?.pulledCopy ?? null));
          } else {
            await this.storage.removeTransaction(entry.entityId);
          }
          await this.storage.addNotice({
            id: this.uuid(),
            kind: 'conflict',
            entityId: entry.entityId,
            message: describe(row, r.message ?? 'Changed on another device; server copy kept'),
            createdAt: at,
          });
          return;
        }
        case 'rejected': {
          result.rejected++;
          // Dependent ops for the same entity cannot succeed either; stop retrying them.
          await this.storage.removeOutbox([entry.opId, ...ops.map((o) => o.opId)]);
          const message = r.message ?? 'Rejected by the server';
          if (row) {
            await this.storage.putTransaction({ ...row, syncState: 'failed', syncError: message });
          }
          await this.storage.addNotice({
            id: this.uuid(),
            kind: 'rejected',
            entityId: entry.entityId,
            message: describe(row, message),
            createdAt: at,
          });
          return;
        }
      }
    });
  }

  /** Pull changes since the last pull and merge them without clobbering pending local rows. */
  async pull(): Promise<SyncPullResponse> {
    const since = (await this.storage.getMeta(META.lastPulledAt)) ?? undefined;
    const res = await this.api.pull(since);
    await this.applyPull(res, since === undefined);
    return res;
  }

  async applyPull(res: SyncPullResponse, full: boolean): Promise<void> {
    await this.storage.transaction(async () => {
      await this.storage.replaceAccounts(res.accounts);
      await this.storage.replaceCategories(res.categories);
      await this.storage.replaceUpcoming(res.upcoming);
      await this.storage.setMeta(META.settings, JSON.stringify(res.settings));

      const queued = new Set((await this.storage.listOutbox()).map((o) => o.entityId));
      const seen = new Set<string>();
      for (const tx of res.transactions) {
        seen.add(tx.id);
        const local = await this.storage.getTransaction(tx.id);
        const hasLocalChanges = queued.has(tx.id) || (local && local.syncState !== 'synced');
        if (hasLocalChanges) {
          // Never overwrite unsynced local content; only track what the server now has.
          if (local)
            await this.storage.putTransaction({ ...local, serverCopy: tx, pulledCopy: tx });
          continue;
        }
        if (tx.deletedAt) await this.storage.removeTransaction(tx.id);
        else await this.storage.putTransaction(fromServer(tx, tx));
      }

      if (full) {
        // A full snapshot has no tombstones: drop synced rows the server no longer has.
        for (const local of await this.storage.listTransactions()) {
          if (!seen.has(local.id) && local.syncState === 'synced' && !queued.has(local.id)) {
            await this.storage.removeTransaction(local.id);
          }
        }
      }
      await this.storage.setMeta(META.lastPulledAt, res.serverTime);
    });
  }
}

function describe(row: LocalTransaction | null, message: string): string {
  if (!row) return message;
  const label = row.description || row.type;
  return `${label} (${row.occurredOn}): ${message}`;
}
