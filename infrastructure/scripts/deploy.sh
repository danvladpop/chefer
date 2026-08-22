#!/usr/bin/env bash
# Pull-based deploy — images are built in GitHub Actions and pulled from GHCR.
# This is what CI runs over SSH, and what you can run by hand on the VM:
#   ./infrastructure/scripts/deploy.sh            # deploy :latest
#   TAG=sha-abc1234 ./infrastructure/scripts/deploy.sh   # roll back to a build
#
# Building on this VM is slow (1 GB RAM). If you ever need it (e.g. GitHub is
# down), use ./infrastructure/scripts/deploy-local-build.sh instead.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Copy .env.production.example and fill it in." >&2
  exit 1
fi

export TAG="${TAG:-latest}"
COMPOSE="docker compose --env-file .env.production -f docker-compose.deploy.yml"

echo "==> Updating repo (compose file, Caddyfile, scripts)"
git pull --ff-only

echo "==> Pulling images (TAG=$TAG)"
$COMPOSE pull

echo "==> Starting containers"
# --no-build: never build on this box; the migrate service applies the schema
# before api starts.
$COMPOSE up -d --no-build

echo "==> Reloading Caddy config"
# The Caddyfile is a bind mount — `up -d` won't recreate the caddy container
# when only the mounted file changed, so route changes (e.g. /api/chat → api)
# would silently never apply without an explicit reload.
docker exec chefer-caddy caddy reload --config /etc/caddy/Caddyfile || true

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Status"
$COMPOSE ps
echo "Done → https://$(grep -E '^PUBLIC_DOMAIN=' .env.production | cut -d= -f2)"
