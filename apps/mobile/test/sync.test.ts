import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { backoffDelay } from '../src/lib/sync/backoff';
import { unsyncedDeltas, withLocalBalances } from '../src/lib/sync/balances';
import { SyncEngine } from '../src/lib/sync/engine';
import { MemoryStorage } from '../src/lib/sync/memoryStorage';
import {
  createLocalTransaction,
  deleteLocalTransaction,
  discardLocalChanges,
  retryFailedTransaction,
  updateLocalTransaction,
  type MutationDeps,
} from '../src/lib/sync/mutations';
import type { TransactionFields } from '../src/lib/sync/types';
import { ACCOUNT_ID, FakeServer, HttpError, SAVINGS_ID } from './fakeServer';

const BASE = { baseMs: 1_000, maxMs: 60_000, random: () => 1 };

function fields(partial: Partial<TransactionFields> = {}): TransactionFields {
  return {
    type: 'expense',
    amount: 25_000,
    accountId: ACCOUNT_ID,
    counterAccountId: null,
    categoryId: null,
    occurredOn: '2026-11-07',
    description: 'Groceries',
    notes: null,
    tags: [],
    ...partial,
  };
}

let storage: MemoryStorage;
let server: FakeServer;
let now: number;
let deps: MutationDeps;
let engine: SyncEngine;

beforeEach(() => {
  storage = new MemoryStorage();
  server = new FakeServer();
  now = Date.parse('2026-11-07T01:00:00.000Z');
  const clock = { now: () => now };
  deps = { storage, uuid: randomUUID, clock };
  engine = new SyncEngine({ storage, api: server, clock, uuid: randomUUID, backoff: BASE });
});

describe('local mutations', () => {
  it('writes locally and enqueues a create with a stable client UUID, without network', async () => {
    const tx = await createLocalTransaction(deps, fields());
    expect(tx.syncState).toBe('pending');
    const outbox = await storage.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.op).toBe('create');
    expect(outbox[0]!.payload.op === 'create' && outbox[0]!.payload.data.id).toBe(tx.id);
    expect(server.pushCalls).toHaveLength(0);
  });

  it('folds edits into a create that was never sent', async () => {
    const tx = await createLocalTransaction(deps, fields());
    await updateLocalTransaction(deps, tx.id, { amount: 30_000 });
    const outbox = await storage.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.payload.op === 'create' && outbox[0]!.payload.data.amount).toBe(30_000);
  });

  it('deleting an unsent create removes it entirely', async () => {
    const tx = await createLocalTransaction(deps, fields());
    expect(await deleteLocalTransaction(deps, tx.id)).toBe(true);
    expect(await storage.listOutbox()).toHaveLength(0);
    expect(await storage.getTransaction(tx.id)).toBeNull();
  });
});

