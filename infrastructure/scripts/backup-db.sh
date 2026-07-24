#!/usr/bin/env bash
# Nightly Postgres backup (keeps the last 14). Add to cron on the VM:
#   crontab -e
#   0 3 * * * /home/ubuntu/chefer/infrastructure/scripts/backup-db.sh >> /home/ubuntu/chefer-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/../.."
set -a; source .env.production; set +a

BACKUP_DIR="${BACKUP_DIR:-$HOME/chefer-backups}"
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/chefer-$TS.dump"

docker exec chefer-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT"
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Retain the 14 most recent
ls -1t "$BACKUP_DIR"/chefer-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
