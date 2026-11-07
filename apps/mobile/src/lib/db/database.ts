import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'moneymoney.db';

/**
 * Ordered migrations. Never edit a shipped migration — append a new one.
 * `PRAGMA user_version` records how many have been applied.
 */
const MIGRATIONS: string[] = [
  // 1 — initial offline schema
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    counter_account_id TEXT,
    category_id TEXT,
    occurred_on TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    notes TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    scheduled_event_id TEXT,
    occurrence_date TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_state TEXT NOT NULL CHECK (sync_state IN ('synced', 'pending', 'failed')),
    sync_error TEXT,
    server_json TEXT,
    pulled_json TEXT
  );
  CREATE INDEX IF NOT EXISTS transactions_by_date ON transactions (occurred_on DESC, created_at DESC);
  CREATE INDEX IF NOT EXISTS transactions_by_sync ON transactions (sync_state);
  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbox_by_entity ON outbox (entity_id);
  CREATE TABLE IF NOT EXISTS upcoming (
    key TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY NOT NULL,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scheduled_notifications (
    key TEXT PRIMARY KEY NOT NULL,
    notification_id TEXT NOT NULL,
    fire_at INTEGER NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/** The app's single database connection (opened and migrated once). */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      return db;
    })().catch((err: unknown) => {
      opening = null;
      throw err;
    });
  }
  return opening;
}
