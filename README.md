# Chefer — Production-Ready TypeScript Monorepo

A fully-configured, production-grade TypeScript monorepo built with the latest and most robust tools in the ecosystem. Clone it, run the setup script, and ship your product.

[![CI](https://github.com/chefer/chefer/actions/workflows/ci.yml/badge.svg)](https://github.com/chefer/chefer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20, pnpm 9 |
| **Monorepo** | Turborepo 2 |
| **Frontend** | Next.js 15 (App Router), React 19 |
| **Language** | TypeScript 5 (strict) |
| **Styling** | TailwindCSS 3, shadcn/ui primitives |
| **API** | tRPC v11, Express 4 |
| **Database** | Prisma 5, PostgreSQL 16 |
| **Validation** | Zod |
| **Testing** | Vitest, React Testing Library, Playwright |
| **Code Quality** | ESLint 9 flat config, Prettier |
| **Git Hooks** | Husky, lint-staged, commitlint |
| **CI/CD** | GitHub Actions |
| **Infrastructure** | Docker, docker-compose |

---

## Monorepo Structure

```
chefer/
├── apps/
│   ├── web/                  # Next.js 15 frontend
│   └── api/                  # Express + tRPC API server
├── packages/
│   ├── config/
│   │   ├── tsconfig/         # Shared TypeScript configs
│   │   └── eslint/           # Shared ESLint flat configs
│   ├── types/                # Shared TypeScript types
│   ├── utils/                # Shared utility functions
│   ├── database/             # Prisma client + repositories
│   └── ui/                   # Shared React component library
├── infrastructure/
│   ├── docker/               # Dockerfiles + docker-compose
│   └── scripts/              # Dev setup + utility scripts
├── tests/
│   └── e2e/                  # Playwright E2E tests
└── .github/
    └── workflows/            # CI/CD pipelines
```

---

## Getting Started

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org)
- **pnpm 9+** — `npm install -g pnpm`
- **Docker** — [Download](https://www.docker.com) (for PostgreSQL + Redis)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/chefer/chefer.git
cd chefer

# 2. Run the setup script (installs deps, configures env, starts Docker, pushes DB schema)
chmod +x infrastructure/scripts/setup.sh
./infrastructure/scripts/setup.sh

# 3. Start development
pnpm dev
```

The setup script will:
1. Check prerequisites (Node, pnpm, Docker)
2. Copy `.env.example` files to `.env.local` / `.env`
3. Install all dependencies
4. Configure Husky git hooks
5. Start PostgreSQL and Redis via Docker
6. Push the Prisma schema to the database

### Manual Setup

If you prefer to set things up manually:

```bash
# Install dependencies
pnpm install

# Copy environment files
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Start Docker services
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Push database schema
pnpm db:push

# (Optional) Seed the database
pnpm db:seed

# Start development servers
pnpm dev
```

### Development URLs

| Service | URL |
|---|---|
| **Web App** | http://localhost:3000 |
| **API Server** | http://localhost:3001 |
| **tRPC Endpoint** | http://localhost:3001/trpc |
| **Health Check** | http://localhost:3001/health |
| **Prisma Studio** | http://localhost:5555 (via `pnpm db:studio`) |

---

## Environment Variables

### `apps/web/.env.local`

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Chefer
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_TRPC_URL=http://localhost:3001/trpc
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here-min-32-chars
```

### `apps/api/.env`

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chefer_dev
JWT_SECRET=your-jwt-secret-min-32-chars
REFRESH_TOKEN_SECRET=your-refresh-secret-min-32-chars
CORS_ORIGINS=http://localhost:3000
```

---

## Development Commands

```bash
# Development
pnpm dev               # Start all apps in watch mode
pnpm build             # Production build (all packages)
pnpm lint              # Lint all packages
pnpm typecheck         # Type-check all packages
pnpm format            # Format code with Prettier
pnpm format:check      # Check formatting without writing

# Testing
pnpm test              # Run all unit/integration tests
pnpm test:watch        # Watch mode
pnpm test:e2e          # Run Playwright E2E tests (requires build)

# Database
pnpm db:push           # Push Prisma schema to database (dev)
pnpm db:migrate        # Create and apply migration
pnpm db:seed           # Seed the database with sample data
pnpm db:studio         # Open Prisma Studio at localhost:5555

# Infrastructure
docker compose -f infrastructure/docker/docker-compose.yml up -d    # Start services
docker compose -f infrastructure/docker/docker-compose.yml down      # Stop services

# Cleanup
pnpm clean             # Remove all build artifacts and node_modules
```

---

## Packages

### `@chefer/types`

Shared TypeScript types used across the monorepo:
- `User`, `Post`, `UserRole` enum, `PostStatus` enum
- `ApiResponse<T>`, `PaginatedResponse<T>`, `ApiError`
- `AuthSession`, `JwtPayload`, `LoginInput`
- Utility types: `Nullable<T>`, `DeepPartial<T>`, `Maybe<T>`, etc.

### `@chefer/utils`

Pure utility functions:
- `cn()` — Tailwind class merging with clsx + tailwind-merge
- `formatDate()`, `formatRelativeTime()` — date-fns wrappers
- `pick()`, `omit()`, `deepMerge()`, `groupBy()`, `keyBy()` — object utilities
- `invariant()`, `assertDefined()`, `assertNever()` — assertion utilities
- `sleep()`, `retry()` — async utilities
- `slugify()`, `truncate()`, `capitalize()` — string utilities

### `@chefer/database`

Prisma-powered database layer:
- Singleton `PrismaClient` with dev hot-reload support
- `UserRepository` with `findById`, `findByEmail`, `create`, `update`, `delete`, `findManyWithCount`
- Seed script with realistic data

**Schema models:** `User`, `UserProfile`, `Account`, `Session`, `VerificationToken`, `Post`, `Tag`, `PostTag`

### `@chefer/ui`

Accessible React component library:
- `Button` — 6 variants (default, destructive, outline, secondary, ghost, link), 4 sizes, loading state
- `Input` — with label, error, hint, left/right icon support
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Badge` — 7 variants including success, warning, info
- Built with `class-variance-authority` for type-safe variants

### `@chefer/tsconfig`

Shared TypeScript configurations:
- `base.json` — strict mode, ESNext, bundler moduleResolution
- `nextjs.json` — Next.js specific (JSX preserve, Next plugin)
- `node.json` — Node.js specific (NodeNext modules, emit enabled)

### `@chefer/eslint-config`

ESLint 9 flat config:
- `base` — TypeScript, import ordering, general rules
- `nextjs` — extends base with Next.js and React hooks rules
- `node` — extends base with Node.js specific rules

---

## Architecture

### API Server (`apps/api`)

The API follows a layered architecture:

```
src/
├── domain/          # Business logic, entities, domain errors
├── application/     # Use cases / services (orchestrate domain)
├── infrastructure/  # External integrations (Prisma, Redis, etc.)
├── interfaces/      # HTTP middleware, route adapters
├── routers/         # tRPC routers (thin layer, delegates to services)
└── lib/             # tRPC init, env validation
```

**tRPC Procedures:**
- `publicProcedure` — unauthenticated
- `protectedProcedure` — requires valid session
- `adminProcedure` — requires ADMIN role

### Web App (`apps/web`)

Feature-based directory structure:

```
src/
├── app/             # Next.js App Router pages and layouts
│   ├── (auth)/      # Auth route group (login, register)
│   └── (dashboard)/ # Dashboard route group
├── features/        # Feature modules (auth, dashboard, ...)
│   └── auth/
│       ├── components/
│       ├── hooks/
│       └── lib/
├── components/      # Shared UI components (re-exports from @chefer/ui)
├── hooks/           # Global hooks
└── lib/             # tRPC client, env validation
```

---

## Testing

### Unit Tests (Vitest)

```bash
pnpm test
```

Tests are co-located with source files (`*.test.ts`, `*.spec.ts`).

### E2E Tests (Playwright)

```bash
# Build first, then run
pnpm build
pnpm test:e2e
```

E2E tests live in `tests/e2e/`. Playwright config is at `tests/playwright.config.ts`.

Tested browsers: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari.

---

## Database

### Prisma Schema

Key models:
- **User** — id, email, name, role, passwordHash, emailVerified, image
- **UserProfile** — bio, website, social links (1:1 with User)
- **Account** — OAuth provider accounts (NextAuth compatible)
- **Session** — User sessions
- **Post** — title, slug, content, status, author
- **Tag / PostTag** — many-to-many post tagging

### Migrations Workflow

```bash
# Development: push schema changes directly (no migration file)
pnpm db:push

# Create a named migration
pnpm db:migrate -- --name add_user_avatar

# Apply pending migrations in production
pnpm db:migrate:prod
```

---

## Docker

### Local Development

```bash
# Start PostgreSQL + Redis
docker compose -f infrastructure/docker/docker-compose.yml up -d

# With optional tools (pgAdmin, Redis Commander)
docker compose -f infrastructure/docker/docker-compose.yml --profile tools up -d
```

### Production Builds

```bash
# Build web image
docker build -f infrastructure/docker/Dockerfile.web \
  --build-arg NEXT_PUBLIC_APP_URL=https://chefer.dev \
  -t chefer-web:latest .

# Build API image
docker build -f infrastructure/docker/Dockerfile.api \
  -t chefer-api:latest .
```

Both Dockerfiles use multi-stage builds:
1. **deps** — install dependencies
2. **builder** — compile TypeScript / Next.js
3. **runner** — minimal production image (non-root user, health checks)

---

## CI/CD

### GitHub Actions

**CI** (`.github/workflows/ci.yml`) — runs on every PR and push to `main`/`develop`:
1. Install dependencies (with pnpm cache)
2. Lint (ESLint + Prettier check)
3. Type-check (tsc)
4. Unit tests (Vitest)
5. Build (Turborepo)
6. E2E tests (Playwright, on PRs only)

**Deploy** (`.github/workflows/deploy.yml`) — runs on push to `main`:
1. Build and push Docker images to GHCR
2. Run database migrations
3. Deploy to server (placeholder — replace with your hosting)
4. Smoke test

---

## Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

feat(web): add user profile page
fix(api): handle expired session tokens
docs(ci): update deployment workflow
chore(deps): update prisma to v5.16
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Scopes:** `web`, `api`, `ui`, `database`, `types`, `utils`, `config`, `eslint`, `tsconfig`, `docker`, `ci`, `deps`, `release`

---

## Seed Data

After running `pnpm db:seed`:

| Email | Password | Role |
|---|---|---|
| admin@chefer.dev | Admin@123! | ADMIN |
| alice@chefer.dev | User@123! | USER |
| bob@chefer.dev | User@123! | MODERATOR |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes with tests
4. Ensure CI passes: `pnpm lint && pnpm typecheck && pnpm test`
5. Commit with conventional commits: `git commit -m "feat(scope): description"`
6. Open a pull request

---

## License

MIT — see [LICENSE](LICENSE)