describe('push', () => {
  it('marks rows synced only after the server acknowledges them', async () => {
    const tx = await createLocalTransaction(deps, fields());
    server.failNextPush.push(new HttpError(0, 'Network unavailable'));
    const offline = await engine.sync();
    expect(offline.ok).toBe(false);
    expect(offline.error?.kind).toBe('offline');
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('pending');
    expect(server.pullCalls).toHaveLength(0); // no pull while offline

    now += 10_000;
    const ok = await engine.sync();
    expect(ok.ok).toBe(true);
    const row = (await storage.getTransaction(tx.id))!;
    expect(row.syncState).toBe('synced');
    expect(row.serverCopy?.id).toBe(tx.id);
    expect(await storage.listOutbox()).toHaveLength(0);
  });

  it('idempotent retries: a lost response + retry yields exactly one server record', async () => {
    const tx = await createLocalTransaction(deps, fields());
    server.dropResponseOnce = true; // server applies, client never hears back
    const first = await engine.sync();
    expect(first.error?.kind).toBe('offline');
    expect(server.liveCount()).toBe(1);
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('pending');

    now += 60_000;
    const second = await engine.sync();
    expect(second.ok).toBe(true);
    expect(second.duplicates).toBe(1);
    expect(server.liveCount()).toBe(1);
    // The same opId was replayed.
    const [a, b] = server.pushCalls;
    expect(a!.operations[0]!.opId).toBe(b!.operations[0]!.opId);
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('synced');
  });

  it('same op pushed twice → one record (duplicate on replay)', async () => {
    const tx = await createLocalTransaction(deps, fields());
    const [entry] = await storage.listOutbox();
    await server.push({ operations: [entry!.payload] });
    await server.push({ operations: [entry!.payload] });
    expect(server.liveCount()).toBe(1);
    const res = await engine.sync();
    expect(res.duplicates).toBe(1);
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('synced');
  });

  it('backs off exponentially on network/5xx/429 and keeps ops queued', async () => {
    await createLocalTransaction(deps, fields());
    server.failNextPush.push(new HttpError(503, 'Unavailable'));
    await engine.sync({ pushOnly: true });
    let [entry] = await storage.listOutbox();
    expect(entry!.attempts).toBe(1);
    expect(entry!.nextAttemptAt).toBe(now + 1_000);

    // Within the backoff window nothing is sent.
    const calls = server.pushCalls.length;
    await engine.sync({ pushOnly: true });
    expect(server.pushCalls.length).toBe(calls);

    now += 1_000;
    server.failNextPush.push(new HttpError(429, 'Slow down'));
    await engine.sync({ pushOnly: true });
    [entry] = await storage.listOutbox();
    expect(entry!.attempts).toBe(2);
    expect(entry!.nextAttemptAt).toBe(now + 2_000);

    // Manual sync ignores the window.
    const forced = await engine.sync({ force: true });
    expect(forced.ok).toBe(true);
    expect(await storage.listOutbox()).toHaveLength(0);
  });

  it('backoff delay grows and is capped', () => {
    const o = { baseMs: 1_000, maxMs: 8_000, random: () => 1 };
    expect([1, 2, 3, 4, 5, 10].map((n) => backoffDelay(n, o))).toEqual([
      1_000, 2_000, 4_000, 8_000, 8_000, 8_000,
    ]);
    expect(backoffDelay(3, { ...o, random: () => 0 })).toBe(2_000);
  });

  it('rejected ops are dropped, the row is marked failed, and never retried', async () => {
    const bad = await createLocalTransaction(deps, fields({ amount: -5 }));
    const good = await createLocalTransaction(deps, fields({ description: 'Coffee' }));
    const res = await engine.sync();
    expect(res.rejected).toBe(1);
    expect(res.applied).toBe(1);
    const row = (await storage.getTransaction(bad.id))!;
    expect(row.syncState).toBe('failed');
    expect(row.syncError).toBe('Amount must be positive');
    expect((await storage.getTransaction(good.id))!.syncState).toBe('synced');
    expect(await storage.listOutbox()).toHaveLength(0);
    expect((await storage.listNotices())[0]!.kind).toBe('rejected');

    const calls = server.pushCalls.length;
    now += 3_600_000;
    await engine.sync();
    expect(server.pushCalls.length).toBe(calls);

    // The user fixes it and retries explicitly.
    await updateLocalTransaction(deps, bad.id, { amount: 500 });
    await engine.sync();
    expect((await storage.getTransaction(bad.id))!.syncState).toBe('synced');
  });

  it('isolates a schema-invalid op when the whole batch is refused with 400', async () => {
    const ok1 = await createLocalTransaction(deps, fields());
    const huge = await createLocalTransaction(deps, fields({ amount: 99_000_000_000 }));
    const ok2 = await createLocalTransaction(deps, fields());
    const res = await engine.sync();
    expect(res.rejected).toBe(1);
    expect((await storage.getTransaction(ok1.id))!.syncState).toBe('synced');
    expect((await storage.getTransaction(ok2.id))!.syncState).toBe('synced');
    expect((await storage.getTransaction(huge.id))!.syncState).toBe('failed');
  });

  it('auth/forbidden errors keep the outbox intact and skip the pull', async () => {
    const tx = await createLocalTransaction(deps, fields());
    server.failNextPush.push(new HttpError(403, 'This Money Money instance is private'));
    const res = await engine.sync();
    expect(res.error?.kind).toBe('forbidden');
    expect(server.pullCalls).toHaveLength(0);
    const [entry] = await storage.listOutbox();
    expect(entry!.attempts).toBe(0);
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('pending');
  });

  it('retry and discard of failed rows', async () => {
    const tx = await createLocalTransaction(deps, fields({ amount: -1 }));
    await engine.sync();
    await retryFailedTransaction(deps, tx.id);
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('pending');
    await engine.sync(); // still invalid → failed again
    expect((await storage.getTransaction(tx.id))!.syncState).toBe('failed');
    await discardLocalChanges(deps, tx.id);
    expect(await storage.getTransaction(tx.id)).toBeNull();
  });

  it('pushes in batches of at most 200, one op per entity per batch, preserving order', async () => {
    for (let i = 0; i < 250; i++) await createLocalTransaction(deps, fields({ amount: 100 + i }));
    const res = await engine.sync();
    expect(res.applied).toBe(250);
    expect(server.pushCalls.map((c) => c.operations.length)).toEqual([200, 50]);
  });

  it('sequential edits to one row are rebased onto our own applied op (no false conflict)', async () => {
    const tx = await createLocalTransaction(deps, fields());
    await engine.sync();
    await updateLocalTransaction(deps, tx.id, { amount: 1_000 });
    // Simulate the first update being on the wire, then another edit arriving.
    server.failNextPush.push(new HttpError(0, 'offline'));
    await engine.sync();
    await updateLocalTransaction(deps, tx.id, { amount: 2_000 });
    expect(await storage.listOutbox()).toHaveLength(2);
    now += 60_000;
    const res = await engine.sync();
    expect(res.conflicts).toBe(0);
    expect(res.applied).toBe(2);
    expect(server.txs.get(tx.id)!.amount).toBe(2_000);
    expect((await storage.getTransaction(tx.id))!.amount).toBe(2_000);
  });
});

