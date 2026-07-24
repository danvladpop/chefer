#!/usr/bin/env bash
# One-command (re)deploy — run on the VM after the one-time Phase 0 setup.
#   ./infrastructure/scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Copy .env.production.example and fill it in." >&2
  exit 1
fi

COMPOSE="docker compose --env-file .env.production -f docker-compose.deploy.yml"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building & starting containers"
$COMPOSE up -d --build

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Status"
$COMPOSE ps
echo "Done → https://$(grep -E '^PUBLIC_DOMAIN=' .env.production | cut -d= -f2)"

# NOTE: if you changed the Prisma schema, sync the prod DB once after deploy:
#   docker run --rm --network chefer -e DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.production | cut -d= -f2-)" \
#     -v "$PWD/packages/database:/db" -w /db node:20-alpine \
#     sh -c 'corepack enable && npx prisma db push --skip-generate'
