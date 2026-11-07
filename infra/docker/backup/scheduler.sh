#!/usr/bin/env bash
# Long-running scheduler: daily backup at BACKUP_HOUR (Asia/Manila), weekly restore verification.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_HOUR="${BACKUP_HOUR:-02}"
VERIFY_WEEKDAY="${VERIFY_WEEKDAY:-7}"   # 1=Mon … 7=Sun

if [[ -n "${RCLONE_CONFIG_B64:-}" ]]; then
  mkdir -p /root/.config/rclone
  echo "$RCLONE_CONFIG_B64" | base64 -d > /root/.config/rclone/rclone.conf
  chmod 600 /root/.config/rclone/rclone.conf
fi

echo "[scheduler] waiting for database"
until pg_isready -q; do sleep 5; done

# One backup + verification at start-up proves the pipeline works on every deploy.
"$DIR/backup.sh" && "$DIR/verify-restore.sh" || echo "[scheduler] start-up backup/verify FAILED"

last_run_day=""
while true; do
  today="$(date +%F)"
  if [[ "$(date +%H)" == "$BACKUP_HOUR" && "$last_run_day" != "$today" ]]; then
    last_run_day="$today"
    if "$DIR/backup.sh"; then
      [[ "$(date +%u)" == "$VERIFY_WEEKDAY" ]] && { "$DIR/verify-restore.sh" || echo "[scheduler] verification FAILED"; }
    else
      echo "[scheduler] backup FAILED"
    fi
  fi
  sleep 300
done
