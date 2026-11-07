import type { Account, Category, OccurrenceDto, Transaction } from '@mm/api-client';
import type { TransactionType } from '@mm/types';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMutex } from '../sync/mutex';
import type {
  LocalTransaction,
  OutboxEntry,
  SyncNotice,
  SyncState,
  SyncStorage,
} from '../sync/types';

interface TxRow {
  id: string;
  type: string;
  amount: number;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  occurred_on: string;
  description: string;
  notes: string | null;
  tags: string;
  scheduled_event_id: string | null;
  occurrence_date: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_state: string;
  sync_error: string | null;
  server_json: string | null;
  pulled_json: string | null;
}

interface OutboxRow {
  seq: number;
  op_id: string;
  entity_id: string;
  op: string;
  payload: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: string;
}

const parse = <T>(json: string | null): T | null => (json ? (JSON.parse(json) as T) : null);

export function rowToTransaction(r: TxRow): LocalTransaction {
  return {
    id: r.id,
    type: r.type as TransactionType,
    amount: r.amount,
    accountId: r.account_id,
    counterAccountId: r.counter_account_id,
    categoryId: r.category_id,
    occurredOn: r.occurred_on,
    description: r.description,
    notes: r.notes,
    tags: parse<string[]>(r.tags) ?? [],
    scheduledEventId: r.scheduled_event_id,
    occurrenceDate: r.occurrence_date,
    isDemo: r.is_demo === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    syncState: r.sync_state as SyncState,
    syncError: r.sync_error,
    serverCopy: parse<Transaction>(r.server_json),
    pulledCopy: parse<Transaction>(r.pulled_json),
  };
}

