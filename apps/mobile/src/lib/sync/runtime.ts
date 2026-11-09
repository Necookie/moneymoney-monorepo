import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getApi } from '../api';
import { getDatabase } from '../db/database';
import { syncCounts } from '../db/queries';
import { SqliteStorage } from '../db/sqliteStorage';
import { bumpLocalData } from '../events';
import { SyncEngine, type SyncErrorInfo, type SyncResult, type SyncRunOptions } from './engine';
import {
  createLocalTransaction,
  deleteLocalTransaction,
  discardLocalChanges,
  retryFailedTransaction,
  updateLocalTransaction,
  type CreateTransactionInput,
  type MutationDeps,
} from './mutations';
import { META, type SyncNotice, type TransactionFields } from './types';

/** App-facing sync state (drives the global indicator). */
export interface SyncStatus {
  ready: boolean;
  running: boolean;
  online: boolean;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  lastError: SyncErrorInfo | null;
  notices: SyncNotice[];
}

let status: SyncStatus = {
  ready: false,
  running: false,
  online: true,
  pending: 0,
  failed: 0,
  lastSyncedAt: null,
  lastError: null,
  notices: [],
};
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => status,
    () => status,
  );
}

type AfterSyncHook = (result: SyncResult, storage: SqliteStorage) => Promise<void> | void;
const afterSyncHooks = new Set<AfterSyncHook>();

/** Register work to run after each sync (e.g. reschedule notifications after a pull). */
export function onAfterSync(hook: AfterSyncHook): () => void {
  afterSyncHooks.add(hook);
  return () => {
    afterSyncHooks.delete(hook);
  };
}

export interface SyncRuntime {
  storage: SqliteStorage;
  engine: SyncEngine;
  deps: MutationDeps;
}

let runtime: Promise<SyncRuntime> | null = null;

export function getSyncRuntime(): Promise<SyncRuntime> {
  if (!runtime) {
    runtime = (async () => {
      const db = await getDatabase();
      const storage = new SqliteStorage(db);
      const api = getApi();
      const clock = { now: () => Date.now() };
      const engine = new SyncEngine({
        storage,
        api: { push: (b) => api.sync.push(b), pull: (s) => api.sync.pull(s) },
        clock,
        uuid: () => Crypto.randomUUID(),
      });
      const deps: MutationDeps = { storage, uuid: () => Crypto.randomUUID(), clock };
      return { storage, engine, deps };
    })().catch((err: unknown) => {
      runtime = null;
      throw err;
    });
  }
  return runtime;
}

/** Re-read counters & notices from SQLite into the status store. */
export async function refreshSyncStatus(): Promise<void> {
  const { storage } = await getSyncRuntime();
  const [counts, notices, lastSyncedAt, lastError] = await Promise.all([
    syncCounts(storage.db),
    storage.listNotices(),
    storage.getMeta(META.lastSyncedAt),
    storage.getMeta(META.lastSyncError),
  ]);
  setStatus({
    ready: true,
    pending: counts.pending,
    failed: counts.failed,
    notices,
    lastSyncedAt,
    lastError: lastError ? (JSON.parse(lastError) as SyncErrorInfo) : null,
  });
}

let currentRun: Promise<SyncResult> | null = null;
/** Set while signing out: no sync may write the previous user's data back into SQLite. */
let paused = false;

const SKIPPED: SyncResult = {
  ok: false,
  applied: 0,
  duplicates: 0,
  conflicts: 0,
  rejected: 0,
  remaining: 0,
  pulled: false,
  error: null,
};

/**
 * Run a sync now (single-flight: joins a run already in progress). After-sync hooks run once
 * per run, not once per caller — otherwise concurrent callers (pull-to-refresh during a
 * periodic sync) would schedule the same reminders and alert notifications twice.
 */
export function syncNow(options: SyncRunOptions = {}): Promise<SyncResult> {
  if (paused) return Promise.resolve({ ...SKIPPED });
  if (!currentRun) {
    currentRun = runSync(options).finally(() => {
      currentRun = null;
    });
  }
  return currentRun;
}

