import type { SyncOperation, Transaction } from '@mm/api-client';
import type { Clock, LocalTransaction, OutboxEntry, SyncStorage, TransactionFields } from './types';

/**
 * Local-first transaction mutations. Each one writes the local row and enqueues exactly one
 * outbox operation (or coalesces into an operation that has never been sent), then returns
 * immediately — the network is never on the critical path.
 */
export interface MutationDeps {
  storage: SyncStorage;
  uuid: () => string;
  clock: Clock;
}

export interface CreateTransactionInput extends TransactionFields {
  /** Optional caller-supplied client UUID; generated when omitted. */
  id?: string;
}

const iso = (clock: Clock) => new Date(clock.now()).toISOString();

export function pickFields(tx: TransactionFields): TransactionFields {
  return {
    type: tx.type,
    amount: tx.amount,
    accountId: tx.accountId,
    counterAccountId: tx.type === 'transfer' ? tx.counterAccountId : null,
    categoryId: tx.type === 'transfer' ? null : tx.categoryId,
    occurredOn: tx.occurredOn,
    description: tx.description,
    notes: tx.notes,
    tags: [...tx.tags],
  };
}

/** Build a local row from an authoritative server copy. */
export function fromServer(tx: Transaction, pulledCopy: Transaction | null): LocalTransaction {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    accountId: tx.accountId,
    counterAccountId: tx.counterAccountId,
    categoryId: tx.categoryId,
    occurredOn: tx.occurredOn,
    description: tx.description,
    notes: tx.notes,
    tags: tx.tags,
    scheduledEventId: tx.scheduledEventId,
    occurrenceDate: tx.occurrenceDate,
    isDemo: tx.isDemo,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
    deletedAt: tx.deletedAt,
    syncState: 'synced',
    syncError: null,
    serverCopy: tx,
    pulledCopy,
  };
}

function createOp(row: LocalTransaction, opId: string, at: string): SyncOperation {
  return {
    opId,
    entity: 'transaction',
    op: 'create',
    data: { id: row.id, ...pickFields(row) },
    clientUpdatedAt: at,
  };
}

function updateOp(row: LocalTransaction, opId: string, at: string): SyncOperation {
  return {
    opId,
    entity: 'transaction',
    op: 'update',
    id: row.id,
    // Full field set (not a diff): the server copy always converges to what the user sees.
    data: pickFields(row),
    clientUpdatedAt: at,
    baseUpdatedAt: row.serverCopy?.updatedAt ?? null,
  };
}

function deleteOp(id: string, opId: string, at: string): SyncOperation {
  return { opId, entity: 'transaction', op: 'delete', id, clientUpdatedAt: at };
}

async function enqueue(deps: MutationDeps, entityId: string, payload: SyncOperation) {
  await deps.storage.addOutbox({
    opId: payload.opId,
    entityId,
    op: payload.op,
    payload,
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: payload.clientUpdatedAt,
  });
}

async function opsFor(storage: SyncStorage, id: string): Promise<OutboxEntry[]> {
  return (await storage.listOutbox()).filter((e) => e.entityId === id);
}

export async function createLocalTransaction(
  deps: MutationDeps,
  input: CreateTransactionInput,
): Promise<LocalTransaction> {
  const at = iso(deps.clock);
  const row: LocalTransaction = {
    id: input.id ?? deps.uuid(),
    ...pickFields(input),
    scheduledEventId: null,
    occurrenceDate: null,
    isDemo: false,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    syncState: 'pending',
    syncError: null,
    serverCopy: null,
    pulledCopy: null,
  };
  await deps.storage.transaction(async () => {
    const existing = await deps.storage.getTransaction(row.id);
    if (existing) throw new Error('A transaction with this id already exists on this device');
    await deps.storage.putTransaction(row);
    await enqueue(deps, row.id, createOp(row, deps.uuid(), at));
  });
  return row;
}

