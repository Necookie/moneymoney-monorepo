import { PGlite } from '@electric-sql/pglite';
import { type Database, migrationsFolder, schema } from '@mm/database';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';

/** Fake Clerk: maps opaque test tokens to Clerk subjects. */
const TOKENS: Record<string, string> = {
  'token-owner': 'user_owner',
  'token-partner': 'user_partner',
  'token-stranger': 'user_stranger',
};

export async function createTestApp(options: { owners?: string[] } = {}) {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  const app = await buildApp({
    db: db as unknown as Database,
    verifyToken: async (token) => {
      const sub = TOKENS[token];
      if (!sub) throw new Error('invalid token');
      return { sub };
    },
    ownerClerkUserIds: options.owners ?? ['user_owner', 'user_partner'],
    corsOrigins: ['https://moneymoney.necookie.dev'],
    rateLimitPerMinute: 10_000,
    enableDocs: true,
  });
  await app.ready();

  const as = (token: string) => {
    const call = async (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      body?: unknown,
    ) => {
      const res = await app.inject({
        method,
        url: `/api/v1${url}`,
        headers: { authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { payload: body as object }),
      });
      return {
        status: res.statusCode,
        body: res.body ? safeJson(res.body) : null,
        raw: res.body,
        headers: res.headers,
      };
    };
    return {
      get: (url: string) => call('GET', url),
      post: (url: string, body?: unknown) => call('POST', url, body ?? {}),
      patch: (url: string, body: unknown) => call('PATCH', url, body),
      del: (url: string) => call('DELETE', url),
    };
  };

  return {
    app,
    db,
    owner: as('token-owner'),
    partner: as('token-partner'),
    stranger: as('token-stranger'),
    async close() {
      await app.close();
      await client.close();
    },
  };
}

// Test bodies are asserted structurally; `any` keeps assertions terse.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const id = () => randomUUID();
export const peso = (n: number) => Math.round(n * 100);
