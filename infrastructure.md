# Chefer — Infrastructure Overview

> **Keep this document up to date.** Any time infrastructure changes (new package, new service, new route, schema change, CI change), update the relevant section.

---

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Tooling](#3-monorepo-tooling)
4. [Apps](#4-apps)
   - [API (`apps/api`)](#41-api-appsapi)
   - [Web (`apps/web`)](#42-web-appsweb)
5. [Packages](#5-packages)
   - [@chefer/database](#51-cheferdatabase)
   - [@chefer/types](#52-chefertypes)
   - [@chefer/utils](#53-cheferutils)
   - [@chefer/ui](#54-cheferui)
   - [@chefer/tsconfig](#55-chefertsconfig)
   - [@chefer/eslint-config](#56-cheferesponse-config)
6. [Database Schema](#6-database-schema)
7. [API Layer](#7-api-layer)
8. [tRPC Procedure Map](#8-trpc-procedure-map)
9. [Authentication & Authorization](#9-authentication--authorization)
10. [Environment Variables](#10-environment-variables)
11. [Build Pipeline](#11-build-pipeline)
12. [Docker & Local Services](#12-docker--local-services)
13. [CI/CD](#13-cicd)
14. [Development Workflow](#14-development-workflow)
15. [Security Practices](#15-security-practices)

---

## 1. Repository Layout

```
chefer/
├── apps/
│   ├── api/                    # Express + tRPC backend (port 3001)
│   └── web/                    # Next.js 15 frontend (port 3000)
├── packages/
│   ├── database/               # Prisma client, schema, repositories
│   ├── types/                  # Shared TypeScript types & enums
│   ├── utils/                  # Pure utility functions
│   ├── ui/                     # React component library (shadcn-style)
│   └── config/
│       ├── tsconfig/           # Shared TypeScript configurations
│       └── eslint/             # Shared ESLint flat configurations
├── infrastructure/
│   ├── docker/                 # Dockerfiles + docker-compose.yml
│   └── scripts/                # setup.sh bootstrap script
├── tests/
│   └── e2e/                    # Playwright end-to-end tests
├── .github/
│   └── workflows/              # ci.yml, deploy.yml
├── turbo.json                  # Turborepo task graph
└── pnpm-workspace.yaml         # pnpm workspace roots
```

---

## 2. Technology Stack

| Layer                  | Technology                        | Version         |
| ---------------------- | --------------------------------- | --------------- |
| Runtime                | Node.js                           | 20+             |
| Package manager        | pnpm                              | 9+              |
| Monorepo orchestration | Turborepo                         | 2               |
| Frontend framework     | Next.js (App Router)              | 15              |
| Frontend library       | React                             | 19              |
| API framework          | Express                           | 4               |
| API type-safety        | tRPC                              | 11 (rc)         |
| Database ORM           | Prisma                            | 5               |
| Database               | PostgreSQL                        | 16              |
| Validation             | Zod                               | 3               |
| Data fetching          | TanStack Query                    | 5               |
| Forms                  | react-hook-form                   | 7               |
| Styling                | TailwindCSS                       | 3               |
| Component primitives   | class-variance-authority          | —               |
| Icon library           | lucide-react                      | —               |
| Serialisation          | superjson                         | 2               |
| Unit testing           | Vitest                            | 1               |
| Component testing      | React Testing Library             | 16              |
| E2E testing            | Playwright                        | 1.45            |
| Linting                | ESLint                            | 9 (flat config) |
| Formatting             | Prettier                          | —               |
| Git hooks              | Husky + lint-staged               | —               |
| Commit convention      | commitlint (Conventional Commits) | —               |
| Containerisation       | Docker (multi-stage builds)       | —               |
| Cache (optional)       | Redis                             | 7               |

---

## 3. Monorepo Tooling

### pnpm Workspaces

`pnpm-workspace.yaml` declares three workspace roots:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'packages/config/*'
```

All internal packages are referenced via `workspace:*` protocol (e.g., `"@chefer/database": "workspace:*"`).

### Turborepo

`turbo.json` defines the task dependency graph:

| Task        | Depends on                    | Outputs               | Cached          |
| ----------- | ----------------------------- | --------------------- | --------------- |
| `build`     | `^build` (dependencies first) | `.next/**`, `dist/**` | Yes             |
| `dev`       | —                             | —                     | No (persistent) |
| `test`      | `^build`                      | `coverage/**`         | Yes             |
| `lint`      | —                             | —                     | Yes             |
| `typecheck` | —                             | —                     | Yes             |

Running `pnpm dev` at the root starts all persistent `dev` tasks concurrently.

### Code Quality

- **Prettier** — single quotes, semicolons, import ordering (via `@trivago/prettier-plugin-sort-imports`)
- **ESLint 9 flat config** — TypeScript strict rules, import order, unicorn plugin
- **Husky pre-commit** — runs lint-staged (lint + format check on changed files)
- **commitlint** — enforces conventional commit messages (`feat:`, `fix:`, `docs:`, etc.)

---

## 4. Apps

### 4.1 API (`apps/api`)

**Port:** 3001
**Entry:** `src/index.ts`
**Runtime:** Node.js ESM (`"type": "module"`)

#### Architecture (Layered / Clean)

```
src/
├── domain/          # Business entities, custom error classes
├── application/     # Use-case services (UserService)
├── infrastructure/  # Concrete repository implementations (Prisma)
├── interfaces/      # HTTP middleware, Express adapters
├── routers/         # tRPC router definitions (thin wrappers over services)
└── lib/             # tRPC initialisation, env validation (Zod)
```

#### HTTP Endpoints

| Method | Path            | Description                         |
| ------ | --------------- | ----------------------------------- |
| GET    | `/health`       | Returns server status, env, version |
| GET    | `/health/ready` | Checks live DB connectivity         |
| \*     | `/trpc/*`       | tRPC batch endpoint (all API calls) |

#### Middleware Chain (every request)

1. CORS (configurable origins, credentials)
2. `express.json` (10 MB limit)
3. `express.urlencoded`
4. `requestIdMiddleware` — attaches `X-Request-ID`
5. tRPC adapter → `timingMiddleware` → procedure-specific middleware

#### Graceful Shutdown

Handles `SIGTERM` and `SIGINT`: closes HTTP server, disconnects Prisma.

---

### 4.2 Web (`apps/web`)

**Port:** 3000
**Framework:** Next.js 15, App Router, React 19

#### Page Map

| Route                    | Type             | Description                                        |
| ------------------------ | ---------------- | -------------------------------------------------- |
| `/`                      | Server Component | Landing page — hero, feature list, tech stack      |
| `/user`                  | Server Component | Displays first user from DB via tRPC server client |
| `/(auth)/login`          | Client Component | Login form (react-hook-form + Zod)                 |
| `/(dashboard)/dashboard` | Server Component | Dashboard placeholder                              |

#### tRPC Client Setup

Two clients coexist:

| Client      | File                     | Usage                                                         |
| ----------- | ------------------------ | ------------------------------------------------------------- |
| **Browser** | `src/lib/trpc.ts`        | `createTRPCReact` + React Query, used in Client Components    |
| **Server**  | `src/lib/trpc-server.ts` | `createTRPCClient` + httpBatchLink, used in Server Components |

Both use `superjson` as the transformer and point to `NEXT_PUBLIC_API_URL/trpc` (default: `http://localhost:3001/trpc`).

#### Next.js Config Highlights

- Internal workspace packages are transpiled (`transpilePackages`)
- Remote image patterns: GitHub, Google, Unsplash
- Security headers on every response (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Standalone output when `BUILD_STANDALONE=true` (used in Docker)

---

## 5. Packages

### 5.1 `@chefer/database`

Owns everything database-related. **Other apps must not import `@prisma/client` directly.**

```
src/
├── client.ts          # Prisma singleton (dev hot-reload safe)
├── repositories/
│   ├── index.ts
│   └── user.repository.ts   # UserRepository + IUserRepository interface
├── index.ts           # Public exports
└── seed.ts            # Development seed script
prisma/
├── schema.prisma      # Source of truth for DB schema
└── migrations/        # Auto-generated migration history
```

**Exports:** `prisma`, `PrismaClient`, `UserRepository`, `userRepository`, `IUserRepository`, Prisma model types, enums.

### 5.2 `@chefer/types`

Zero-dependency shared types consumed by all packages and apps.

**Key exports:**

- Enums: `UserRole`, `PostStatus`
- Domain types: `User`, `UserProfile`, `Post`
- API wrappers: `ApiResponse<T>`, `ApiError`, `ApiResult<T>`, `PaginatedResponse<T>`
- Auth types: `AuthSession`, `LoginInput`, `RegisterInput`, `JwtPayload`
- Utility generics: `Nullable<T>`, `Optional<T>`, `DeepPartial<T>`, `OmitTimestamps<T>`
- Error types: `AppError`, `ErrorCode`

### 5.3 `@chefer/utils`

Pure, side-effect-free utilities. Dependencies: `clsx`, `tailwind-merge`, `date-fns`.

| Module    | Functions                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Object    | `cn()`, `pick()`, `omit()`, `deepClone()`, `deepMerge()`, `groupBy()`, `keyBy()`, `flattenObject()`, `removeNullish()` |
| Date      | `formatDate()`, `formatRelativeTime()`, `formatIso()`, `addDaysToDate()`, `isDateAfter()`, `isPast()`, `isFuture()`    |
| String    | `slugify()`, `capitalize()`, `truncate()`                                                                              |
| Array     | `unique()`, `chunk()`, `flatten()`, `first()`, `last()`                                                                |
| Async     | `sleep()`, `retry()` (exponential backoff)                                                                             |
| Number    | `clamp()`, `randomInt()`                                                                                               |
| Assertion | `invariant()`, `assertDefined()`, `assertNever()`, `safeInvariant()`                                                   |

### 5.4 `@chefer/ui`

React component library. Peer deps: `react`, `react-dom`. Built with `class-variance-authority`.

**Components:**

| Component | Variants / Notes                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Button`  | default, destructive, outline, secondary, ghost, link · sizes: sm, default, lg, icon · supports `asChild`, `isLoading` |
| `Input`   | label, error message, hint text, icon slots                                                                            |
| `Card`    | CardHeader, CardTitle, CardDescription, CardContent, CardFooter                                                        |
| `Badge`   | default, secondary, destructive, outline, success, warning, info                                                       |

Exports are per-file (e.g., `import { Button } from '@chefer/ui/button'`).

### 5.5 `@chefer/tsconfig`

| File          | Target use                                  |
| ------------- | ------------------------------------------- |
| `base.json`   | Strict, ESNext, bundler resolution          |
| `nextjs.json` | Extends base — JSX preserve, Next.js plugin |
| `node.json`   | Extends base — Node.js, emit enabled        |

### 5.6 `@chefer/eslint-config`

| Config      | Target use                                 |
| ----------- | ------------------------------------------ |
| `base.js`   | TypeScript, import ordering, general rules |
| `nextjs.js` | Extends base + Next.js + React hooks       |
| `node.js`   | Extends base + Node.js rules               |

---

## 6. Database Schema

**Provider:** PostgreSQL 16
**ORM:** Prisma 5

### Entity Relationship Summary

```
User ─────────── UserProfile      (1:1, cascade delete)
User ─────────── Account[]        (1:N, cascade delete, OAuth)
User ─────────── Session[]        (1:N, cascade delete)
User ─────────── Post[]           (1:N, cascade delete)
Post ─────────── PostTag[]        (1:N, cascade delete)
Tag  ─────────── PostTag[]        (1:N, cascade delete)
PostTag          (composite PK: postId + tagId)
VerificationToken (standalone, for email verification flows)
```

### Model Field Reference

**User**

| Field                 | Type          | Notes                                             |
| --------------------- | ------------- | ------------------------------------------------- |
| id                    | String (cuid) | PK                                                |
| email                 | String        | Unique, indexed                                   |
| firstName / lastName  | String?       | —                                                 |
| name                  | String?       | Display name                                      |
| image                 | String?       | Avatar URL                                        |
| role                  | UserRole      | Default: USER                                     |
| passwordHash          | String?       | SHA-256 in seed (use bcrypt/argon2 in production) |
| emailVerified         | DateTime?     | —                                                 |
| createdAt / updatedAt | DateTime      | Auto-managed                                      |

**Post**

| Field     | Type          | Notes           |
| --------- | ------------- | --------------- |
| id        | String (cuid) | PK              |
| slug      | String        | Unique, indexed |
| status    | PostStatus    | Default: DRAFT  |
| published | Boolean       | Default: false  |
| authorId  | String        | FK → User       |

### Enums

```prisma
enum UserRole   { USER  MODERATOR  ADMIN }
enum PostStatus { DRAFT  PUBLISHED  ARCHIVED }
```

---

## 7. API Layer

### Layered Architecture

```
Router (tRPC)          ← thin, only input/output + auth guard
  └── Service          ← business logic, orchestrates repos
        └── Repository ← data access (Prisma), behind interface
              └── Prisma Client
```

### UserService (application layer)

Wraps `IUserRepository`. Methods: `findById`, `findByEmail`, `list`, `create`, `update`, `delete`.
Maps domain errors (e.g., `UserNotFoundError`) to tRPC error codes.

### PrismaUserRepository (infrastructure layer)

Implements `IUserRepository` from `@chefer/database`. Lives in `apps/api/src/infrastructure/prisma/`.

---

## 8. tRPC Procedure Map

All procedures live under the `/trpc` HTTP endpoint and are batched automatically.

| Procedure            | Access                    | Type     | Input                                                |
| -------------------- | ------------------------- | -------- | ---------------------------------------------------- |
| `user.me`            | Protected (auth required) | Query    | —                                                    |
| `user.getById`       | Public                    | Query    | `{ id: cuid }`                                       |
| `user.list`          | Admin only                | Query    | `{ page, limit, search?, role?, sortBy, sortOrder }` |
| `user.create`        | Admin only                | Mutation | `{ email, name?, password, role? }`                  |
| `user.update`        | Protected                 | Mutation | `{ id, name?, email?, role?, image? }`               |
| `user.delete`        | Admin only                | Mutation | `{ id: cuid }`                                       |
| `user.updateProfile` | Protected                 | Mutation | `{ name?, image? }`                                  |

### Middleware Stack

```
publicProcedure     → timingMiddleware
protectedProcedure  → timingMiddleware → isAuthenticated
adminProcedure      → timingMiddleware → isAuthenticated → isAdmin
```

---

## 9. Authentication & Authorization

**Current state:** Session-based authentication via an HTTP cookie (`chefer_session`).

The `createContext` function in `apps/api/src/interfaces/http/middleware/auth.middleware.ts`:

1. Reads the session cookie or `Authorization: Bearer <token>` header
2. Hydrates `ctx.user` (null if unauthenticated)

**Roles:**

| Role        | Capabilities                              |
| ----------- | ----------------------------------------- |
| `USER`      | Read public resources, update own profile |
| `MODERATOR` | USER + moderation capabilities (reserved) |
| `ADMIN`     | Full access — list/create/delete any user |

**Notes:**

- The database schema is **NextAuth.js compatible** (Account, Session, VerificationToken models exist)
- Password hashing in the seed uses SHA-256 — replace with **bcrypt or argon2** before production
- JWT infrastructure (secret + refresh secret) is wired in env but full JWT flow is not yet implemented

---

## 10. Environment Variables

### `apps/api/.env`

| Variable                   | Required | Default               | Description                     |
| -------------------------- | -------- | --------------------- | ------------------------------- |
| `NODE_ENV`                 | No       | development           | Runtime environment             |
| `PORT`                     | No       | 3001                  | HTTP listen port                |
| `HOST`                     | No       | 0.0.0.0               | HTTP listen host                |
| `DATABASE_URL`             | **Yes**  | —                     | PostgreSQL connection string    |
| `JWT_SECRET`               | **Yes**  | —                     | Min 32 chars                    |
| `JWT_EXPIRES_IN`           | No       | 15m                   | Access token TTL                |
| `REFRESH_TOKEN_SECRET`     | **Yes**  | —                     | Min 32 chars                    |
| `REFRESH_TOKEN_EXPIRES_IN` | No       | 30d                   | Refresh token TTL               |
| `CORS_ORIGINS`             | No       | http://localhost:3000 | Comma-separated allowed origins |
| `REDIS_URL`                | No       | —                     | Redis connection string         |
| `RATE_LIMIT_MAX`           | No       | 100                   | Max requests per window         |
| `RATE_LIMIT_WINDOW_MS`     | No       | 60000                 | Rate limit window (ms)          |

### `apps/web/.env.local`

| Variable               | Required | Default                    | Description                |
| ---------------------- | -------- | -------------------------- | -------------------------- |
| `NEXT_PUBLIC_APP_URL`  | No       | http://localhost:3000      | Public app base URL        |
| `NEXT_PUBLIC_APP_NAME` | No       | Chefer                     | App display name           |
| `NEXT_PUBLIC_API_URL`  | No       | http://localhost:3001      | API server URL             |
| `NEXT_PUBLIC_TRPC_URL` | No       | http://localhost:3001/trpc | tRPC endpoint URL          |
| `NEXTAUTH_URL`         | No       | —                          | NextAuth callback base URL |
| `NEXTAUTH_SECRET`      | No       | —                          | Min 32 chars               |

### `packages/database/.env`

| Variable       | Required | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `DATABASE_URL` | **Yes**  | Required by Prisma CLI for migrations/studio |

---

## 11. Build Pipeline

### Turborepo Task Graph

```
typecheck ──┐
lint        ├──> (independent, run in parallel)
test        ──> requires ^build
build       ──> requires ^build (packages built before apps)
dev         ──> no dependency, persistent
```

### Production Build Output

- **API:** TypeScript compiled to `apps/api/dist/`
- **Web:** Next.js compiled to `apps/web/.next/` (standalone when `BUILD_STANDALONE=true`)

---

## 12. Docker & Local Services

### Local Development (docker-compose)

File: `infrastructure/docker/docker-compose.yml`

| Service           | Image                          | Port | Profile  |
| ----------------- | ------------------------------ | ---- | -------- |
| `postgres`        | postgres:16-alpine             | 5432 | (always) |
| `redis`           | redis:7-alpine                 | 6379 | (always) |
| `pgadmin`         | dpage/pgadmin4                 | 5050 | `tools`  |
| `redis-commander` | rediscommander/redis-commander | 8081 | `tools`  |

Start tools: `docker compose --profile tools up -d`

### Production Dockerfiles

**`Dockerfile.api`** — 4-stage multi-stage build:

1. `deps` — install all deps (frozen lockfile)
2. `builder` — compile TypeScript, generate Prisma client
3. `prod-deps` — install production deps only
4. `runner` — minimal alpine, non-root user `apiuser`, dumb-init, health check

**`Dockerfile.web`** — 3-stage:

1. `deps` — install deps
2. `builder` — `next build` (standalone mode)
3. `runner` — minimal alpine, non-root user `nextjs`, health check

---

## 13. CI/CD

### `ci.yml` — Runs on push/PR to `main` and `develop`

| Step           | Description                                            |
| -------------- | ------------------------------------------------------ |
| Lint           | ESLint + Prettier check                                |
| Typecheck      | `tsc --noEmit` all packages                            |
| Test           | Vitest + Codecov coverage upload                       |
| Build          | Turborepo build with cache                             |
| E2E (PRs only) | Playwright against a live PostgreSQL service container |

### `deploy.yml` — Runs on push to `main`

| Step         | Description                                                              |
| ------------ | ------------------------------------------------------------------------ |
| docker-build | Build & push images to GHCR (`ghcr.io/<owner>/chefer-web`, `chefer-api`) |
| migrate      | `prisma migrate deploy` (requires `DATABASE_URL` secret)                 |
| deploy       | Placeholder — SSH / kubectl / ECS deploy                                 |
| smoke-test   | Polls `/health` endpoint after deploy                                    |

---

## 14. Development Workflow

### First-time setup

```bash
# 1. Bootstrap (checks Node 20+, pnpm, Docker; copies .env files; installs deps; starts DB)
./infrastructure/scripts/setup.sh

# 2. Push schema to DB
pnpm db:push

# 3. Seed with test data
pnpm db:seed
```

### Daily development

```bash
pnpm dev          # Start API (3001) + Web (3000) in watch mode
pnpm lint         # Lint all packages
pnpm typecheck    # Type-check all packages
pnpm test         # Run all unit tests
pnpm format       # Auto-format with Prettier
```

### Database

```bash
pnpm db:push          # Sync schema to DB (dev only, no migration)
pnpm db:migrate       # Create a named migration
pnpm db:migrate:prod  # Apply migrations (production)
pnpm db:seed          # Seed development data
pnpm db:studio        # Prisma Studio at localhost:5555
pnpm db:generate      # Regenerate Prisma client after schema change
```

### Test accounts (after seed)

| Email            | Password   | Role      |
| ---------------- | ---------- | --------- |
| admin@chefer.dev | Admin@123! | ADMIN     |
| alice@chefer.dev | User@123!  | USER      |
| bob@chefer.dev   | User@123!  | MODERATOR |

---

## 15. Security Practices

- Non-root users in all Docker images (`apiuser`, `nextjs`)
- Health checks with timeouts in Docker
- SIGTERM/SIGINT graceful shutdown with Prisma disconnect
- CORS restricted to configured origins with credentials support
- `X-Request-ID` on every request for tracing
- Security headers in Next.js config (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Zod validation on all environment variables at startup
- Zod validation on all tRPC procedure inputs
- Email normalised to lowercase + trimmed before persistence or lookup
- Role-based access control enforced in tRPC middleware (not only in the router)
- **TODO:** Replace SHA-256 password hashing (seed only) with bcrypt or argon2
- **TODO:** Implement full JWT access/refresh token flow
