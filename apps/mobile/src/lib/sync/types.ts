import type {
  Account,
  Category,
  OccurrenceDto,
  Settings,
  SyncOperation,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  Transaction,
} from '@mm/api-client';
import type { TransactionType } from '@mm/types';

/**
 * Local sync state of a transaction row.
 * - `synced`: the server acknowledged the current local content.
 * - `pending`: local changes are queued in the outbox and NOT yet acknowledged.
 * - `failed`: the server rejected the change; it will not be retried automatically.
 */
export type SyncState = 'synced' | 'pending' | 'failed';

/** Editable fields of a transaction (what the user can change locally). */
export interface TransactionFields {
  type: TransactionType;
  amount: number;
  accountId: string;
  counterAccountId: string | null;
  categoryId: string | null;
  occurredOn: string;
  description: string;
  notes: string | null;
  tags: string[];
}

/** A transaction as stored on the device. */
export interface LocalTransaction extends TransactionFields {
  id: string;
  scheduledEventId: string | null;
  occurrenceDate: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when deleted locally (pending) — hidden from lists until the server confirms. */
  deletedAt: string | null;
  syncState: SyncState;
  syncError: string | null;
  /** Last server copy acknowledged by push or pull (null if never acknowledged). */
  serverCopy: Transaction | null;
  /**
   * The server copy as of the last pull. Account balances come from that same pull, so the
   * difference between this and the row's effective state is the "unsynced delta".
   */
  pulledCopy: Transaction | null;
}

export type OutboxOp = SyncOperation['op'];

export interface OutboxEntry {
  /** Stable operation id (UUID) — replays are detected server-side by this id. */
  opId: string;
  /** Monotonic order of enqueueing. */
  seq: number;
  entityId: string;
  op: OutboxOp;
  /** The exact SyncOperation sent to `/sync/push`. */
  payload: SyncOperation;
  attempts: number;
  /** Epoch ms before which this op should not be retried automatically. */
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: string;
}

export interface SyncNotice {
  id: string;
  kind: 'conflict' | 'rejected';
  entityId: string;
  message: string;
  createdAt: string;
}

/** Persistence used by the sync engine. Implemented by SQLite (app) and memory (tests). */
export interface SyncStorage {
  /** Runs `fn` atomically where the backend supports it. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  getTransaction(id: string): Promise<LocalTransaction | null>;
  putTransaction(tx: LocalTransaction): Promise<void>;
  removeTransaction(id: string): Promise<void>;
  listTransactions(): Promise<LocalTransaction[]>;

  /** Ordered by `seq` ascending. */
  listOutbox(): Promise<OutboxEntry[]>;
  addOutbox(entry: Omit<OutboxEntry, 'seq'>): Promise<OutboxEntry>;
  updateOutbox(opId: string, patch: Partial<Omit<OutboxEntry, 'opId' | 'seq'>>): Promise<void>;
  removeOutbox(opIds: readonly string[]): Promise<void>;

  replaceAccounts(accounts: Account[]): Promise<void>;
  listAccounts(): Promise<Account[]>;
  replaceCategories(categories: Category[]): Promise<void>;
  listCategories(): Promise<Category[]>;
  replaceUpcoming(occurrences: OccurrenceDto[]): Promise<void>;
  listUpcoming(): Promise<OccurrenceDto[]>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;

  addNotice(notice: SyncNotice): Promise<void>;
  listNotices(): Promise<SyncNotice[]>;
  clearNotices(ids?: readonly string[]): Promise<void>;
}

/** The subset of the API client the sync engine needs (easy to fake in tests). */
export interface SyncApi {
  push(body: SyncPushRequest): Promise<SyncPushResponse>;
  pull(since?: string): Promise<SyncPullResponse>;
}

export interface Clock {
  now(): number;
}

export const META = {
  lastPulledAt: 'lastPulledAt',
  lastSyncedAt: 'lastSyncedAt',
  lastSyncError: 'lastSyncError',
  settings: 'settings',
  seq: 'outboxSeq',
} as const;

export type { Settings };