async function runSync(options: SyncRunOptions): Promise<SyncResult> {
  const rt = await getSyncRuntime();
  if (paused) return { ...SKIPPED };
  setStatus({ running: true });
  try {
    const result = await rt.engine.sync(options);
    if (result.error?.kind === 'offline') setStatus({ online: false });
    else if (result.pulled) setStatus({ online: true });
    for (const hook of afterSyncHooks) {
      if (paused) break;
      try {
        await hook(result, rt.storage);
      } catch (err) {
        console.warn('after-sync hook failed', err);
      }
    }
    return result;
  } finally {
    bumpLocalData();
    await refreshSyncStatus().catch(() => undefined);
    setStatus({ running: false });
  }
}

/** True while local data is being wiped (sign-out); caches must not be written meanwhile. */
export function isSyncPaused(): boolean {
  return paused;
}

/** Allow syncing again (a signed-in app tree mounted, or sign-out was abandoned). */
export function resumeSync(): void {
  paused = false;
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** Ask for a sync soon (debounced). Errors are reflected in the status store, never thrown. */
export function requestSync(delayMs = 400): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    syncNow().catch((err: unknown) => console.warn('sync failed', err));
  }, delayMs);
}

// ── Local-first mutations (write locally, enqueue, return immediately) ─────────────────────

async function afterMutation() {
  bumpLocalData();
  await refreshSyncStatus();
  requestSync();
}

export async function addTransaction(input: CreateTransactionInput) {
  const { deps } = await getSyncRuntime();
  const tx = await createLocalTransaction(deps, input);
  await afterMutation();
  return tx;
}

export async function editTransaction(id: string, patch: Partial<TransactionFields>) {
  const { deps } = await getSyncRuntime();
  const tx = await updateLocalTransaction(deps, id, patch);
  await afterMutation();
  return tx;
}

export async function removeTransaction(id: string) {
  const { deps } = await getSyncRuntime();
  await deleteLocalTransaction(deps, id);
  await afterMutation();
}

export async function retryTransaction(id: string) {
  const { deps } = await getSyncRuntime();
  await retryFailedTransaction(deps, id);
  await afterMutation();
}

export async function discardTransactionChanges(id: string) {
  const { deps } = await getSyncRuntime();
  await discardLocalChanges(deps, id);
  await afterMutation();
}

export async function dismissNotices(ids?: string[]) {
  const { storage } = await getSyncRuntime();
  await storage.clearNotices(ids);
  await refreshSyncStatus();
}

// ── Triggers: foreground, connectivity regained, periodic while open ────────────────────────

const PERIODIC_MS = 2 * 60_000;

/** Start foreground sync triggers. Returns a stop function. */
export function startSyncTriggers(): () => void {
  resumeSync();
  let lastState: AppStateStatus | string | null | undefined = AppState.currentState;
  const appSub = AppState.addEventListener('change', (next) => {
    if (lastState !== 'active' && next === 'active') requestSync(0);
    lastState = next;
  });

  let wasOnline: boolean | null = null;
  const netUnsub = NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    setStatus({ online });
    if (online && wasOnline === false) requestSync(0);
    wasOnline = online;
  });

  const timer = setInterval(() => {
    if (AppState.currentState === 'active') requestSync(0);
  }, PERIODIC_MS);

  refreshSyncStatus().catch(() => undefined);
  requestSync(0);

  return () => {
    appSub.remove();
    netUnsub();
    clearInterval(timer);
  };
}

/**
 * Forget everything local (sign-out). Pauses sync first and waits for a run in flight, so a
 * pull that was already on the wire cannot refill the wiped tables with the old account's
 * data. Sync stays paused until `resumeSync()` (the next signed-in session).
 */
export async function resetLocalData(): Promise<void> {
  paused = true;
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
  await currentRun?.catch(() => undefined);
  const { storage } = await getSyncRuntime();
  await storage.clearAll();
  bumpLocalData();
  await refreshSyncStatus();
}