function rowToOutbox(r: OutboxRow): OutboxEntry {
  return {
    seq: r.seq,
    opId: r.op_id,
    entityId: r.entity_id,
    op: r.op as OutboxEntry['op'],
    payload: JSON.parse(r.payload) as OutboxEntry['payload'],
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

/** expo-sqlite implementation of the sync engine's storage. */
export class SqliteStorage implements SyncStorage {
  private readonly lock = createMutex();

  constructor(readonly db: SQLiteDatabase) {}

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock(async () => {
      let out: T | undefined;
      await this.db.withTransactionAsync(async () => {
        out = await fn();
      });
      return out as T;
    });
  }

  async getTransaction(id: string) {
    const r = await this.db.getFirstAsync<TxRow>('SELECT * FROM transactions WHERE id = ?', id);
    return r ? rowToTransaction(r) : null;
  }

  async putTransaction(tx: LocalTransaction) {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO transactions (id, type, amount, account_id, counter_account_id,
        category_id, occurred_on, description, notes, tags, scheduled_event_id, occurrence_date,
        is_demo, created_at, updated_at, deleted_at, sync_state, sync_error, server_json, pulled_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tx.id,
      tx.type,
      tx.amount,
      tx.accountId,
      tx.counterAccountId,
      tx.categoryId,
      tx.occurredOn,
      tx.description,
      tx.notes,
      JSON.stringify(tx.tags),
      tx.scheduledEventId,
      tx.occurrenceDate,
      tx.isDemo ? 1 : 0,
      tx.createdAt,
      tx.updatedAt,
      tx.deletedAt,
      tx.syncState,
      tx.syncError,
      tx.serverCopy ? JSON.stringify(tx.serverCopy) : null,
      tx.pulledCopy ? JSON.stringify(tx.pulledCopy) : null,
    );
  }

  async removeTransaction(id: string) {
    await this.db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  }

  async listTransactions() {
    const rows = await this.db.getAllAsync<TxRow>('SELECT * FROM transactions');
    return rows.map(rowToTransaction);
  }

  async listOutbox() {
    const rows = await this.db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY seq ASC');
    return rows.map(rowToOutbox);
  }

  async addOutbox(entry: Omit<OutboxEntry, 'seq'>) {
    const res = await this.db.runAsync(
      `INSERT INTO outbox (op_id, entity_id, op, payload, attempts, next_attempt_at, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.opId,
      entry.entityId,
      entry.op,
      JSON.stringify(entry.payload),
      entry.attempts,
      entry.nextAttemptAt,
      entry.lastError,
      entry.createdAt,
    );
    return { ...entry, seq: res.lastInsertRowId };
  }

  async updateOutbox(opId: string, patch: Partial<Omit<OutboxEntry, 'opId' | 'seq'>>) {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.payload !== undefined) {
      sets.push('payload = ?');
      values.push(JSON.stringify(patch.payload));
    }
    if (patch.attempts !== undefined) {
      sets.push('attempts = ?');
      values.push(patch.attempts);
    }
    if (patch.nextAttemptAt !== undefined) {
      sets.push('next_attempt_at = ?');
      values.push(patch.nextAttemptAt);
    }
    if (patch.lastError !== undefined) {
      sets.push('last_error = ?');
      values.push(patch.lastError);
    }
    if (patch.entityId !== undefined) {
      sets.push('entity_id = ?');
      values.push(patch.entityId);
    }
    if (patch.op !== undefined) {
      sets.push('op = ?');
      values.push(patch.op);
    }
    if (!sets.length) return;
    await this.db.runAsync(`UPDATE outbox SET ${sets.join(', ')} WHERE op_id = ?`, ...values, opId);
  }

  async removeOutbox(opIds: readonly string[]) {
    if (!opIds.length) return;
    await this.db.runAsync(
      `DELETE FROM outbox WHERE op_id IN (${opIds.map(() => '?').join(', ')})`,
      ...opIds,
    );
  }

  async replaceAccounts(accounts: Account[]) {
    await this.db.runAsync('DELETE FROM accounts');
    for (const a of accounts) {
      await this.db.runAsync(
        'INSERT INTO accounts (id, name, archived, json) VALUES (?, ?, ?, ?)',
        a.id,
        a.name,
        a.archived ? 1 : 0,
        JSON.stringify(a),
      );
    }
  }

  async listAccounts() {
    const rows = await this.db.getAllAsync<{ json: string }>(
      'SELECT json FROM accounts ORDER BY archived ASC, name COLLATE NOCASE ASC',
    );
    return rows.map((r) => JSON.parse(r.json) as Account);
  }

  async replaceCategories(categories: Category[]) {
    await this.db.runAsync('DELETE FROM categories');
    for (const c of categories) {
      await this.db.runAsync(
        'INSERT INTO categories (id, name, kind, archived, json) VALUES (?, ?, ?, ?, ?)',
        c.id,
        c.name,
        c.kind,
        c.archived ? 1 : 0,
        JSON.stringify(c),
      );
    }
  }

  async listCategories() {
    const rows = await this.db.getAllAsync<{ json: string }>(
      'SELECT json FROM categories ORDER BY name COLLATE NOCASE ASC',
    );
    return rows.map((r) => JSON.parse(r.json) as Category);
  }

  async replaceUpcoming(occurrences: OccurrenceDto[]) {
    await this.db.runAsync('DELETE FROM upcoming');
    for (const o of occurrences) {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO upcoming (key, date, json) VALUES (?, ?, ?)',
        `${o.eventId}:${o.originalDate}`,
        o.date,
        JSON.stringify(o),
      );
    }
  }

  async listUpcoming() {
    const rows = await this.db.getAllAsync<{ json: string }>(
      'SELECT json FROM upcoming ORDER BY date ASC',
    );
    return rows.map((r) => JSON.parse(r.json) as OccurrenceDto);
  }

  async getMeta(key: string) {
    const r = await this.db.getFirstAsync<{ value: string | null }>(
      'SELECT value FROM meta WHERE key = ?',
      key,
    );
    return r?.value ?? null;
  }

  async setMeta(key: string, value: string | null) {
    if (value === null) await this.db.runAsync('DELETE FROM meta WHERE key = ?', key);
    else
      await this.db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  async addNotice(n: SyncNotice) {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO notices (id, kind, entity_id, message, created_at) VALUES (?, ?, ?, ?, ?)',
      n.id,
      n.kind,
      n.entityId,
      n.message,
      n.createdAt,
    );
  }

  async listNotices() {
    const rows = await this.db.getAllAsync<{
      id: string;
      kind: string;
      entity_id: string;
      message: string;
      created_at: string;
    }>('SELECT * FROM notices ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as SyncNotice['kind'],
      entityId: r.entity_id,
      message: r.message,
      createdAt: r.created_at,
    }));
  }

  async clearNotices(ids?: readonly string[]) {
    if (!ids) await this.db.runAsync('DELETE FROM notices');
    else if (ids.length) {
      await this.db.runAsync(
        `DELETE FROM notices WHERE id IN (${ids.map(() => '?').join(', ')})`,
        ...ids,
      );
    }
  }

  // ── App-only helpers (not part of SyncStorage) ─────────────────────────

  async getCache<T>(key: string): Promise<{ data: T; fetchedAt: number } | null> {
    const r = await this.db.getFirstAsync<{ json: string; fetched_at: number }>(
      'SELECT json, fetched_at FROM cache WHERE key = ?',
      key,
    );
    return r ? { data: JSON.parse(r.json) as T, fetchedAt: r.fetched_at } : null;
  }

  async setCache(key: string, data: unknown, fetchedAt: number) {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO cache (key, json, fetched_at) VALUES (?, ?, ?)',
      key,
      JSON.stringify(data),
      fetchedAt,
    );
  }

  /** Wipe all local data (sign-out). Keeps the schema. */
  async clearAll() {
    await this.transaction(async () => {
      for (const table of [
        'accounts',
        'categories',
        'transactions',
        'outbox',
        'upcoming',
        'meta',
        'notices',
        'cache',
        'scheduled_notifications',
      ]) {
        await this.db.runAsync(`DELETE FROM ${table}`);
      }
    });
  }
}
