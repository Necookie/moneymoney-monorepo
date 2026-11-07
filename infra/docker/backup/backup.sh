#!/usr/bin/env bash
# Create one verified backup of the Money Money database.
#  1. pg_dump (custom format, compressed) to a temp file
#  2. integrity check: pg_restore --list must succeed
#  3. atomically move into BACKUP_DIR, write a sha256 checksum
#  4. prune local copies older than BACKUP_RETENTION_DAYS
#  5. optional off-server copy (rclone) when RCLONE_REMOTE is configured
set -euo pipefail

: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="moneymoney-${STAMP}.dump"
TMP="${BACKUP_DIR}/.${NAME}.partial"

mkdir -p "$BACKUP_DIR"
log() { echo "[backup] $(date -Iseconds) $*"; }

log "dumping ${PGDATABASE}@${PGHOST}"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$TMP"
pg_restore --list "$TMP" > /dev/null   # fails on a corrupt/truncated archive
mv "$TMP" "${BACKUP_DIR}/${NAME}"
( cd "$BACKUP_DIR" && sha256sum "$NAME" > "${NAME}.sha256" )
log "wrote ${NAME} ($(du -h "${BACKUP_DIR}/${NAME}" | cut -f1))"

find "$BACKUP_DIR" -maxdepth 1 -name 'moneymoney-*.dump*' -mtime "+${RETENTION_DAYS}" -print -delete | sed 's/^/[backup] pruned /'

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  log "copying to off-server remote ${RCLONE_REMOTE}"
  rclone copy "${BACKUP_DIR}/${NAME}" "${RCLONE_REMOTE}" --s3-no-check-bucket
  rclone copy "${BACKUP_DIR}/${NAME}.sha256" "${RCLONE_REMOTE}" --s3-no-check-bucket
  # Remote retention mirrors local retention.
  rclone delete "${RCLONE_REMOTE}" --min-age "${RETENTION_DAYS}d" --include 'moneymoney-*' || true
  log "off-server copy complete"
else
  log "RCLONE_REMOTE not set — backup is on-server only (see docs/deployment/backup-restore.md)"
fi

date -Iseconds > "${BACKUP_DIR}/.last_success"
