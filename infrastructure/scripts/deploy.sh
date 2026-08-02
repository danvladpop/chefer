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

# Build one image at a time. Compose builds in parallel by default, which
# exhausts RAM on small (1 GB) VMs — sequential builds keep peak memory low.
echo "==> Building api image"
$COMPOSE build api

echo "==> Building web image (slow on small VMs)"
$COMPOSE build web

echo "==> Starting containers"
$COMPOSE up -d

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Status"
$COMPOSE ps
echo "Done → https://$(grep -E '^PUBLIC_DOMAIN=' .env.production | cut -d= -f2)"

# Schema changes are applied automatically: the one-shot `migrate` service runs
# `prisma db push` after postgres is healthy and before the api starts.
