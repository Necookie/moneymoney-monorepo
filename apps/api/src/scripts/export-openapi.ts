/** Writes docs/api/openapi.json from the live route schemas (no database connection needed). */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Database } from '@mm/database';
import { buildApp } from '../app.js';

const app = await buildApp({
  db: {} as Database,
  verifyToken: async () => {
    throw new Error('not used');
  },
  ownerClerkUserIds: [],
  corsOrigins: [],
  version: process.env.APP_VERSION ?? '0.1.0',
});
await app.ready();
const out = fileURLToPath(new URL('../../../../docs/api/openapi.json', import.meta.url));
writeFileSync(out, JSON.stringify(app.swagger(), null, 2) + '\n');
console.warn(`wrote ${out}`);
await app.close();
