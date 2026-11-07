import type { Account, Category, OccurrenceDto } from '@mm/api-client';
import { createMutex } from './mutex';
import type { LocalTransaction, OutboxEntry, SyncNotice, SyncStorage } from './types';

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** In-memory SyncStorage (unit tests; also a reference for the SQLite implementation). */
export class MemoryStorage implements SyncStorage {
  transactions = new Map<string, LocalTransaction>();
  outbox: OutboxEntry[] = [];
  accounts: Account[] = [];
  categories: Category[] = [];
  upcoming: OccurrenceDto[] = [];
  meta = new Map<string, string>();
  notices: SyncNotice[] = [];
  private seq = 0;
  private readonly lock = createMutex();

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock(fn);
  }

  async getTransaction(id: string) {
    return clone(this.transactions.get(id) ?? null);
  }
  async putTransaction(tx: LocalTransaction) {
    this.transactions.set(tx.id, clone(tx));
  }
  async removeTransaction(id: string) {
    this.transactions.delete(id);
  }
  async listTransactions() {
    return [...this.transactions.values()].map(clone);
  }

  async listOutbox() {
    return clone([...this.outbox].sort((a, b) => a.seq - b.seq));
  }
  async addOutbox(entry: Omit<OutboxEntry, 'seq'>) {
    const full = { ...clone(entry), seq: ++this.seq };
    this.outbox.push(full);
    return clone(full);
  }
  async updateOutbox(opId: string, patch: Partial<Omit<OutboxEntry, 'opId' | 'seq'>>) {
    this.outbox = this.outbox.map((e) => (e.opId === opId ? { ...e, ...clone(patch) } : e));
  }
  async removeOutbox(opIds: readonly string[]) {
    const drop = new Set(opIds);
    this.outbox = this.outbox.filter((e) => !drop.has(e.opId));
  }

  async replaceAccounts(accounts: Account[]) {
    this.accounts = clone(accounts);
  }
  async listAccounts() {
    return clone(this.accounts);
  }
  async replaceCategories(categories: Category[]) {
    this.categories = clone(categories);
  }
  async listCategories() {
    return clone(this.categories);
  }
  async replaceUpcoming(occurrences: OccurrenceDto[]) {
    this.upcoming = clone(occurrences);
  }
  async listUpcoming() {
    return clone(this.upcoming);
  }

  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: string, value: string | null) {
    if (value === null) this.meta.delete(key);
    else this.meta.set(key, value);
  }

  async addNotice(notice: SyncNotice) {
    this.notices.push(clone(notice));
  }
  async listNotices() {
    return clone(this.notices);
  }
  async clearNotices(ids?: readonly string[]) {
    if (!ids) this.notices = [];
    else this.notices = this.notices.filter((n) => !ids.includes(n.id));
  }
}
