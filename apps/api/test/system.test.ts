import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
const dir = mkdtempSync(join(tmpdir(), 'mm-backups-'));

beforeAll(async () => {
  writeFileSync(join(dir, 'moneymoney-20261106-020000.dump'), 'x'.repeat(10));
  writeFileSync(join(dir, 'moneymoney-20261107-020000.dump'), 'x'.repeat(42));
  writeFileSync(join(dir, '.last_success'), new Date().toISOString());
  writeFileSync(join(dir, '.last_restore_verified'), '2026-11-07T02:05:00+08:00');
  process.env.BACKUP_STATUS_DIR = dir;
  t = await createTestApp();
});
afterAll(async () => {
  delete process.env.BACKUP_STATUS_DIR;
  await t.close();
});

describe('backup status', () => {
  it('requires authentication', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/system/backup-status' });
    expect(res.statusCode).toBe(401);
  });

  it('reports the latest backup and restore verification without exposing contents', async () => {
    const res = await t.owner.get('/system/backup-status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: true,
      count: 2,
      healthy: true,
      latest: { file: 'moneymoney-20261107-020000.dump', sizeBytes: 42 },
      lastRestoreVerifiedAt: '2026-11-07T02:05:00+08:00',
    });
  });
});
