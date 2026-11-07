# Backup & restore

Owned entirely by the Money Money stack (`moneymoney-backup` sidecar, image
`infra/docker/backup.Dockerfile`, scripts in `infra/docker/backup/`).

| Item | Value |
|---|---|
| Schedule | Daily at 02:00 Asia/Manila, plus one backup at every (re)deploy |
| Format | `pg_dump --format=custom --compress=9` → `moneymoney-YYYYmmdd-HHMMSS.dump` + `.sha256` |
| Integrity | `pg_restore --list` must succeed before a file is kept |
| Restore verification | At every deploy and weekly (Sunday): restore the latest dump into a scratch DB `moneymoney_restore_check`, check row counts + migration history, drop it. Success stamps `/backups/.last_restore_verified` |
| On-server location | Volume `moneymoney-backups` (`/backups`) |
| Off-server | Optional: any rclone remote (recommended: a Cloudflare R2 bucket `moneymoney-backups`) via `RCLONE_CONFIG_B64` + `RCLONE_REMOTE` |
| Retention | 14 days locally and remotely (`BACKUP_RETENTION_DAYS`) |
| Health | Container unhealthy if the last successful backup is older than 26 h |

> On-server backups protect against bad migrations and mistakes, **not** against disk or hardware
> loss. Configure the off-server remote before relying on the app for important data.

## Enable off-server copies (Cloudflare R2 example)

1. Create bucket `moneymoney-backups` and an R2 API token scoped to that bucket only.
2. Create an rclone config locally:
   ```ini
   [r2]
   type = s3
   provider = Cloudflare
   access_key_id = <id>
   secret_access_key = <secret>
   endpoint = https://<account_id>.r2.cloudflarestorage.com
   ```
3. Set Coolify env vars on the Money Money app: `RCLONE_CONFIG_B64=<base64 of the file>`,
   `RCLONE_REMOTE=r2:moneymoney-backups` → redeploy. Logs show `off-server copy complete`.

## Check status

Coolify → Money Money → moneymoney-backup logs (`[backup]`, `[verify] restore verification PASSED`).

## Restore (destructive)

1. Stop `moneymoney-api` (Coolify) so nothing writes.
2. In the `moneymoney-backup` container terminal (Coolify → Terminal):
   ```bash
   ls -lt /backups
   /usr/local/bin/mm-backup/restore.sh /backups/moneymoney-<stamp>.dump --yes-replace-production
   ```
   A safety dump of the current state is written first (`pre-restore-*.dump`).
3. Start `moneymoney-api`; check `/ready` and the app.

From off-server: `rclone copy r2:moneymoney-backups/moneymoney-<stamp>.dump /backups/` first.

## Manual on-demand backup / verification

```bash
/usr/local/bin/mm-backup/backup.sh
/usr/local/bin/mm-backup/verify-restore.sh
```
