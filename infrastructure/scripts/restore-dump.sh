#!/usr/bin/env bash
# One-time: restore a local pg_dump into the running prod Postgres container.
#
# On your PC first (dumps the local dev DB):
#   docker exec chefer-postgres pg_dump -U postgres -d chefer_dev --no-owner --no-acl -Fc > chefer.dump
#   scp -i <key> chefer.dump ubuntu@<VM_IP>:~/chefer.dump
# Then on the VM:
#   ./infrastructure/scripts/restore-dump.sh ~/chefer.dump
set -euo pipefail

DUMP="${1:?Usage: restore-dump.sh <dumpfile.dump>}"
cd "$(dirname "$0")/../.."

set -a; source .env.production; set +a

echo "==> Restoring $DUMP into database '$POSTGRES_DB'"
docker exec -i chefer-postgres pg_restore \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists < "$DUMP"

echo "==> Done. Row counts:"
docker exec chefer-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'recipes', count(*) FROM recipes;"