describe('conflicts', () => {
  it('server wins on a stale update; queued ops for that row are dropped; a notice is raised', async () => {
    const tx = await createLocalTransaction(deps, fields());
    await engine.sync();
    server.editElsewhere(tx.id, { description: 'Edited on web', amount: 77_700 });
    await updateLocalTransaction(deps, tx.id, { description: 'Edited on phone' });
    const res = await engine.sync({ pushOnly: true });
    expect(res.conflicts).toBe(1);
    const row = (await storage.getTransaction(tx.id))!;
    expect(row.description).toBe('Edited on web');
    expect(row.amount).toBe(77_700);
    expect(row.syncState).toBe('synced');
    expect(await storage.listOutbox()).toHaveLength(0);
    const notices = await storage.listNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.kind).toBe('conflict');
  });

  it('editing a row deleted elsewhere resolves to the deletion', async () => {
    const tx = await createLocalTransaction(deps, fields());
    await engine.sync();
    server.deleteElsewhere(tx.id);
    await updateLocalTransaction(deps, tx.id, { amount: 1 });
    const res = await engine.sync();
    expect(res.conflicts).toBe(1);
    expect(await storage.getTransaction(tx.id)).toBeNull();
  });
});

describe('pull', () => {
  it('upserts server changes and advances lastPulledAt', async () => {
    const remote = server.createElsewhere({ description: 'From web' });
    await engine.sync();
    expect((await storage.getTransaction(remote.id))!.description).toBe('From web');
    expect(await storage.getMeta('lastPulledAt')).toBeTruthy();
    expect(server.pullCalls[0]).toBeUndefined();

    const firstPulledAt = await storage.getMeta('lastPulledAt');
    server.editElsewhere(remote.id, { description: 'Renamed' });
    await engine.sync();
    expect(server.pullCalls[1]).toBe(firstPulledAt);
    expect((await storage.getTransaction(remote.id))!.description).toBe('Renamed');
  });

  it('never clobbers a row that still has pending local ops', async () => {
    const tx = await createLocalTransaction(deps, fields());
    await engine.sync();
    await updateLocalTransaction(deps, tx.id, { description: 'Local edit' });
    server.editElsewhere(tx.id, { description: 'Server edit' });
    // Pull only (push is blocked by backoff after a failure).
    server.failNextPush.push(new HttpError(503, 'down'));
    await engine.sync();
    const row = (await storage.getTransaction(tx.id))!;
    expect(row.description).toBe('Local edit');
    expect(row.syncState).toBe('pending');
    expect(row.serverCopy?.description).toBe('Server edit');
  });

  it('applies tombstones (deletedAt) by removing synced rows', async () => {
    const remote = server.createElsewhere();
    await engine.sync();
    expect(await storage.getTransaction(remote.id)).not.toBeNull();
    server.deleteElsewhere(remote.id);
    await engine.sync();
    expect(await storage.getTransaction(remote.id)).toBeNull();
  });

  it('a tombstone does not remove a row with pending local changes', async () => {
    const remote = server.createElsewhere();
    await engine.sync();
    await updateLocalTransaction(deps, remote.id, { amount: 5 });
    server.deleteElsewhere(remote.id);
    server.failNextPush.push(new HttpError(500, 'boom'));
    await engine.sync();
    expect((await storage.getTransaction(remote.id))!.syncState).toBe('pending');
    // Next push resolves it: the update conflicts with the deletion → row removed.
    now += 60_000;
    await engine.sync();
    expect(await storage.getTransaction(remote.id)).toBeNull();
  });

  it('local delete is pending until acknowledged, then removed', async () => {
    const tx = await createLocalTransaction(deps, fields());
    await engine.sync();
    expect(await deleteLocalTransaction(deps, tx.id)).toBe(false);
    const row = (await storage.getTransaction(tx.id))!;
    expect(row.deletedAt).not.toBeNull();
    expect(row.syncState).toBe('pending');
    await engine.sync();
    expect(await storage.getTransaction(tx.id)).toBeNull();
    expect(server.txs.get(tx.id)!.deletedAt).not.toBeNull();
  });
});

