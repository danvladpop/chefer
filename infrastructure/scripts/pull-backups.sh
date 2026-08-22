#!/usr/bin/env bash
# Off-VM backup mirror (A11 follow-up): pulls the VM's nightly pg_dump files
# to this machine, so a VM disk failure cannot take the database AND every
# backup with it.
#
# Runs on the dev Mac via launchd (see infrastructure.md §12):
#   ~/Library/LaunchAgents/com.chefer.backup-pull.plist
# launchd fires it daily and re-runs a missed schedule on wake, so the mirror
# is as fresh as the last day the machine was on.
#
# Requires the `chefer` SSH host alias (~/.ssh/config → ubuntu@VM with key).
set -euo pipefail

SSH_HOST="${CHEFER_SSH_HOST:-chefer}"
REMOTE_DIR="chefer-backups"
MIRROR_DIR="${CHEFER_BACKUP_MIRROR:-$HOME/chefer-backups-mirror}"
KEEP=30

mkdir -p "$MIRROR_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] pulling $SSH_HOST:$REMOTE_DIR → $MIRROR_DIR"
rsync -az --timeout=60 "$SSH_HOST:$REMOTE_DIR/" "$MIRROR_DIR/"

# Local retention: keep more than the VM's 14 so the mirror also covers
# dumps the VM has already rotated out.
ls -1t "$MIRROR_DIR"/chefer-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

COUNT=$(ls -1 "$MIRROR_DIR"/chefer-*.dump 2>/dev/null | wc -l | tr -d ' ')
NEWEST=$(ls -1t "$MIRROR_DIR"/chefer-*.dump 2>/dev/null | head -1)
echo "mirror holds $COUNT dump(s); newest: ${NEWEST:-none}"

# Staleness alarm: the VM cron writes nightly, so a newest dump older than
# 48h means the VM-side backup is broken — fail loudly so the log shows it.
if [ -n "${NEWEST:-}" ]; then
  NEWEST_EPOCH=$(stat -f %m "$NEWEST" 2>/dev/null || stat -c %Y "$NEWEST")
  AGE_H=$(( ($(date +%s) - NEWEST_EPOCH) / 3600 ))
  if [ "$AGE_H" -gt 48 ]; then
    echo "WARNING: newest dump is ${AGE_H}h old — check the VM's backup cron (crontab -l on the VM)" >&2
    exit 1
  fi
else
  echo "WARNING: mirror is empty — check SSH access and the VM's backup cron" >&2
  exit 1
fi
