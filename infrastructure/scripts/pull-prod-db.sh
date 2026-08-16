#!/usr/bin/env bash
# Copy the PRODUCTION database into your LOCAL dev Postgres.
# Run from your laptop (macOS/Linux/Git Bash), not on the VM:
#
#   ./infrastructure/scripts/pull-prod-db.sh
#
# Overrides via env vars, e.g.:
#   VM_HOST=1.2.3.4 SSH_KEY=~/.ssh/other_key ./infrastructure/scripts/pull-prod-db.sh
#
# This REPLACES the contents of your local dev database. Production is only
# ever read from (pg_dump), never written to.
set -euo pipefail

VM_HOST="${VM_HOST:-129.159.9.54}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/chefer_deploy}"

LOCAL_CONTAINER="${LOCAL_CONTAINER:-chefer-postgres}"
LOCAL_USER="${LOCAL_USER:-postgres}"
LOCAL_DB="${LOCAL_DB:-chefer_dev}"

DUMP="${DUMP:-./chefer-prod.dump}"

if ! docker ps --format '{{.Names}}' | grep -qx "$LOCAL_CONTAINER"; then
  echo "ERROR: local container '$LOCAL_CONTAINER' is not running." >&2
  echo "Start it with: docker compose -f infrastructure/docker/docker-compose.yml up -d postgres" >&2
  exit 1
fi

echo "==> Dumping production database from $VM_USER@$VM_HOST"
# The VM's .env.production holds POSTGRES_USER/POSTGRES_DB, so source it there
# rather than duplicating credentials here. -Fc is a compressed binary dump.
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$VM_USER@$VM_HOST" \
  'cd ~/chefer && set -a && . ./.env.production && set +a && \
   docker exec -i chefer-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -Fc --no-owner --no-acl' > "$DUMP"

echo "==> Wrote $DUMP ($(du -h "$DUMP" | cut -f1))"

read -r -p "Replace local database '$LOCAL_DB' with this dump? [y/N] " reply
case "$reply" in
  [yY]*) ;;
  *) echo "Aborted. The dump is still at $DUMP."; exit 0 ;;
esac

echo "==> Restoring into $LOCAL_DB"
# --clean --if-exists drops existing objects first; pg_restore reports harmless
# "does not exist" notices on a fresh database, hence the || true.
docker exec -i "$LOCAL_CONTAINER" pg_restore \
  -U "$LOCAL_USER" -d "$LOCAL_DB" \
  --no-owner --no-acl --clean --if-exists < "$DUMP" || true

echo "==> Done. Row counts:"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c \
  "SELECT 'users' t, count(*) FROM users
   UNION ALL SELECT 'recipes', count(*) FROM recipes
   UNION ALL SELECT 'meal_plans', count(*) FROM meal_plans;"

echo
echo "Note: uploaded images live on the VM's disk, not in the database, so"
echo "recipes with uploaded photos will show broken images locally."
