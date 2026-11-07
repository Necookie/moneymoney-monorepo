import { randomUUID } from 'node:crypto';
import type {
  Account,
  SyncOperation,
  SyncOpResult,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  Transaction,
} from '@mm/api-client';
import type { SyncApi } from '../src/lib/sync/types';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
export const SAVINGS_ID = '00000000-0000-4000-8000-000000000002';

/**
 * A small in-memory model of the API's sync semantics (apps/api/src/modules/sync/routes.ts):
 * per-opId idempotency, create idempotent on client UUID, stale baseUpdatedAt → conflict,
 * validation failures → rejected, tombstones on delete, `since` pulls by updatedAt.
 */
export class FakeServer implements SyncApi {
  txs = new Map<string, Transaction>();
  seenOps = new Map<string, string>(); // opId → entityId
  pushCalls: SyncPushRequest[] = [];
  pullCalls: (string | undefined)[] = [];
  /** Queue of failures to throw on the next push calls. */
  failNextPush: Error[] = [];
  failNextPull: Error[] = [];
  /** Simulate "the server applied it but the response was lost". */
  dropResponseOnce = false;
  private tick = Date.parse('2026-11-07T00:00:00.000Z');
  accounts: Account[] = [
    account(ACCOUNT_ID, 'Wallet', 'cash', 100_000),
    account(SAVINGS_ID, 'Savings', 'savings', 500_000),
  ];

  now(): string {
    this.tick += 1000;
    return new Date(this.tick).toISOString();
  }

  /** Simulate an edit made on another device (e.g. the web app). */
  editElsewhere(id: string, patch: Partial<Transaction>) {
    const tx = this.txs.get(id);
    if (!tx) throw new Error('missing');
    this.txs.set(id, { ...tx, ...patch, updatedAt: this.now() });
  }

  deleteElsewhere(id: string) {
    const tx = this.txs.get(id);
    if (!tx) throw new Error('missing');
    const at = this.now();
    this.txs.set(id, { ...tx, deletedAt: at, updatedAt: at });
  }

  createElsewhere(partial: Partial<Transaction> = {}): Transaction {
    const at = this.now();
    const tx: Transaction = {
      id: randomUUID(),
      type: 'expense',
      amount: 1_000,
      accountId: ACCOUNT_ID,
      counterAccountId: null,
      categoryId: null,
      occurredOn: '2026-11-07',
      description: 'Elsewhere',
      notes: null,
      tags: [],
      scheduledEventId: null,
      occurrenceDate: null,
      isDemo: false,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      ...partial,
    };
    this.txs.set(tx.id, tx);
    return tx;
  }

  liveCount(): number {
    return [...this.txs.values()].filter((t) => !t.deletedAt).length;
  }

  async push(body: SyncPushRequest): Promise<SyncPushResponse> {
    this.pushCalls.push(structuredClone(body));
    const failure = this.failNextPush.shift();
    if (failure) throw failure;
    if (body.operations.length < 1 || body.operations.length > 200) {
      throw new HttpError(400, 'operations must contain 1..200 items');
    }
    for (const op of body.operations) {
      if (op.op === 'create' && op.data.amount > 10_000_000_000) {
        // Schema-level failure: the whole request is refused with 400.
        throw new HttpError(400, 'Validation failed');
      }
    }
    const results = body.operations.map((op) => this.apply(op));
    if (this.dropResponseOnce) {
      this.dropResponseOnce = false;
      throw new HttpError(0, 'Network unavailable');
    }
    return { results, serverTime: this.now() };
  }