describe('single flight', () => {
  it('concurrent sync() calls share one run', async () => {
    await createLocalTransaction(deps, fields());
    const [a, b] = await Promise.all([engine.sync(), engine.sync()]);
    expect(a).toBe(b);
    expect(server.pushCalls).toHaveLength(1);
  });

  it('an edit made while an op is in flight gets its own op (never folded into the sent one)', async () => {
    const tx = await createLocalTransaction(deps, fields());
    const originalPush = server.push.bind(server);
    let first = true;
    server.push = async (body) => {
      if (first) {
        first = false;
        // The user edits while the create is on the wire.
        await updateLocalTransaction(deps, tx.id, { amount: 99_900 });
        expect((await storage.listOutbox()).map((o) => o.op)).toEqual(['create', 'update']);
        const sent = body.operations[0]!;
        expect(sent.op === 'create' && sent.data.amount).toBe(25_000);
      }
      return originalPush(body);
    };
    const res = await engine.sync({ pushOnly: true });
    expect(res.applied).toBe(2);
    expect(server.pushCalls).toHaveLength(2);
    expect(server.txs.get(tx.id)!.amount).toBe(99_900);
    const row = (await storage.getTransaction(tx.id))!;
    expect(row.amount).toBe(99_900);
    expect(row.syncState).toBe('synced');
  });
});

describe('offline balances', () => {
  it('server balance + unsynced local deltas, including transfers and deletes', async () => {
    await engine.sync(); // pull accounts
    const synced = await createLocalTransaction(deps, fields({ amount: 10_000 }));
    await engine.sync();

    // Offline from here.
    await createLocalTransaction(deps, fields({ amount: 2_500 }));
    await createLocalTransaction(
      deps,
      fields({ type: 'transfer', amount: 5_000, counterAccountId: SAVINGS_ID }),
    );
    await deleteLocalTransaction(deps, synced.id);

    const rows = await storage.listTransactions();
    const { byAccount, count } = unsyncedDeltas(rows);
    expect(count).toBe(3);
    // −2,500 − 5,000 + 10,000 (deleted expense restored)
    expect(byAccount.get(ACCOUNT_ID)).toBe(2_500);
    expect(byAccount.get(SAVINGS_ID)).toBe(5_000);

    const local = withLocalBalances(await storage.listAccounts(), rows);
    const wallet = local.accounts.find((a) => a.id === ACCOUNT_ID)!;
    expect(wallet.serverBalance).toBe(100_000 - 10_000);
    expect(wallet.balance).toBe(100_000 - 2_500 - 5_000);

    // After syncing, the pulled balances already include everything: no delta remains.
    await engine.sync();
    const after = unsyncedDeltas(await storage.listTransactions());
    expect(after.count).toBe(0);
    const accounts = withLocalBalances(
      await storage.listAccounts(),
      await storage.listTransactions(),
    );
    expect(accounts.accounts.find((a) => a.id === ACCOUNT_ID)!.balance).toBe(92_500);
  });

  it('failed (rejected) rows do not count toward balances', async () => {
    await engine.sync();
    await createLocalTransaction(deps, fields({ amount: -10 }));
    await engine.sync();
    expect(unsyncedDeltas(await storage.listTransactions()).count).toBe(0);
  });
});
