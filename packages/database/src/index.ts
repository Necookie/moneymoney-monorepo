import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.js';

export * from './schema.js';

/** Any Drizzle Postgres database bound to the Money Money schema (postgres-js in prod, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Absolute path to the committed SQL migrations folder. */
export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export interface DatabaseOptions {
  url: string;
  maxConnections?: number;
  /** Statement timeout in ms (protects the server from runaway queries). */
  statementTimeoutMs?: number;
}

export function createDatabase(options: DatabaseOptions) {
  const client = postgres(options.url, {
    max: options.maxConnections ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    connection: {
      statement_timeout: options.statementTimeoutMs ?? 15_000,
      application_name: 'moneymoney-api',
    },
  });
  const db = drizzle(client, { schema });
  return {
    db: db as unknown as Database,
    client,
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}

/**
 * Apply pending migrations. Drizzle records applied migrations in `drizzle.__drizzle_migrations`
 * and runs them inside a transaction, so this is safe to call on every deploy.
 */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Serialise concurrent deploys with an advisory lock.
    await client`select pg_advisory_lock(727274)`;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client`select pg_advisory_unlock(727274)`.catch(() => {});
    await client.end({ timeout: 5 });
  }
}