  private apply(op: SyncOperation): SyncOpResult {
    const seen = this.seenOps.get(op.opId);
    if (seen) {
      return { opId: op.opId, status: 'duplicate', transaction: this.txs.get(seen) ?? null };
    }
    const entityId = op.op === 'create' ? op.data.id : op.id;
    let result: SyncOpResult;
    if (op.op === 'create') {
      const existing = this.txs.get(op.data.id);
      if (existing) {
        result = { opId: op.opId, status: 'duplicate', transaction: existing };
      } else if (op.data.amount <= 0) {
        result = {
          opId: op.opId,
          status: 'rejected',
          message: 'Amount must be positive',
          transaction: null,
        };
      } else {
        const at = this.now();
        const tx: Transaction = {
          id: op.data.id,
          type: op.data.type,
          amount: op.data.amount,
          accountId: op.data.accountId,
          counterAccountId: op.data.counterAccountId ?? null,
          categoryId: op.data.categoryId ?? null,
          occurredOn: op.data.occurredOn,
          description: op.data.description ?? '',
          notes: op.data.notes ?? null,
          tags: op.data.tags ?? [],
          scheduledEventId: null,
          occurrenceDate: null,
          isDemo: false,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        this.txs.set(tx.id, tx);
        result = { opId: op.opId, status: 'applied', transaction: tx };
      }
    } else if (op.op === 'update') {
      const existing = this.txs.get(op.id);
      if (!existing) {
        result = {
          opId: op.opId,
          status: 'rejected',
          message: 'Transaction not found',
          transaction: null,
        };
      } else if (
        existing.deletedAt ||
        (op.baseUpdatedAt && existing.updatedAt > op.baseUpdatedAt)
      ) {
        result = {
          opId: op.opId,
          status: 'conflict',
          message: existing.deletedAt
            ? 'Deleted on another device'
            : 'Changed on another device; server copy kept',
          transaction: existing,
        };
      } else if (op.data.amount !== undefined && op.data.amount <= 0) {
        result = {
          opId: op.opId,
          status: 'rejected',
          message: 'Amount must be positive',
          transaction: null,
        };
      } else {
        const next: Transaction = {
          ...existing,
          ...(op.data as Partial<Transaction>),
          updatedAt: this.now(),
        };
        this.txs.set(op.id, next);
        result = { opId: op.opId, status: 'applied', transaction: next };
      }
    } else {
      const existing = this.txs.get(op.id);
      if (!existing || existing.deletedAt) {
        result = { opId: op.opId, status: 'applied', message: 'Already gone', transaction: null };
      } else {
        const at = this.now();
        const next = { ...existing, deletedAt: at, updatedAt: at };
        this.txs.set(op.id, next);
        result = { opId: op.opId, status: 'applied', transaction: next };
      }
    }
    this.seenOps.set(op.opId, entityId);
    return result;
  }

  async pull(since?: string): Promise<SyncPullResponse> {
    this.pullCalls.push(since);
    const failure = this.failNextPull.shift();
    if (failure) throw failure;
    const serverTime = this.now();
    const transactions = [...this.txs.values()].filter((t) =>
      since ? t.updatedAt >= since : !t.deletedAt,
    );
    // Balances are derived from live transactions, like the real API.
    const balances = new Map(this.accounts.map((a) => [a.id, a.openingBalance]));
    for (const t of this.txs.values()) {
      if (t.deletedAt) continue;
      const sign = t.type === 'expense' ? -1 : 1;
      if (t.type === 'transfer') {
        balances.set(t.accountId, (balances.get(t.accountId) ?? 0) - t.amount);
        if (t.counterAccountId)
          balances.set(t.counterAccountId, (balances.get(t.counterAccountId) ?? 0) + t.amount);
      } else {
        balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + sign * t.amount);
      }
    }
    return {
      serverTime,
      accounts: this.accounts.map((a) => ({ ...a, balance: balances.get(a.id) ?? 0 })),
      categories: [],
      transactions: structuredClone(transactions),
      upcoming: [],
      settings: {
        currency: 'PHP',
        timezone: 'Asia/Manila',
        safetyBuffer: 0,
        emergencyFundGoalId: null,
        demoMode: false,
        updatedAt: serverTime,
      },
    };
  }
}

function account(id: string, name: string, type: Account['type'], opening: number): Account {
  return {
    id,
    name,
    type,
    currency: 'PHP',
    openingBalance: opening,
    openingDate: '2026-11-01',
    balance: opening,
    color: null,
    icon: null,
    archived: false,
    isDemo: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}
