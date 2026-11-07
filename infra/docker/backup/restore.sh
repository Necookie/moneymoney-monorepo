#!/usr/bin/env bash
# DESTRUCTIVE: restore a backup over the live Money Money database.
# Usage (inside the moneymoney-backup container):
#   restore.sh /backups/moneymoney-YYYYmmdd-HHMMSS.dump --yes-replace-production
# Stop the API first so nothing writes during the restore. A safety dump of the current state
# is taken before anything is dropped.
set -euo pipefail
FILE="${1:-}"
CONFIRM="${2:-}"
[[ -f "$FILE" ]] || { echo "usage: restore.sh <file.dump> --yes-replace-production"; exit 2; }
[[ "$CONFIRM" == "--yes-replace-production" ]] || { echo "refusing without --yes-replace-production"; exit 2; }

( cd "$(dirname "$FILE")" && [[ ! -f "$(basename "$FILE").sha256" ]] || sha256sum -c "$(basename "$FILE").sha256" )
SAFETY="${BACKUP_DIR:-/backups}/pre-restore-$(date +%Y%m%d-%H%M%S).dump"
echo "[restore] safety dump of current database -> $SAFETY"
pg_dump --format=custom --file="$SAFETY"

echo "[restore] restoring $FILE into ${PGDATABASE}"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction -d "$PGDATABASE" "$FILE"
echo "[restore] done. Start the API again and check /ready."
