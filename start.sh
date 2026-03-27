#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Start Docker services
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  else
    COMPOSE_CMD="docker-compose"
  fi

  echo "Starting Docker services..."
  $COMPOSE_CMD -f infrastructure/docker/docker-compose.yml up -d postgres redis

  echo "Waiting for PostgreSQL..."
  until $COMPOSE_CMD -f infrastructure/docker/docker-compose.yml exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
    sleep 1
  done
  echo "PostgreSQL ready."
else
  echo "Warning: Docker not found. Make sure PostgreSQL and Redis are running."
fi

# Start dev servers
pnpm dev
