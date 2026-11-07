import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const backupStatus = z.object({
  configured: z.boolean(),
  lastBackupAt: z.string().nullable(),
  lastRestoreVerifiedAt: z.string().nullable(),
  latest: z.object({ file: z.string(), sizeBytes: z.number().int() }).nullable(),
  count: z.number().int(),
  /** True when the last successful backup is younger than 26 hours. */
  healthy: z.boolean(),
});

async function readMarker(dir: string, name: string): Promise<string | null> {
  try {
    return (await readFile(join(dir, name), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Read-only view of the backup sidecar's results (the backups volume is mounted read-only into
 * the API at BACKUP_STATUS_DIR). Never exposes file contents.
 */
export const systemRoutes: FastifyPluginAsyncZod = async (app) => {
  const dir = process.env.BACKUP_STATUS_DIR;

  app.get(
    '/system/backup-status',
    {
      schema: {
        tags: ['system'],
        summary: 'Latest database backup and restore-verification timestamps',
        response: { 200: backupStatus },
      },
    },
    async () => {
      if (!dir) {
        return {
          configured: false,
          lastBackupAt: null,
          lastRestoreVerifiedAt: null,
          latest: null,
          count: 0,
          healthy: false,
        };
      }
      const [lastBackupAt, lastRestoreVerifiedAt] = await Promise.all([
        readMarker(dir, '.last_success'),
        readMarker(dir, '.last_restore_verified'),
      ]);
      const files = (await readdir(dir).catch(() => [] as string[]))
        .filter((f) => /^moneymoney-\d{8}-\d{6}\.dump$/.test(f))
        .sort();
      const newest = files.at(-1);
      const latest = newest
        ? { file: newest, sizeBytes: (await stat(join(dir, newest))).size }
        : null;
      const healthy =
        lastBackupAt !== null && Date.now() - new Date(lastBackupAt).getTime() < 26 * 3600_000;
      return {
        configured: true,
        lastBackupAt,
        lastRestoreVerifiedAt,
        latest,
        count: files.length,
        healthy,
      };
    },
  );
};
