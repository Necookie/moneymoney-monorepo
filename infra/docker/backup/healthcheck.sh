#!/usr/bin/env bash
# Healthy when the last successful backup is younger than 26 hours.
set -euo pipefail
marker="${BACKUP_DIR:-/backups}/.last_success"
[[ -f "$marker" ]] || exit 1
age=$(( $(date +%s) - $(date -d "$(cat "$marker")" +%s) ))
(( age < 26 * 3600 ))
