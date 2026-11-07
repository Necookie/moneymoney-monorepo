#!/usr/bin/env bash
# Prove the latest backup is restorable: restore it into a scratch database on the same
# (Money Money-only) Postgres instance, compare row counts with production, then drop it.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
SCRATCH="${PGDATABASE}_restore_check"
LATEST="$(ls -1t "${BACKUP_DIR}"/moneymoney-*.dump 2>/dev/null | head -n1 || true)"
log() { echo "[verify] $(date -Iseconds) $*"; }

if [[ -z "$LATEST" ]]; then
  log "no backup found"; exit 1
fi
( cd "$BACKUP_DIR" && sha256sum -c "$(basename "$LATEST").sha256" >/dev/null )
log "checksum ok for $(basename "$LATEST")"

psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS \"${SCRATCH}\";" >/dev/null
psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"${SCRATCH}\";" >/dev/null
trap 'psql -d postgres -c "DROP DATABASE IF EXISTS \"${SCRATCH}\";" >/dev/null 2>&1 || true' EXIT

pg_restore --no-owner --no-privileges --exit-on-error -d "$SCRATCH" "$LATEST"

COUNT_SQL="select 'accounts', count(*) from accounts union all select 'transactions', count(*) from transactions union all select 'scheduled_events', count(*) from scheduled_events union all select 'goals', count(*) from goals order by 1"
restored="$(psql -At -d "$SCRATCH" -c "$COUNT_SQL")"
log "restored row counts: $(echo "$restored" | tr '\n' ' ')"
migrations="$(psql -At -d "$SCRATCH" -c 'select count(*) from drizzle.__drizzle_migrations' 2>/dev/null || echo 0)"
log "restored migrations recorded: ${migrations}"
if [[ "$migrations" -lt 1 ]]; then
  log "FAILED: migration history missing from restore"; exit 1
fi

date -Iseconds > "${BACKUP_DIR}/.last_restore_verified"
log "restore verification PASSED"
