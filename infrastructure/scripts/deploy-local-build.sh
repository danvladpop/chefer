#!/usr/bin/env bash
# FALLBACK deploy — builds the images on this VM instead of pulling from GHCR.
# Only needed if GitHub Actions / GHCR is unavailable. On the 1 GB VM the web
# build takes 15-40 minutes (swap-heavy); the normal path is deploy.sh.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Copy .env.production.example and fill it in." >&2
  exit 1
fi

COMPOSE="docker compose --env-file .env.production -f docker-compose.deploy.yml"

echo "==> Updating repo"
git pull --ff-only

# Build one image at a time. Compose builds in parallel by default, which
# exhausts RAM on small (1 GB) VMs — sequential builds keep peak memory low.
echo "==> Building api image (slow)"
$COMPOSE build api

echo "==> Building web image (slowest — expect 15-40 min on this VM)"
$COMPOSE build web

echo "==> Starting containers"
$COMPOSE up -d

# Caddyfile is a bind mount — reload so route changes actually apply.
docker exec chefer-caddy caddy reload --config /etc/caddy/Caddyfile || true

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Status"
$COMPOSE ps
echo "Done → https://$(grep -E '^PUBLIC_DOMAIN=' .env.production | cut -d= -f2)"
