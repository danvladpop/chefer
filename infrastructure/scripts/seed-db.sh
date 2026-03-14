#!/usr/bin/env bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}ℹ  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠  $*${NC}"; }
log_error()   { echo -e "${RED}❌ $*${NC}"; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "🌱 Seeding Chefer database..."
echo ""

# Load environment
if [ -f "apps/api/.env" ]; then
  log_info "Loading environment from apps/api/.env"
  set -a
  source apps/api/.env
  set +a
elif [ -f "packages/database/.env" ]; then
  log_info "Loading environment from packages/database/.env"
  set -a
  source packages/database/.env
  set +a
else
  log_warning "No .env file found. Using DATABASE_URL from environment."
fi

if [ -z "${DATABASE_URL:-}" ]; then
  log_error "DATABASE_URL is not set. Please configure it in apps/api/.env"
fi

log_info "Database: ${DATABASE_URL%%@*}@***"

# Confirm if in production
if [ "${NODE_ENV:-development}" = "production" ]; then
  echo ""
  log_warning "You are about to seed a PRODUCTION database!"
  read -p "Are you sure? Type 'yes' to continue: " confirmation
  if [ "$confirmation" != "yes" ]; then
    log_info "Seed cancelled."
    exit 0
  fi
fi

# Run the seed script
log_info "Running seed script..."
pnpm db:seed

log_success "Database seeded successfully!"
echo ""
echo "  Default users:"
echo "    Admin:     admin@chefer.dev  / Admin@123!"
echo "    User:      alice@chefer.dev  / User@123!"
echo "    Moderator: bob@chefer.dev    / User@123!"
echo ""