export async function updateLocalTransaction(
  deps: MutationDeps,
  id: string,
  patch: Partial<TransactionFields>,
): Promise<LocalTransaction> {
  return deps.storage.transaction(async () => {
    const current = await deps.storage.getTransaction(id);
    if (!current || current.deletedAt) throw new Error('Transaction not found on this device');
    const at = iso(deps.clock);
    const next: LocalTransaction = {
      ...current,
      ...pickFields({ ...current, ...patch }),
      updatedAt: at,
      syncState: 'pending',
      syncError: null,
    };
    await deps.storage.putTransaction(next);

    const ops = await opsFor(deps.storage, id);
    const last = ops[ops.length - 1];
    if (last && last.attempts === 0 && last.op !== 'delete') {
      // Never sent: safe to fold the new content into the queued op.
      const payload =
        last.op === 'create'
          ? createOp(next, last.opId, at)
          : { ...updateOp(next, last.opId, at), baseUpdatedAt: basisOf(last.payload) };
      await deps.storage.updateOutbox(last.opId, { payload });
    } else if (!current.serverCopy && !ops.some((o) => o.op === 'create')) {
      // The server has never seen this row (e.g. a rejected create being edited): create it.
      await enqueue(deps, id, createOp(next, deps.uuid(), at));
    } else {
      await enqueue(deps, id, updateOp(next, deps.uuid(), at));
    }
    return next;
  });
}

function basisOf(op: SyncOperation): string | null {
  return op.op === 'update' ? (op.baseUpdatedAt ?? null) : null;
}

/** Returns `true` when the row was removed outright (it never reached the server). */
export async function deleteLocalTransaction(deps: MutationDeps, id: string): Promise<boolean> {
  return deps.storage.transaction(async () => {
    const current = await deps.storage.getTransaction(id);
    if (!current) return true;
    const ops = await opsFor(deps.storage, id);
    const unsentCreate = ops.find((o) => o.op === 'create' && o.attempts === 0);
    if (unsentCreate || (!current.serverCopy && ops.length === 0)) {
      // Never reached the server (or was rejected there): drop everything locally.
      await deps.storage.removeOutbox(ops.map((o) => o.opId));
      await deps.storage.removeTransaction(id);
      return true;
    }
    // Unsent updates are superseded by the delete.
    await deps.storage.removeOutbox(
      ops.filter((o) => o.op === 'update' && o.attempts === 0).map((o) => o.opId),
    );
    const at = iso(deps.clock);
    await deps.storage.putTransaction({
      ...current,
      deletedAt: at,
      updatedAt: at,
      syncState: 'pending',
      syncError: null,
    });
    if (!ops.some((o) => o.op === 'delete')) {
      await enqueue(deps, id, deleteOp(id, deps.uuid(), at));
    }
    return false;
  });
}

/** Re-queue a failed (server-rejected) change after the user fixed or confirmed it. */
export async function retryFailedTransaction(deps: MutationDeps, id: string): Promise<void> {
  await deps.storage.transaction(async () => {
    const row = await deps.storage.getTransaction(id);
    if (!row || row.syncState !== 'failed') return;
    const at = iso(deps.clock);
    const ops = await opsFor(deps.storage, id);
    await deps.storage.removeOutbox(ops.map((o) => o.opId));
    const payload = row.deletedAt
      ? deleteOp(id, deps.uuid(), at)
      : row.serverCopy
        ? updateOp(row, deps.uuid(), at)
        : createOp(row, deps.uuid(), at);
    await deps.storage.putTransaction({ ...row, syncState: 'pending', syncError: null });
    await enqueue(deps, id, payload);
  });
}

/** Drop local changes that failed and fall back to the last server copy (if any). */
export async function discardLocalChanges(deps: MutationDeps, id: string): Promise<void> {
  await deps.storage.transaction(async () => {
    const row = await deps.storage.getTransaction(id);
    if (!row) return;
    const ops = await opsFor(deps.storage, id);
    await deps.storage.removeOutbox(ops.map((o) => o.opId));
    if (row.serverCopy && !row.serverCopy.deletedAt) {
      await deps.storage.putTransaction(fromServer(row.serverCopy, row.pulledCopy));
    } else {
      await deps.storage.removeTransaction(id);
    }
  });
}
