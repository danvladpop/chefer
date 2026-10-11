#!/usr/bin/env bash
# Nightly Postgres backup (keeps the last 14) + uploads mirror. Add to cron on the VM:
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

# Uploaded and generated images (the chefer_uploads volume) were not backed up
# (2026-10-11 capacity review). Copy them out of the api container into a plain
# directory that pull-backups.sh mirrors off the VM. Additive: files deleted on
# the VM stay in the copy, so a bad orphan sweep can still be undone.
UPLOADS_DIR="${UPLOADS_BACKUP_DIR:-$HOME/chefer-uploads}"
mkdir -p "$UPLOADS_DIR"
if docker exec chefer-api test -d /app/uploads; then
  docker exec chefer-api tar -C /app/uploads -cf - . | tar -C "$UPLOADS_DIR" -xf -
  echo "Uploads copied: $UPLOADS_DIR ($(du -sh "$UPLOADS_DIR" | cut -f1))"
else
  echo "WARNING: chefer-api has no /app/uploads — uploads not copied" >&2
fi
