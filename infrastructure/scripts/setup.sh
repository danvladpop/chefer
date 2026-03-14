#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helpers
log_info()    { echo -e "${BLUE}ℹ  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠  $*${NC}"; }
log_error()   { echo -e "${RED}❌ $*${NC}"; exit 1; }

# Get the repo root (parent of infrastructure/scripts)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║        Chefer — Development Setup       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ─── Prerequisites ────────────────────────────────────────────────────────────

log_info "Checking prerequisites..."

command -v node >/dev/null 2>&1 || log_error "Node.js is not installed. Install it from https://nodejs.org"
command -v pnpm >/dev/null 2>&1 || log_error "pnpm is not installed. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || log_warning "Docker is not installed. You'll need it for the database."

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  log_error "Node.js 20+ is required. You have $(node --version)"
fi

PNPM_VERSION=$(pnpm --version | cut -d. -f1)
if [ "$PNPM_VERSION" -lt 9 ]; then
  log_error "pnpm 9+ is required. You have $(pnpm --version). Upgrade with: npm install -g pnpm@latest"
fi

log_success "Prerequisites OK (Node $(node --version), pnpm $(pnpm --version))"

# ─── Environment Files ───────────────────────────────────────────────────────

log_info "Setting up environment files..."

cd "$REPO_ROOT"

copy_env() {
  local src="$1"
  local dest="$2"
  if [ ! -f "$dest" ]; then
    cp "$src" "$dest"
    log_success "Created $dest"
  else
    log_warning "$dest already exists, skipping"
  fi
}

copy_env "apps/web/.env.example"  "apps/web/.env.local"
copy_env "apps/api/.env.example"  "apps/api/.env"

# ─── Install Dependencies ─────────────────────────────────────────────────────

log_info "Installing dependencies..."
pnpm install
log_success "Dependencies installed"

# ─── Git Hooks ───────────────────────────────────────────────────────────────

log_info "Setting up Git hooks (Husky)..."
pnpm prepare 2>/dev/null || true
log_success "Git hooks configured"

# ─── Start Services ──────────────────────────────────────────────────────────

if command -v docker >/dev/null 2>&1; then
  log_info "Starting Docker services (PostgreSQL + Redis)..."
  cd "$REPO_ROOT/infrastructure/docker"

  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  else
    COMPOSE_CMD="docker-compose"
  fi

  $COMPOSE_CMD up -d postgres redis
  log_success "Docker services started"

  # Wait for PostgreSQL
  log_info "Waiting for PostgreSQL to be ready..."
  max_attempts=30
  attempt=1
  until $COMPOSE_CMD exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      log_error "PostgreSQL did not become ready in time"
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  log_success "PostgreSQL is ready"

  cd "$REPO_ROOT"
else
  log_warning "Docker not available. Make sure PostgreSQL is running manually."
fi

# ─── Database ────────────────────────────────────────────────────────────────

log_info "Running database migrations..."
cd "$REPO_ROOT"

if [ -f "apps/api/.env" ]; then
  export $(grep -v '^#' apps/api/.env | xargs) 2>/dev/null || true
fi

pnpm db:push 2>/dev/null || {
  log_warning "db:push failed (database might not be accessible). Run manually: pnpm db:push"
}

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "╔════════════════════════════════════════╗"
echo "║           Setup Complete! 🎉            ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "  To start development:"
echo "    pnpm dev"
echo ""
echo "  Apps:"
echo "    Web:      http://localhost:3000"
echo "    API:      http://localhost:3001"
echo "    Database: postgresql://postgres:postgres@localhost:5432/chefer_dev"
echo ""
echo "  Other commands:"
echo "    pnpm build      — production build"
echo "    pnpm test       — run tests"
echo "    pnpm lint       — lint all packages"
echo "    pnpm typecheck  — type-check all packages"
echo "    pnpm db:studio  — open Prisma Studio"
echo "    pnpm db:seed    — seed the database"
echo ""
