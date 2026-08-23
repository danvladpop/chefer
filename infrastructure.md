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

`pnpm-workspace.yaml` declares four workspace roots:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'packages/config/*'
  - 'tests'
```

`tests` is the `@chefer/e2e` package. It owns the Playwright dependency and
config so the suite can be run from the repo root (`pnpm test:e2e`); previously
Playwright lived in `apps/web` while the config sat in `tests/`, and neither
location could actually run it.

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

| Method | Path                        | Description                                                                                                                                         |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                   | Returns server status, env, version                                                                                                                 |
| GET    | `/health/ready`             | Checks live DB connectivity                                                                                                                         |
| GET    | `/api/recipe-images/stream` | SSE stream of recipe image status updates                                                                                                           |
| POST   | `/api/uploads/image`        | Session-authenticated raw-body image upload (≤ 5 MB)                                                                                                |
| GET    | `/uploads/*`                | Statically served uploaded images                                                                                                                   |
| POST   | `/api/chat`                 | AI chef chat (P1-4) — session-authenticated, streams plain text; tool-capable (swapMeal, scaleRecipe)                                               |
| POST   | `/api/scan-meal`            | Meal photo scan (F4) — session-authenticated raw-body image (≤ 5 MB) → vision macro estimate; premium-gated (403 `upgradeRequired`) + metered (429) |
| \*     | `/trpc/*`                   | tRPC batch endpoint (all API calls)                                                                                                                 |

#### Middleware Chain (every request)

1. `helmet` — security headers (CORP relaxed to `cross-origin` so `/uploads` images render on the web origin)
2. CORS (configurable origins, credentials)
3. `express.json` (10 MB limit)
4. `express.urlencoded`
5. `requestIdMiddleware` — attaches `X-Request-ID`
6. `express-rate-limit` on `/trpc` — `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` per IP (standard `RateLimit` headers)
7. tRPC adapter → `timingMiddleware` (one structured pino line per procedure: requestId, path, duration, ok, userId) → procedure-specific middleware

#### Rate Limits & Daily Quotas

| Limit                          | Scope                        | Value                                                                          | Where                                                             |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Global tRPC flood              | per IP                       | `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` (default 100/min)                      | `index.ts` (express-rate-limit)                                   |
| `auth.login` / `auth.register` | per IP                       | 10 per 15 min                                                                  | `auth.router.ts` → `lib/rate-limit.ts` (in-memory sliding window) |
| Plan generations               | per user per UTC day         | from `PLAN_FEATURES` (counted from `meal_plans` rows)                          | `meal-plan.router.ts` → `lib/quotas.ts`                           |
| AI swaps                       | per premium user per UTC day | from `PLAN_FEATURES` (counted from `ai_call_logs`)                             | `meal-plan.router.ts` → `lib/quotas.ts`                           |
| Chat messages                  | per FREE user per UTC day    | from `PLAN_FEATURES` (counted from `ai_call_logs` CHAT)                        | `chat.router.ts` → `ChatService.assertChatQuota`                  |
| Meal photo scans (F4)          | per premium user per UTC day | from `PLAN_FEATURES` (counted from `ai_call_logs` SCAN); free tier → FORBIDDEN | `scan.router.ts` → `lib/quotas.ts` (`assertMealScanQuota`)        |

The in-memory stores assume a single API instance; move to Redis (`REDIS_URL`
is already in the env schema) before scaling horizontally. Per-tier quota
numbers live in the `PLAN_FEATURES` matrix (`packages/types/src/plan-features.ts`,
PW-1) and are resolved through `lib/entitlements.ts` (`isPremiumUser` /
`hasFeature` / `getLimit`) — the same helpers that back `premiumProcedure` and
the tier branches, so enforcement has one source of truth.

#### Graceful Shutdown

Handles `SIGTERM` and `SIGINT`: closes HTTP server, disconnects Prisma.

---

### 4.2 Web (`apps/web`)

**Port:** 3000
**Framework:** Next.js 15, App Router, React 19

#### Page Map

| Route                            | Type             | Description                                                                                                                                                                                       |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                              | Server Component | Landing page — hero, feature list, tech stack                                                                                                                                                     |
| `/(auth)/login`                  | Client Component | Login form (react-hook-form + Zod)                                                                                                                                                                |
| `/(auth)/register`               | Client Component | Registration form, redirects to `/onboarding`                                                                                                                                                     |
| `/(dashboard)/dashboard`         | Client Component | Daily overview — greeting, weekly outlook strip, Next Meal spotlight, NutritionSummary                                                                                                            |
| `/(dashboard)/meal-plan`         | Client Component | Week grid at `lg`+, single-day view below; Generate / Regenerate; GenerateOverlay spinner                                                                                                         |
| `/(dashboard)/recipes`           | Client Component | Browse all/saved recipes; search; heart toggle favourite                                                                                                                                          |
| `/(dashboard)/ingredients`       | Client Component | Ingredient catalog — All/Mine tabs, search, permissioned edit/delete, add custom                                                                                                                  |
| `/(dashboard)/recipes/[id]`      | Client Component | Recipe detail — ingredients, instructions, macros, Swap/Save, StarRatingWidget                                                                                                                    |
| `/(dashboard)/recipes/[id]/cook` | Client Component | Cook mode (P1-3): full-screen stepper, wake lock, inline timers, servings scaling, ingredients drawer; finish logs to the tracker + opens the rating                                              |
| `/(dashboard)/admin/users`       | Client Component | Admin tier management (PW-2): search users, flip FREE/PREMIUM, today's AI usage — server-gated by adminProcedure                                                                                  |
| `/(dashboard)/preferences`       | Client Component | Edit ChefProfile + DietaryPreferences + display units; saves redirect to `/dashboard`. Delivery address/currency inputs removed 2026-08-22 (schema fields remain; currency UI returns with P2-4)  |
| `/(dashboard)/shopping-list`     | Client Component | Shopping List — week navigator, categorised items with vocabulary price estimates + est. total; F3: "Have it" chips + savings counter (premium), pantry ghost banner (free), weekly confirm sheet |
| `/(dashboard)/pantry`            | Client Component | Pantry (F3) — kitchen inventory oldest-first, manual add/remove + weekly "still have these?" check (premium); read-only with the upsell for free accounts                                         |
| `/(dashboard)/history`           | Client Component | Meal Plan History — ACTIVE/ARCHIVED plan cards with Restore button                                                                                                                                |
| `/(dashboard)/history/[planId]`  | Client Component | Read-only plan — week grid at `lg`+, single-day view below                                                                                                                                        |
| `/(dashboard)/onboarding`        | Client Component | 4-step wizard (Goals → Metrics → Diet → Cuisine & Cadence)                                                                                                                                        |
| `/(dashboard)/premium`           | Client Component | Premium showcase (premium_plan.md §6.2) — feature cards from the registry, matrix-driven Free-vs-Premium table, anchor stack, FAQ; deep-linked with `?source=` preserved into the funnel events   |

#### App Shell & Navigation

`DashboardShell` runs two layout modes around a single `lg` (1024px) boundary:

| Breakpoint | Shell                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `< lg`     | Document scrolls. Sticky `TopHeader` with a drawer trigger, fixed `BottomNav`, `MobileNavDrawer` |
| `≥ lg`     | Fixed shell (`h-dvh`, `overflow-hidden`); only `<main>` scrolls. `SideBar` visible               |

Below `lg` the **document** scrolls rather than a nested container — that is what
lets iOS Safari auto-hide its URL bar, keeps momentum scrolling native, and lets
the browser restore scroll position on back-navigation.

Navigation components all read `src/features/nav/nav-items.ts`, the single source
of truth for routes:

| Component         | Role                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `SideBar`         | Desktop rail, all 11 destinations (`lg`+)                           |
| `BottomNav`       | Mobile tab bar — 4 primary destinations plus a More button (`< lg`) |
| `MobileNavDrawer` | Slide-over holding the remaining 7, plus the plan/upgrade footer    |

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
│   ├── user.repository.ts               # UserRepository + IUserRepository
│   ├── chef-profile.repository.ts       # ChefProfileRepository + IChefProfileRepository
│   ├── dietary-preferences.repository.ts
│   ├── meal-plan.repository.ts          # MealPlanRepository + IMealPlanRepository
│   ├── favourite-recipe.repository.ts   # FavouriteRecipeRepository + IFavouriteRecipeRepository
│   ├── meal-rating.repository.ts        # MealRatingRepository + IMealRatingRepository
│   └── chef-review.repository.ts        # ChefReviewRepository + IChefReviewRepository (F1)
├── index.ts           # Public exports
└── seed.ts            # Development seed script
prisma/
├── schema.prisma      # Source of truth for DB schema
└── migrations/        # Auto-generated migration history
```

**Exports:** `prisma`, `PrismaClient`, all repository classes, singleton instances, and interfaces; all Prisma model types (`User`, `ChefProfile`, `DietaryPreferences`, `Recipe`, `MealPlan`, `MealPlanDay`, `FavouriteRecipe`, `MealRating`, `DailyLog`, `WeightEntry`, `ChefReview`); enums (`UserRole`, `PostStatus`, `MealPlanStatus`, `BiologicalSex`, `Prisma`).

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
| `Toast`   | success / error, auto-dismiss                                                                                          |
| `Sheet`   | Responsive dialog — bottom sheet below `sm`, centred dialog above. Sizes sm/md/lg/xl, optional footer slot             |
| `Drawer`  | Edge slide-over (left/right). Used for the mobile navigation menu                                                      |

`Sheet` and `Drawer` share `lib/use-dismissable.ts`, which provides a
ref-counted body scroll lock, a Tab focus trap, Escape-to-close and focus
restore. **New overlays should use `Sheet` rather than a hand-rolled
`fixed inset-0` div** — six of those existed before and none had scroll
locking or focus management.

Every control steps up to a 44px touch target below `sm` and returns to the
denser desktop scale above it. `Input` also renders at 16px on mobile, because
iOS Safari zooms into any focused field below that and never zooms back.

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
User ─────────── UserProfile        (1:1, cascade delete)
User ─────────── Account[]          (1:N, cascade delete, OAuth)
User ─────────── Session[]          (1:N, cascade delete)
User ─────────── Post[]             (1:N, cascade delete)
User ─────────── ChefProfile        (1:1, cascade delete)
User ─────────── DietaryPreferences (1:1, cascade delete)
User ─────────── MealPlan[]         (1:N, cascade delete)
User ─────────── FavouriteRecipe[]  (1:N, cascade delete)
User ─────────── MealRating[]       (1:N, cascade delete)
User ─────────── ChefReview[]       (1:N, cascade delete, F1 weekly reviews)
User ─────────── HouseholdMember[]  (1:N, cascade delete, F2)
User ─────────── PantryItem[]       (1:N, cascade delete, F3)
MealPlan ──────── MealPlanDay[]     (1:N, cascade delete)
Post ─────────── PostTag[]          (1:N, cascade delete)
Tag  ─────────── PostTag[]          (1:N, cascade delete)
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
| planTier              | PlanTier      | Default: FREE — PREMIUM unlocks AI features       |
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

**ChefProfile**

| Field                | Type           | Notes                                                                                                    |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| id                   | String (cuid)  | PK                                                                                                       |
| userId               | String         | Unique FK → User, cascade delete                                                                         |
| displayName          | String?        | —                                                                                                        |
| biologicalSex        | BiologicalSex? | MALE / FEMALE / OTHER                                                                                    |
| age                  | Int?           | —                                                                                                        |
| heightCm             | Float?         | —                                                                                                        |
| weightKg             | Float?         | —                                                                                                        |
| activityLevel        | ActivityLevel? | SEDENTARY/LIGHTLY_ACTIVE/…/ATHLETE                                                                       |
| goal                 | Goal?          | LOSE_WEIGHT/MAINTAIN/GAIN_MUSCLE/EAT_HEALTHIER                                                           |
| dailyCalorieTarget   | Int?           | Computed by Mifflin-St Jeor at save                                                                      |
| weeklyBudgetEur      | Float?         | Weekly ingredient budget ceiling (P2-4) — generation treats it as a hard constraint                      |
| targetAdjustmentKcal | Int            | Default 0 — cumulative Adaptive Chef dial (F1), applied by resolveDailyTargets after the goal adjustment |
| deliveryAddress      | String?        | Full address string for grocery delivery                                                                 |
| deliveryCurrency     | String?        | ISO 4217 currency code (EUR/USD/GBP/RON)                                                                 |
| updatedAt            | DateTime       | Auto-managed                                                                                             |

**DietaryPreferences**

| Field               | Type     | Notes                            |
| ------------------- | -------- | -------------------------------- |
| id                  | String   | PK                               |
| userId              | String   | Unique FK → User, cascade delete |
| cuisinePreferences  | String[] | —                                |
| dietaryRestrictions | String[] | Vegan, Gluten-Free, etc.         |
| allergies           | String[] | —                                |
| dislikedIngredients | String[] | —                                |
| mealsPerDay         | Int      | Default 3                        |
| servingSize         | Int      | Default 1                        |

**Recipe**

| Field         | Type          | Notes                                                    |
| ------------- | ------------- | -------------------------------------------------------- |
| id            | String (cuid) | PK — reuses AI fixture id                                |
| name          | String        | —                                                        |
| description   | String        | —                                                        |
| ingredients   | Json          | `[{ name, quantity, unit }]`                             |
| instructions  | String[]      | —                                                        |
| nutritionInfo | Json          | `{ calories, protein, carbs, fat }`                      |
| cuisineType   | String        | —                                                        |
| dietaryTags   | String[]      | —                                                        |
| prepTimeMins  | Int           | —                                                        |
| cookTimeMins  | Int           | —                                                        |
| servings      | Int           | —                                                        |
| imageUrl      | String?       | —                                                        |
| imageStatus   | ImageStatus   | PENDING / GENERATING / DONE / FAILED                     |
| imageRetries  | Int           | Transient-failure retry counter                          |
| imagePriority | Int           | Default 100; lower = generated first (0 = today's meals) |
| source        | RecipeSource  | AI / MANUAL / CURATED                                    |
| sourceUrl     | String?       | Provenance of imported recipes (F5 Cheferize)            |
| creatorId     | String?       | FK → User — used for AI usage logging                    |

**MealPlan**

| Field         | Type           | Notes                     |
| ------------- | -------------- | ------------------------- |
| id            | String (cuid)  | PK                        |
| userId        | String         | FK → User, cascade delete |
| weekStartDate | DateTime       | Monday of the plan week   |
| status        | MealPlanStatus | ACTIVE / ARCHIVED         |
| createdAt     | DateTime       | Auto-managed              |

**MealPlanDay**

| Field      | Type          | Notes                         |
| ---------- | ------------- | ----------------------------- | ----------------------- |
| id         | String (cuid) | PK                            |
| mealPlanId | String        | FK → MealPlan, cascade delete |
| dayOfWeek  | Int           | 0 = Monday … 6 = Sunday       |
| meals      | Json          | `[{ type: 'breakfast'         | …, recipeId: string }]` |

**FavouriteRecipe**

| Field         | Type          | Notes                       |
| ------------- | ------------- | --------------------------- |
| id            | String (cuid) | PK                          |
| userId        | String        | FK → User, cascade delete   |
| recipeId      | String        | FK → Recipe, cascade delete |
| savedAt       | DateTime      | Default now()               |
| useInNextPlan | Boolean       | Default false               |
| (unique)      |               | `[userId, recipeId]`        |

**MealRating**

| Field    | Type          | Notes                            |
| -------- | ------------- | -------------------------------- |
| id       | String (cuid) | PK                               |
| userId   | String        | FK → User, cascade delete        |
| recipeId | String        | FK → Recipe, cascade delete      |
| rating   | Int           | 1–5                              |
| notes    | String?       | Optional free-text comment       |
| ratedAt  | DateTime      | Default now(), updates on upsert |
| (unique) |               | `[userId, recipeId]`             |

**IngredientImage**

| Field          | Type     | Notes                                                                     |
| -------------- | -------- | ------------------------------------------------------------------------- |
| ingredientName | String   | PK (lowercase, normalized ingredient name)                                |
| imageUrl       | String   | Resolved Unsplash URL (API) or category fallback                          |
| resolvedAt     | DateTime | When the image was last resolved — auto-set on create, updated on refresh |

Standalone lookup cache — no user FK. Populated on first request for each unique ingredient name, then served from cache on all subsequent requests.

**IngredientPrice** (the ingredient catalog)

| Field                                                                       | Type     | Notes                                                                                                 |
| --------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| ingredientName                                                              | String   | PK (lowercase, normalized)                                                                            |
| pricePer100gEur                                                             | Float?   | Mass-based price (null if family doesn't apply)                                                       |
| pricePer100mlEur                                                            | Float?   | Volume-based price                                                                                    |
| pricePerPieceEur                                                            | Float?   | Count-based price (1 medium banana, 1 egg, …)                                                         |
| caloriesPer100g / proteinPer100g / carbsPer100g / fatPer100g / fiberPer100g | Float?   | Macros — drive auto-computed recipe nutrition                                                         |
| gramsPerPiece                                                               | Float?   | Count-unit → grams ("1 medium banana ≈ 118 g")                                                        |
| imageUrl                                                                    | String?  | Catalog thumbnail (custom ingredients)                                                                |
| creatorId                                                                   | String?  | null = global vocabulary; set = user's private custom ingredient (`source: USER`, never AI-refreshed) |
| source                                                                      | String   | `AI_ESTIMATE` \| `USER`                                                                               |
| estimatedAt                                                                 | DateTime | Refreshed weekly by IngredientPriceWorker                                                             |

Store-agnostic price + nutrition vocabulary — self-building from all recipe ingredients ever generated.

**ShoppingList**

| Field       | Type     | Notes                                                                                           |
| ----------- | -------- | ----------------------------------------------------------------------------------------------- |
| id          | String   | PK (cuid)                                                                                       |
| planId      | String   | Unique — one persisted list per meal plan                                                       |
| items       | Json     | Consolidated items (images/prices re-resolved on read)                                          |
| checkedKeys | String[] | Synced check-off state (P1-5), cleared on AI regenerate                                         |
| aiGenerated | Boolean  | True when written by the premium AI regenerate                                                  |
| customItems | Json     | User-added items (chat tool + page add-input) — overlay the derived/AI list, survive regenerate |
| updatedAt   | DateTime | Auto-managed                                                                                    |

**DailyLog**

| Field                       | Type      | Notes                                                                                                                                                                                                       |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                          | String    | PK (cuid)                                                                                                                                                                                                   |
| userId                      | String    | FK → User, cascade delete                                                                                                                                                                                   |
| date                        | Date      | UTC midnight; unique `[userId, date]`                                                                                                                                                                       |
| loggedMeals                 | Json      | `LoggedMealEntry[]` — either `{ recipeId, … }` (planned) or `{ custom: { name, estimatedBy: 'vision'\|'manual' }, … }` (F4 quick-adds/scans); plus `mealType, portionMultiplier, kcal, protein, carbs, fat` |
| totalKcal/Protein/Carbs/Fat | Int/Float | Denormalised sums over loggedMeals                                                                                                                                                                          |

**ChefReview** (F1 Adaptive Chef — one row per user-week)

| Field          | Type     | Notes                                                                    |
| -------------- | -------- | ------------------------------------------------------------------------ |
| id             | String   | PK (cuid)                                                                |
| userId         | String   | FK → User, cascade delete                                                |
| weekStart      | DateTime | UTC midnight of the reviewed week's Monday; unique `[userId, weekStart]` |
| adherencePct   | Int      | Days with ≥1 logged meal / 7                                             |
| avgDailyKcal   | Int      | Σ logged kcal / logged days                                              |
| weightTrendKg  | Float?   | EWMA delta over the window; null until enough data                       |
| adjustmentKcal | Int      | Delta applied by THIS review (cumulative dial on ChefProfile)            |
| savedEur       | Float?   | Pantry savings surfaced in the review (F3 seam)                          |
| reviewText     | String   | Gemini-written summary (mock: template string)                           |

**HouseholdMember** (F2)

| Field                                                 | Type     | Notes                                         |
| ----------------------------------------------------- | -------- | --------------------------------------------- |
| id                                                    | String   | PK (cuid)                                     |
| userId                                                | String   | FK → User, cascade delete                     |
| name                                                  | String   | —                                             |
| portionFactor                                         | Float    | Default 1 (0.5 kid … 1.5 big eater)           |
| isKid                                                 | Boolean  | Default false                                 |
| allergies / dietaryRestrictions / dislikedIngredients | String[] | Unioned with the owner's for safety filtering |

**PantryItem** (F3)

| Field          | Type     | Notes                                                                                                                                  |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| id             | String   | PK (cuid)                                                                                                                              |
| userId         | String   | FK → User, cascade delete                                                                                                              |
| ingredientName | String   | Normalized; unique `[userId, ingredientName, unit]`                                                                                    |
| quantity       | Float    | `> 0` = real amount in `unit`; **`0` = the "some" state** (still have it, amount unknown — weekly confirms decay stale rows to it)     |
| unit           | String   | —                                                                                                                                      |
| source         | String   | `PURCHASE` (shopping-list check-off) \| `MANUAL`                                                                                       |
| updatedAt      | DateTime | Auto-managed; OLDEST-first = the use-first order. Decay preserves it (explicit set wins over `@updatedAt`) so decay ≠ a fresh purchase |

**Feedback** (beta feedback channel, ux-fixes-plan.md 1.6)

| Field     | Type     | Notes                                    |
| --------- | -------- | ---------------------------------------- |
| id        | String   | PK (cuid)                                |
| userId    | String   | FK → User, cascade delete                |
| message   | String   | Free text, ≤2000 chars (service-trimmed) |
| path      | String?  | App route the user sent it from          |
| createdAt | DateTime | Indexed `[userId, createdAt]`            |

### Enums

```prisma
enum UserRole       { USER  MODERATOR  ADMIN }
enum PlanTier       { FREE  PREMIUM }
enum PostStatus     { DRAFT  PUBLISHED  ARCHIVED }
enum MealPlanStatus { DRAFT  ACTIVE  ARCHIVED }
enum BiologicalSex  { MALE  FEMALE }
enum ActivityLevel  { SEDENTARY  LIGHTLY_ACTIVE  MODERATELY_ACTIVE  VERY_ACTIVE  ATHLETE }
enum Goal           { LOSE_WEIGHT  MAINTAIN  GAIN_MUSCLE  EAT_HEALTHIER }
enum RecipeSource   { AI  MANUAL  CURATED }
enum UnitSystem     { METRIC  IMPERIAL }
enum ImageStatus    { PENDING  GENERATING  DONE  FAILED }
enum AiCallType     { MEAL_PLAN  RECIPE_SWAP  SHOPPING_LIST  IMAGE_GENERATION  INGREDIENT_PRICES  CHAT  SCAN  RECIPE_IMPORT }
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

### PreferencesService (application layer)

`apps/api/src/application/preferences/preferences.service.ts`. Methods: `hasProfile`, `get`, `setup`, `update` (backing both `preferences.updateSafety` and `preferences.updateTargets` — the split is enforced at the router's auth level, P1-2).
Orchestrates `IChefProfileRepository` + `IDietaryPreferencesRepository` inside a Prisma `$transaction`. Recomputes `dailyCalorieTarget` via Mifflin-St Jeor on every update. Accepts `deliveryAddress` and `deliveryCurrency` fields.

### CoachService (application layer)

`apps/api/src/application/coach/coach.service.ts` (F1 Adaptive Chef). The Sunday review loop:
`runReviewSweep` (called by WeeklyPlanWorker BEFORE plan generation) finds users with ≥3 logged
days in the closing week and writes one `ChefReview` row per user-week, idempotently
(`@@unique(userId, weekStart)`, weekStart = UTC Monday midnight). Metrics and the adjustment
policy live in the PURE module `application/coach/review.service.ts` (adherence, avg kcal,
EWMA α=0.25 weight trend over `WeightEntry` rows; LOSE plateau ×2 consecutive → −100 kcal
floored at BMR×1.1, GAIN stall → +100 kcal ceilinged at TDEE+500, adherence <50% → no change).
Premium adjustments accumulate in `ChefProfile.targetAdjustmentKcal`, which `resolveDailyTargets`
applies AFTER the goal adjustment and BEFORE the protein cap — free-tier reviews are written
teaser-only (dial untouched). Review prose comes from `application/coach/review-text.ts`
(direct Gemini call, non-medical tone rules; deterministic template in mock mode or on failure).
`getCurrentReview` shapes the payload by entitlement: full for `adaptiveCoaching`, first-line
teaser for free (the full text never leaves the server). Depends on `IChefReviewRepository`,
`IChefProfileRepository`, `IWeightEntryRepository` (constructor-injected for tests).

### HouseholdService (application layer)

`apps/api/src/application/household/household.service.ts` (F2 "Feed the Whole Table", premium_plan.md W2-D). CRUD over `IHouseholdMemberRepository` (constructor-injected): `list`, `add` (capped by `getLimit(user, 'householdMembers')` — premium 5, free 0), `update`/`remove` (ownership-scoped, NOT_FOUND otherwise). Also exports the PURE merge helpers the generation path uses:

- `mergeHouseholdSafety(owner, members)` — case-insensitive union of every member's allergies + dietary restrictions with the owner's (SafetyPrefs shape; member dislikes stay OUT — they are soft). **Safety is never premium**: MealPlanService applies this union on the free curated path, curated swaps and AI swaps whenever members exist (e.g. created before a downgrade).
- `computeHouseholdContext(members, owner)` — fills `MealPlanInput.householdContext`: `portionSum = ceil(1 owner portion + Σ member portionFactor)` (drives recipe servings + quantity scaling), `mergedSafety`, and per-member `dislikeNotes` ("avoid mushrooms for Maria"); `undefined` with no members so the seam stays absent.

### ChatService (application layer)

`apps/api/src/application/chat/chat.service.ts` (P1-4). Backs `POST /api/chat`: enforces the matrix chat quota (`chatMessagesPerDay` — FREE 5/day counted from `ai_call_logs` CHAT rows, premium unlimited), builds a fresh per-message context from the user's REAL data (today's meals with macros + day totals, weekly overview, resolved daily targets, allergies/restrictions/dislikes, recent rating signals) and hands the model tools over the real services: `swapMeal` (performs an actual plan swap through MealPlanService, respecting the swap quota), `scaleRecipe` (rescales ingredient quantities from the active plan), `addToShoppingList` (items land in the customItems overlay), `logMeal` (F4 "I ate this" — logs a manual custom entry into today's tracker via TrackerService, rebalance included) and `whatCanIMake` (F3 — pantry-coverage ranking via PantryService; free tier gets a teaser). The Gemini implementation runs a bounded function-calling loop and streams the final answer; the mock echoes the same context and exercises the same tool handlers.

### RecipeImportService (application layer)

`apps/api/src/application/recipe-import/recipe-import.service.ts` (F5 "Cheferize Anything", premium_plan.md W1-C). Backs `recipe.importPreview` / `recipe.importSave`:

- **`preview(user, source)`** — metered via `recipeImportsPerDay` (AiCallLog `RECIPE_IMPORT` rows, attempts not successes; FREE 1/day = the §6.4 ghost preview, premium 5/day). URL sources go through `lib/recipe-import/`: SSRF-guarded fetch (`ssrf-guard.ts` — http(s) only, default ports, every DNS-resolved address checked against private/loopback/link-local/metadata/CGNAT/ULA ranges; `fetch-page.ts` — 10 s timeout, 1 MB streaming cap, ≤3 redirects each re-validated) then a dependency-free readability strip (`extract-content.ts` — schema.org Recipe JSON-LD extraction, chrome/script removal, og:image, 20 k char cap). Extraction (`IAIService.extractRecipe`, text or photo multimodal) is followed by the **Cheferize pass** (`IAIService.cheferizeRecipe`: allergen/restriction substitutions, soft dislike swaps, serving rescale) whose output is **re-validated by the P1-2 allergen matcher — AI output is never trusted for safety**; surviving terms are reported and the adapted variant is unusable (fail closed). The AI's calorie estimate is cross-checked against the ingredient price/macro vocabulary (`lib/recipe-import/macro-check.ts`, >25% disagreement → "estimate uncertain").
- **`save(user, input)`** (premium) — re-runs the matcher server-side on any `adapted` payload (rejects violations regardless of what the client sends), then creates a `source: MANUAL` recipe with `sourceUrl` provenance; image = the page's og:image when a guarded HEAD check confirms it serves an image, else the deterministic name-seeded Pollinations URL. Saved imports are rateable/pinnable, so they flow into P1-1 generation placement unchanged.
- Chat tool `importRecipe(url)` (ChatService.buildTools): premium → preview + auto-save (adapted when safe and changed, else original); free → preview summary + upgrade pointer.
- **Friendly AI-failure mapping (§4.5.2):** both AI calls are wrapped with `lib/ai/friendly-error.ts#toFriendlyAiError` — upstream 429/5xx/timeouts become a `SERVICE_UNAVAILABLE` TRPCError with the "chef is over capacity" copy, other AI failures an `INTERNAL_SERVER_ERROR` with a task-specific sentence; the raw provider error goes to the server log only (the import sheet used to render the raw 429 JSON blob).

### MealPlanService (application layer)

`apps/api/src/application/meal-plan/meal-plan.service.ts`. Methods: `generate`, `getActive`, `getForWeek`, `getRecipe`, `swapRecipe`, `replaceRecipe`, `list`, `restore`, `getById` — the plan→DTO join lives once in the private `assemblePlanDto` and week lookups use the indexed `findByWeekStart` (no more 52-plan scans). Ingredient categorisation is shared: `application/shared/category-map.ts` (word-boundary matching, longest keyword first — "pepperoni" no longer lands in produce via "pepper").

- `generate(userId, weekOffset, premium)` — **tier-branched**:
  - _Premium_ (or ADMIN): reads prefs **+ learning signals (P1-1)**: pinned favourites (`favouriteRecipeRepository.findPinnedForNextPlan`) and the 20 most recent ratings (`mealRatingRepository.findSignalsForUser`) → **recomputes the daily calorie target live** from body metrics + goal via `computeCalorieTarget` (the stored `dailyCalorieTarget` is a display snapshot and may be stale) → calls `IAIService.generateMealPlan` with liked/disliked dish lines in the prompt → **places pinned favourites verbatim** into matching meal slots (type inferred from the recipe's last appearance in the user's recent plans; pins spread across the week; pinned rows are excluded from the upsert so shared curated rows keep their creator/source) → reuses existing images by recipe name (`findRecipeImagesByNames`) → upserts recipes with `imagePriority` (day-distance from today) → archives old plan → creates new `ACTIVE` plan → `recipeImageWorker.wake()` → clears the `useInNextPlan` flags (a pin means "next plan", not "forever"). The response carries `personalisation { pinnedDishNames, likedCount, dislikedCount }` so the UI can show what the generation learned from.
  - _Free_: `generateCurated` — random breakfast/lunch/dinner selection from the **safety-filtered** curated pool (allergies, dietary restrictions, dislikes — P1-2) for each of 7 days (shuffled cycling, no AI calls, preset images). If any meal type keeps fewer than `MIN_SAFE_POOL_SIZE` safe recipes, throws `PRECONDITION_FAILED` — the meal-plan page renders it as the contextual upgrade prompt.
- **Household (F2, premium_plan.md W2-D)** — both tiers load the user's `HouseholdMember` rows (`IHouseholdMemberRepository`, constructor-injected). Premium generation fills `MealPlanInput.householdContext` via `computeHouseholdContext` (portionSum servings, merged safety, per-member dislike notes) and puts the merged allergies/restrictions on the top-level prompt fields; the free curated path, curated swaps and AI swaps run `loadMergedSafety` (union via `mergeHouseholdSafety`, filtering via the unchanged `filterSafeRecipes`) — **safety is never premium**. The pantry context provider (F3) is wired at the marked integration point in `generate` by the wave-2 integrator.
- `swapRecipe(..., premium)` — premium: AI-generated alternative (with name-based image reuse + worker wake); free: random curated recipe of the same meal type from the safety-filtered pool (`PRECONDITION_FAILED` when nothing safe remains). Swap safety uses the household union (F2).
- `list` / `restore` / `getById` — history + restore support.
- Every assembled `WeekPlanDto` carries `estimatedCost` (P2-4): `application/shared/plan-cost.ts` sums per-line EUR estimates from the ingredient price vocabulary across all slots. Premium generation feeds `ChefProfile.weeklyBudgetEur` into the prompt as a hard budget constraint; the meal-plan page shows the week cost on every tier and an over-budget warning when the estimate exceeds the budget.

### TrackerService & ScanService (application layer) — F4 Snap-to-Log

`apps/api/src/application/tracker/tracker.service.ts`. Day log CRUD (`getDay`, `upsertDay`, summaries, weight). F4 additions: `logCustomMeal` (appends a custom entry `{ custom: { name, estimatedBy: 'vision'|'manual' }, … }` to the day, portionMultiplier fixed at 1 — macros arrive pre-edited from the confirm sheet), `deleteCustomMeal` (removes one custom entry by its index in the day's `loggedMeals` array; planned entries are rejected), and the `maybeRebalance` hook: after every log write (`upsertDay` and `logCustomMeal` — cook-mode and chat log through these same paths), users with `photoLogging` access get `rebalanceWeek` run against their active plan. Rebalance failures are swallowed (a log save must never fail because of it); mutations return `{ log, rebalance }` so the client can hand applied swaps to the meal-plan banner.

`apps/api/src/application/tracker/scan.service.ts`. Backs `POST /api/scan-meal`: `assertMealScanQuota` (FORBIDDEN for free, TOO_MANY_REQUESTS at the matrix limit), writes the `SCAN` AiCallLog row up front (quota counts attempts), then `IAIService.analyzeMealPhoto(base64, mime)` → `{ dishName, confidence low|med|high, kcal, protein, carbs, fat, portionNote }` (Gemini multimodal structured output validated by `parseMealPhotoResponse` in `lib/ai/schemas.ts`; deterministic byte-hash scenario table in mock mode — see MealPlanAIService below). Upstream AI failures are mapped by `lib/ai/friendly-error.ts` to a friendly `SERVICE_UNAVAILABLE`/`INTERNAL_SERVER_ERROR` TRPCError (raw error in the server log; scan.router forwards the message as HTTP 503/500). Confirming the estimate is a separate `tracker.logCustomMeal` call — discarded scans never touch the DailyLog.

### Rebalance (application layer) — F4

`apps/api/src/application/meal-plan/rebalance.ts` (the wave-0 seam module — meal-plan.service.ts untouched). `selectRebalanceSwaps` is a pure, fixture-tested greedy selector: project the week (Σ logged kcal Mon…today + Σ planned kcal for days strictly after today) against 7×dailyCalorieTarget; when off by more than ±15%, swap up to 2 FUTURE slots for the curated-pool alternative that most reduces the deviation (safety-filtered pool, no AI call, ≥2%-of-target minimum improvement so re-runs converge to a no-op, stops early once back within tolerance). `rebalanceWeek(userId, planId)` orchestrates: current-week plans only, Sunday no-ops, applies swaps via `mealPlanRepository.updateDayMeal` and returns the previous↔new recipe pairs (+ `planId`) for the client-side undo banner (undo replays `mealPlan.replaceRecipe`; pairs live in localStorage — nothing server-side, wave-0 schema freeze).

### CuratedRecipes (lib)

`apps/api/src/lib/curated-recipes/`. Generic recipe pool for FREE-tier users: the original AI fixtures plus the 42-recipe expansion in `extra-pool.ts` (64 total, ≥3 compliant options per plan meal type for vegan/vegetarian/pescatarian/gluten-free/dairy-free and the major allergens — pinned by `safety.test.ts`), under deterministic `curated-*` IDs (`source: CURATED`, `imageStatus: DONE`; fixture recipes use stock Unsplash images, expansion recipes use deterministic Pollinations URLs warmed on first use). `safety.ts` implements the P1-2 filter: allergen/dislike term-matching over recipe name + ingredients (with synonym expansion, e.g. "nuts" → almond/cashew/coconut/…) and restriction rules that require the dietaryTag AND scan ingredients so mis-tagged recipes fail safe. `ensureCuratedRecipes()` idempotently upserts the pool on first free-tier generation; `safeCuratedPools(prefs)` / `pickRandomCurated(mealType, excludeId?, prefs?)` power filtered generation and swaps.

### IngredientsService (application layer)

`apps/api/src/application/ingredients/ingredients.service.ts`. Methods: `search`,
`list`, `createCustom`, `update`, `delete`, `computeNutrition`, `estimateNutrition`,
`getUnits`.
Powers the create-recipe form and the Ingredients page: catalog search/listing
(global + private custom rows — other users' custom rows are hidden even from
admins), custom-ingredient creation, permissioned edit/delete (owners for custom
rows, admins for global rows; manual edits set `source` USER/ADMIN so the AI
refresher never overwrites them), and server-side nutrition computation (unit
conversion × per-100g macros ÷ servings, with unmatched-name reporting).

### IngredientPriceWorker (worker)

`apps/api/src/workers/ingredient-price.worker.ts`. Builds and maintains the
store-agnostic **ingredient price vocabulary** (`IngredientPrice` table):

- On start and every 12 h sweep: collects distinct ingredient names from all
  recipes in the DB, prices missing entries, and re-estimates entries older
  than 7 days (weekly cadence; single constant to change for monthly).
- Prices AND per-100g macros come from `IAIService.estimateIngredientPrices`
  (Gemini structured output, batches of 40; deterministic hash values in mock
  mode). Rows without macros count as stale so price-only rows self-upgrade.
  User custom ingredients (`creatorId` set) are never AI-refreshed.
- `wake()` — called by ShoppingListService when it serves a list containing
  unpriced ingredients.

`apps/api/src/lib/ingredient-prices/` converts recipe units (g/kg/ml/tbsp/cup/
piece/clove/…) to the base families and computes per-line price estimates.

### WeeklyPlanWorker (worker)

`apps/api/src/workers/weekly-plan.worker.ts` (PW-5). Hourly tick; on Sundays from 08:00 UTC it pre-generates NEXT week's plan for every `planTier = PREMIUM` user with a complete chef profile (admins get access-premium, not subscriber perks). Uses `MealPlanService.generate(userId, 1, true)`, so pinned favourites, rating signals, budget and safety prefs all apply (P1-1/P2-4), and the image worker picks the recipes up as usual. Idempotency comes from the data — a user who already has a plan for next week (`findByWeekStart`) is skipped, so restarts and repeated ticks are safe; per-user failures are logged and don't starve the sweep. Router-level daily generation quotas don't apply to worker calls. The dashboard celebrates the result: `dashboard.summary` returns `weekReady { preparedAt, ratedCount }` when the active plan was created before its week began, and the dashboard shows "Your week is ready — built from N dishes you rated" on Mondays.

### RecipeImageWorker (worker)

`apps/api/src/workers/recipe-image.worker.ts`. Background generator for recipe photos via Pollinations.ai:

- Claims up to **5 PENDING recipes at a time** (atomic per-row claim, horizontal-scale safe) and generates them in parallel, draining the queue until empty; 5 s poll interval is only a discovery fallback.
- `wake()` — called by MealPlanService right after persisting, so generation starts with zero poll delay.
- Queue is ordered by `imagePriority` asc (today's meals first), then `createdAt`.
- Image URLs are deterministic: Pollinations seed + prompt derive from _normalised recipe name + cuisine_ (never the LLM description), so the same dish always maps to the same CDN-cached URL across regenerations. Images render at 512×384.

### PantryService (application layer) — F3 Zero-Waste Kitchen

`apps/api/src/application/pantry/pantry.service.ts`. The user's kitchen inventory over `IPantryItemRepository` (+ `IMealPlanRepository`, both constructor-injected). Methods: `list` (oldest `updatedAt` first — the use-first order), `seedFromPurchases` (called by ShoppingListService on check-off: upserts PURCHASE rows, normalized names, **staples denylist** in `application/pantry/staples.ts` — salt/pepper/oil/vinegar/water/sugar/dried-spice families are never tracked), `addManual` (premium; rejects staples), `removeItem`, `markOutOfStock` (the list's one-tap re-add: deletes every row for the ingredient), `confirmWeekly` (v1 depletion: tapped ids deleted, kept rows older than 7 days decay to the "some" state — quantity 0 — with `updatedAt` preserved), `whatCanIMake` (chat tool: ranks active-plan + curated recipes by pantry coverage via the pure `application/pantry/pantry-match.ts`; free tier gets a teaser), and `computeWeekPantrySavings(userId, weekStart)` (Σ estimated EUR of pantry-covered plan lines — the coach writes it into `ChefReview.savedEur` at review time).

**Pantry generation seam** — `apps/api/src/application/pantry/pantry-context.ts` (the provider the household-owned meal-plan loader calls, premium_plan.md §5): `getUseFirstIngredients(userId, limit=5)` returns the top-N OLDEST pantry items in the `MealPlanInput.useFirstIngredients` shape with human `reason` strings; `computeUsedPantryItemsForUser(userId, days)` computes the response `personalisation.usedPantryItems`. `application/pantry/leftovers.ts#pairLeftovers` is the pure "cook once, eat twice" post-processor (pairs 2–3 dinner→next-day-lunch slots, doubled servings, `leftoverOf` labels on the MealSlot Json — no schema change).

### FeedbackService (application layer)

`apps/api/src/application/feedback/feedback.service.ts`. Beta feedback channel (ux-fixes-plan.md 1.6) over `IFeedbackRepository` (constructor-injected). One method: `submit(userId, message, path?)` — trims, rejects empty, caps at 2000 chars and stores the row. Write-only from the app; read via Prisma Studio/psql.

### ShoppingListService (application layer)

`apps/api/src/application/shopping-list/shopping-list.service.ts`. Methods: `getForWeek`, `toggleItems`, `addCustomItems`, `removeCustomItem`, `regenerate`, `searchStores`. `getForWeek`/`regenerate` take the full `UserProfile` — the F3 pantry subtraction is entitlement-shaped.

- `getForWeek` — serves the persisted AI list for the plan when one exists; otherwise builds the categorised ingredient list (merge key is `name|unit`, so mixed-unit duplicates become separate lines instead of overwriting). Every item gets an `imageUrl` (resolveIngredientImage) and an `estimatedPriceEur` from the ingredient price vocabulary; the list carries `estimatedTotalEur`. Unpriced ingredients wake the IngredientPriceWorker. **F3 subtraction:** every response carries `pantry { entitled, itemCount, savedEur }`; for `pantryPlanning` accounts, pantry-covered derived/AI items get `pantryCovered: true` ("Have it" chip), leave `estimatedTotalEur`, and `savedEur` = Σ their estimated prices ("saved ~€X this week"); free accounts keep untouched numbers and get the ghost figures only (§6.4). Custom items are never subtracted.
- `toggleItems(checked: true)` also **seeds the pantry** (F3): the checked items' name/qty/unit are upserted as PURCHASE rows via `PantryService.seedFromPurchases` after the check-off transaction commits (a pantry failure never breaks the check-off; unchecking removes nothing).
- `addCustomItems` / `removeCustomItem` — user-added items (the page's add-input and the chat's `addToShoppingList` tool) stored in the `customItems` overlay column, so they never shadow the derived list and survive an AI regenerate. Same-name+unit re-add replaces; removal also clears the item's check-off key. Both use the SERIALIZABLE+retry pattern (JSON read-modify-write hazard).
- `regenerate` (premium) — calls the AI to consolidate ingredients and **persists** the result in the `ShoppingList` table (keyed by planId) so it survives reloads. `customItems` and their keys are untouched.
- `searchStores` — delegates to `IGroceryAIService.searchNearbyStores`, passes user's delivery address and currency from ChefProfile. **Dormant**: the store-compare UI was removed from the shopping-list page (store prices come back with per-store price books); the procedure and the grocery-ai/carrefour libs remain for that phase.

### IngredientImageResolver (lib)

`apps/api/src/lib/ingredient-images/index.ts`. Single export: `resolveIngredientImage(name: string): Promise<string>`.

Resolution order:

1. **DB cache** — `IngredientImage` table lookup (instant, zero network cost after first resolution).
2. **Unsplash Search API** — `GET /search/photos?query={name}+food+ingredient` (only if `UNSPLASH_ACCESS_KEY` is set).
3. **Generated fallback** — deterministic per-ingredient Pollinations product shot (keyless; replaced the old shared category images, prod-followups #6).

The cache persists whatever resolved first, so bad first resolutions stick. The 2026-08-23 catalog audit ([`docs/ingredient-catalog-audit.md`](./docs/ingredient-catalog-audit.md)) found ~90 mismatched rows (wrong Unsplash top hits + dev's legacy shared fallbacks) and repaired them with the one-time `scripts/fix-ingredient-images.ts` (emits idempotent SQL that overwrites flagged names with the generated product shot — overwrite, not delete, because a present Unsplash key would re-fetch the same wrong hit). Macros were audited in the same pass: healthy, no corrections needed.

The Unsplash API is called at most once per unique ingredient name ever seen. All results are persisted in `ingredient_images`.

### RecipeService (application layer)

`apps/api/src/application/recipe/recipe.service.ts`. Methods: `list`, `isSaved`, `toggleFavourite`, `toggleUseInNextPlan`, `rate`, `getMyRating`.

- `rate` — upserts a `MealRating` row (1–5 stars + optional notes).
- `getMyRating` — fetches the user's rating for a given recipe.

### DashboardService (application layer)

`apps/api/src/application/dashboard/dashboard.service.ts`. Method: `summary`.
Aggregates active meal plan, today's meals, recent favourites for the dashboard page.

### MealPlanAIService (lib layer)

`apps/api/src/lib/ai/`. Implements `IAIService` — the contract used by `MealPlanService` for all LLM calls.

| File                | Purpose                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`          | `IAIService` interface + all shared types (`MealPlanInput`, `WeekPlanResponse`, …)                                                                                                                                                                                                                                                                                            |
| `mock.ts`           | `MockAIService` — deterministic fixture data, used when `AI_MOCK_ENABLED=true`. **Scenario-steerable** (premium_plan.md §4.5) — see the steering table below                                                                                                                                                                                                                  |
| `friendly-error.ts` | `toFriendlyAiError` — maps upstream AI failures (429/5xx/timeouts) to friendly TRPCErrors; used by the recipe-import + scan services (raw error stays in the server log)                                                                                                                                                                                                      |
| `gemini.ts`         | `GeminiAIService` — live implementation using `gemini-2.5-flash` (`gemini-2.5-flash-lite` for shopping-list consolidation) via `@google/genai`. Uses structured output (`responseSchema`) to guarantee valid JSON. Validates response with the shared Zod schemas.                                                                                                            |
| `openai.ts`         | `OpenAICompatibleAIService` — generic client for any OpenAI-compatible `/chat/completions` endpoint (`AI_SECONDARY_BASE_URL`/`AI_SECONDARY_MODEL`/`AI_SECONDARY_API_KEY`; default Groq free tier, `openai/gpt-oss-120b`). JSON mode + shape instruction, same Zod gates, same shared prompts. **No vision** — photo calls throw.                                              |
| `failover.ts`       | `FailoverAIService` (§5.5 W3-A) — composes Gemini (primary) with the secondary: capacity/quota errors (`isCapacityAiError`) fail over; cheap high-volume calls (chat, ingredient prices, shopping list) go **secondary-first** to conserve Gemini's 20 req/day; **vision (meal-photo scan, photo import) is Gemini-only, no failover**. Logs which provider served each call. |
| `schemas.ts`        | Shared Zod validators for all live-provider responses (+ `parseMealPhotoResponse`) — both clients parse through the same gates                                                                                                                                                                                                                                                |
| `chat-tools.ts`     | Shared chat tool definitions (neutral JSON-Schema subset, converted per provider) + `dispatchChatTool` + the word-chunk `streamText` helper                                                                                                                                                                                                                                   |
| `prompts.ts`        | System prompts + user prompt builders for meal plan generation, recipe swap, chat — shared by BOTH live providers                                                                                                                                                                                                                                                             |
| `index.ts`          | Factory — selects provider via `AI_MOCK_ENABLED` + `AI_PROVIDER`; wraps Gemini in `FailoverAIService` when `AI_SECONDARY_API_KEY` is set (unset = failover stays dark)                                                                                                                                                                                                        |
| `fixtures/`         | Hardcoded week plan + swap recipes used by `MockAIService`                                                                                                                                                                                                                                                                                                                    |

**Switching providers:** `AI_PROVIDER=gemini` (primary; + `GEMINI_API_KEY`) optionally gains the secondary failover via `AI_SECONDARY_API_KEY`; `AI_PROVIDER=openai` runs the OpenAI-compatible client standalone (smoke-testing the secondary — vision calls fail). No other code changes required.

**Mock steering conventions (premium_plan.md §4.5):** with no steering keyword every method returns its frozen default (byte-identical to wave 1), so existing tests and dev flows never change; keywords only ADD reachable scenarios so every AI branch can be driven without live Gemini calls (the shared key is free-tier, 20 requests/day):

| Method             | Steering                                                                                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extractRecipe`    | Keyed off the source url/text (case-insensitive): `satay`/`peanut` → allergen-bearing chicken-satay fixture; `unsafe` → the satay fixture with the `UNSAFE` magic name; `beef` → beef-steak fixture; `no-recipe` → `NO_RECIPE_FOUND` sentinel; else the default pasta (photo sources too)    |
| `cheferizeRecipe`  | Real deterministic adapter: substitution map + serving rescale + accurate `changes[]`, swapped terms also removed from the dish name. A recipe whose ORIGINAL name contains `UNSAFE` skips the swaps — the P1-2 matcher then fails the adaptation closed (drivable from the import UI)       |
| `analyzeMealPhoto` | Scenario table indexed by `imageBase64.length % 5` (base64 lengths are multiples of 4, so padding a file by 3 raw bytes shifts the residue by −1). Index 0 = the wave-1 default (520 kcal, med); index 4 = the ~2310 kcal feast that trips the ±15% rebalance threshold; covers low/med/high |
| `generateMealPlan` | Honors the wave-0 seam fields minimally (wave-2 agents develop against this): `householdContext.portionSum` rescales every recipe's servings + ingredient quantities; `useFirstIngredients` are injected into successive dinners. Without seam fields: the untouched `WEEK_PLAN_FIXTURE`     |

### GroceryAIService (lib layer)

`apps/api/src/lib/grocery-ai/`. Implements `IGroceryAIService` interface.

| File                                 | Purpose                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `types.ts`                           | `IGroceryAIService`, `GrocerySearchInput`, `GroceryStore`, `GroceryItem` |
| `mock.ts`                            | `MockGroceryAIService` — deterministic fixture data, ~300ms delay        |
| `claude.ts`                          | `ClaudeGroceryAIService` stub — real Anthropic API call (not yet wired)  |
| `index.ts`                           | Factory — returns mock when `GROCERY_AI_MOCK_ENABLED=true`               |
| `fixtures/grocery-stores.fixture.ts` | Static Lidl / Carrefour / Kaufland item data                             |

### PrismaUserRepository (infrastructure layer)

Implements `IUserRepository` from `@chefer/database`. Lives in `apps/api/src/infrastructure/prisma/`.

---

## 8. tRPC Procedure Map

All procedures live under the `/trpc` HTTP endpoint and are batched automatically.

| Procedure                       | Access    | Type     | Input                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user.me`                       | Protected | Query    | —                                                                                                                                                                                                                                                                                                                              |
| `user.getById`                  | Protected | Query    | `{ id: cuid }`                                                                                                                                                                                                                                                                                                                 |
| `user.list`                     | Admin     | Query    | `{ page, limit, search?, role?, sortBy, sortOrder }`                                                                                                                                                                                                                                                                           |
| `user.create`                   | Admin     | Mutation | `{ email, name?, password, role? }`                                                                                                                                                                                                                                                                                            |
| `user.update`                   | Protected | Mutation | `{ id, name?, email?, role?, image? }`                                                                                                                                                                                                                                                                                         |
| `user.delete`                   | Admin     | Mutation | `{ id: cuid }`                                                                                                                                                                                                                                                                                                                 |
| `user.updateProfile`            | Protected | Mutation | `{ name?, image? }`                                                                                                                                                                                                                                                                                                            |
| `user.upgradePlan`              | Protected | Mutation | — soft-paywall upgrade (PW-2): sets `planTier = PREMIUM`; free during the beta, Stripe (P2-1) later replaces only how the flag is set                                                                                                                                                                                          |
| `user.downgradePlan`            | Protected | Mutation | — self-service return to FREE (PW-2)                                                                                                                                                                                                                                                                                           |
| `user.setPlanTier`              | Admin     | Mutation | `{ userId, planTier }` — tier management behind `/admin/users` (PW-2)                                                                                                                                                                                                                                                          |
| `user.aiCallsToday`             | Admin     | Query    | `{ userIds[] }` — today's AI call counts per user for the admin page                                                                                                                                                                                                                                                           |
| `auth.register`                 | Public    | Mutation | `{ email, password, firstName, lastName }`                                                                                                                                                                                                                                                                                     |
| `auth.login`                    | Public    | Mutation | `{ email, password }`                                                                                                                                                                                                                                                                                                          |
| `auth.logout`                   | Public    | Mutation | —                                                                                                                                                                                                                                                                                                                              |
| `auth.requestPasswordReset`     | Public    | Mutation | `{ email }` — enumeration-safe (always succeeds); rate-limited per IP (5/15 min) and per address (3/h)                                                                                                                                                                                                                         |
| `auth.resetPassword`            | Public    | Mutation | `{ token, password }` — single-use 1 h token (sha256-stored); invalidates all sessions                                                                                                                                                                                                                                         |
| `auth.me`                       | Protected | Query    | —                                                                                                                                                                                                                                                                                                                              |
| `preferences.hasProfile`        | Protected | Query    | —                                                                                                                                                                                                                                                                                                                              |
| `preferences.get`               | Protected | Query    | —                                                                                                                                                                                                                                                                                                                              |
| `preferences.setup`             | Premium   | Mutation | `{ goal, biologicalSex, age, heightCm, weightKg, activityLevel, cuisinePreferences, dietaryRestrictions, allergies, dislikedIngredients, mealsPerDay, servingSize }`                                                                                                                                                           |
| `preferences.updateSafety`      | Protected | Mutation | `{ dietaryRestrictions, allergies, dislikedIngredients }` — free for every account (P1-2); filters free curated plans and feeds premium AI generation                                                                                                                                                                          |
| `preferences.updateTargets`     | Premium   | Mutation | Setup fields minus the safety arrays, all optional + `deliveryAddress?`, `deliveryCurrency?`, `preferredUnits?` (METRIC/IMPERIAL display units)                                                                                                                                                                                |
| `mealPlan.generate`             | Protected | Mutation | `{ weekOffset?: number }` — 0=current week (default), 1=next week; min 0, max 52. Premium: AI plan learning from pins+ratings, response carries `personalisation` (P1-1); free: safety-filtered curated pool                                                                                                                   |
| `mealPlan.getActive`            | Protected | Query    | —                                                                                                                                                                                                                                                                                                                              |
| `mealPlan.getRecipe`            | Protected | Query    | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                         |
| `mealPlan.swapRecipe`           | Protected | Mutation | `{ planId, dayOfWeek, mealType, currentRecipeId }`                                                                                                                                                                                                                                                                             |
| `mealPlan.list`                 | Protected | Query    | `{ limit?, offset? }`                                                                                                                                                                                                                                                                                                          |
| `mealPlan.restore`              | Protected | Mutation | `{ planId: string }`                                                                                                                                                                                                                                                                                                           |
| `mealPlan.getById`              | Protected | Query    | `{ planId: string }`                                                                                                                                                                                                                                                                                                           |
| `recipe.aiImageUrl`             | Protected | Query    | `{ name, cuisineType }` — deterministic Pollinations image URL for the create-recipe form                                                                                                                                                                                                                                      |
| `ingredients.search`            | Protected | Query    | `{ query }` — catalog search (global vocabulary + own custom ingredients)                                                                                                                                                                                                                                                      |
| `ingredients.units`             | Protected | Query    | — canonical unit list for recipe forms                                                                                                                                                                                                                                                                                         |
| `ingredients.createCustom`      | Protected | Mutation | `{ name, imageUrl?, generateAiImage?, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g?, gramsPerPiece? }`                                                                                                                                                                                              |
| `ingredients.list`              | Protected | Query    | `{ search?, mineOnly?, limit?, offset? }` — full-detail catalog rows with per-row `canEdit`                                                                                                                                                                                                                                    |
| `ingredients.update`            | Protected | Mutation | Macros/image/prices — own custom rows; global rows only when ADMIN (`source: 'ADMIN'`, exempt from AI refresh)                                                                                                                                                                                                                 |
| `ingredients.delete`            | Protected | Mutation | `{ name }` — own custom rows; admins may delete global rows                                                                                                                                                                                                                                                                    |
| `ingredients.computeNutrition`  | Protected | Query    | `{ ingredients[], servings }` — per-serving NutritionInfo + unmatched ingredient names                                                                                                                                                                                                                                         |
| `ingredients.estimateNutrition` | Protected | Mutation | `{ name }` — per-100g macros + gramsPerPiece + baseline prices for one ingredient; catalog rows answer free, unknown names cost one AI call (logged `INGREDIENT_PRICES`)                                                                                                                                                       |
| `recipe.list`                   | Protected | Query    | `{ search?, savedOnly?, myRecipesOnly?, cursor?, limit? }` — rows carry `isFavourite` for the heart toggle                                                                                                                                                                                                                     |
| `recipe.isSaved`                | Protected | Query    | `{ recipeId }` — returns `{ isSaved, useInNextPlan }` (pin state powers the recipe-page toggle, P1-1)                                                                                                                                                                                                                          |
| `recipe.toggleFavourite`        | Protected | Mutation | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                         |
| `recipe.toggleUseInNextPlan`    | Protected | Mutation | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                         |
| `recipe.rate`                   | Protected | Mutation | `{ recipeId: string, rating: 1-5, notes?: string }`                                                                                                                                                                                                                                                                            |
| `recipe.getMyRating`            | Protected | Query    | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                         |
| `recipe.importPreview`          | Protected | Mutation | `{ url? \| text? \| imageBase64?+mimeType? }` (exactly one) — F5 extract + Cheferize preview; metered `recipeImportsPerDay` (FREE 1/day ghost preview); returns `{ via, original, adapted, changes, safety, macroCheck, sourceUrl, ogImageUrl }`                                                                               |
| `recipe.importSave`             | Premium   | Mutation | `{ recipe, variant: original\|adapted, sourceUrl?, ogImageUrl? }` — saves as `source: MANUAL` + `sourceUrl`; adapted variant re-validated by the P1-2 matcher (fail closed); og:image HEAD-checked else Pollinations                                                                                                           |
| `shoppingList.getForWeek`       | Protected | Query    | `{ weekOffset?: number }` — items include `estimatedPriceEur` + list-level `estimatedTotalEur`; serves the persisted AI list when one exists; response carries `checkedKeys` (P1-5) + `pantry { entitled, itemCount, savedEur }` and per-item `pantryCovered` (F3 — covered items leave the total for pantryPlanning accounts) |
| `shoppingList.toggleItems`      | Protected | Mutation | `{ planId, keys[], checked }` — synced check-off (P1-5): per-key add/remove under a SERIALIZABLE transaction with retry, so rapid/concurrent toggles merge instead of clobbering. `checked: true` also seeds the pantry from the checked items (F3, staples excluded)                                                          |
| `pantry.list`                   | Protected | Query    | — all PantryItems oldest-first (`quantity: null` in the DTO = the "some" state); free tier reads it for the read-only page (F3)                                                                                                                                                                                                |
| `pantry.addItem`                | Premium   | Mutation | `{ name, quantity?, unit }` — manual MANUAL row; staples rejected (F3)                                                                                                                                                                                                                                                         |
| `pantry.removeItem`             | Premium   | Mutation | `{ id }` — deletes one row (F3)                                                                                                                                                                                                                                                                                                |
| `pantry.markOutOfStock`         | Premium   | Mutation | `{ ingredientName }` — "I'm out of it": clears every row for the ingredient; the shopping list's one-tap re-add (F3)                                                                                                                                                                                                           |
| `pantry.confirmWeekly`          | Premium   | Mutation | `{ clearIds[] }` — weekly "still have these?": tapped rows deleted, kept rows older than 7 days decay to "some" (F3)                                                                                                                                                                                                           |
| `shoppingList.addCustomItems`   | Protected | Mutation | `{ planId, items: [{ name, quantity?, unit? }] }` — user-added items into the customItems overlay (also written by the chat `addToShoppingList` tool)                                                                                                                                                                          |
| `shoppingList.removeCustomItem` | Protected | Mutation | `{ planId, key }` — removes one user-added item and its check-off state                                                                                                                                                                                                                                                        |
| `shoppingList.regenerate`       | Premium   | Mutation | `{ weekOffset?: number }` — AI-consolidates the list and persists it (ShoppingList table); customItems survive                                                                                                                                                                                                                 |
| `shoppingList.searchStores`     | Protected | Query    | `{ weekOffset?: number }`                                                                                                                                                                                                                                                                                                      |
| `dashboard.summary`             | Protected | Query    | —                                                                                                                                                                                                                                                                                                                              |
| `household.list`                | Protected | Query    | — all of the user's household members (F2); protected, not premium: members persist after a downgrade and keep filtering plans                                                                                                                                                                                                 |
| `household.add`                 | Premium   | Mutation | `{ name, portionFactor?, isKid?, allergies?, dietaryRestrictions?, dislikedIngredients? }` — capped by `PLAN_FEATURES.householdMembers` (5)                                                                                                                                                                                    |
| `household.update`              | Premium   | Mutation | Same fields, all optional + `{ id: cuid }` — ownership-scoped                                                                                                                                                                                                                                                                  |
| `household.remove`              | Protected | Mutation | `{ id: cuid }` — protected so a downgraded user can still remove members                                                                                                                                                                                                                                                       |
| `coach.currentReview`           | Protected | Query    | — latest weekly chef review while fresh (≤14 days), shaped by entitlement (F1): `full` for adaptiveCoaching, `teaser` (first line only) for free, `none` + eligibility counts otherwise                                                                                                                                        |
| `tracker.getDay`                | Protected | Query    | `{ date: YYYY-MM-DD }` — planned meals + the day's log (incl. custom entries) + resolved targets                                                                                                                                                                                                                               |
| `tracker.upsertDay`             | Protected | Mutation | `{ date, loggedMeals[] }` — entries are `recipeId` XOR `custom { name, estimatedBy }`; REPLACES the day's list; returns `{ log, rebalance }` (F4 — rebalance non-null only when future meals were swapped)                                                                                                                     |
| `tracker.logCustomMeal`         | Protected | Mutation | `{ date, name, estimatedBy: vision\|manual, mealType, kcal, protein?, carbs?, fat? }` — appends one custom entry (F4; manual quick-adds are free); returns `{ log, rebalance }`                                                                                                                                                |
| `tracker.deleteCustomMeal`      | Protected | Mutation | `{ date, entryIndex }` — removes one custom entry by its index in the day's `loggedMeals` (F4)                                                                                                                                                                                                                                 |
| `tracker.weeklySummary`         | Protected | Query    | — trailing 7 days of totals                                                                                                                                                                                                                                                                                                    |
| `tracker.monthlySummary`        | Protected | Query    | — trailing 28 days of totals                                                                                                                                                                                                                                                                                                   |
| `tracker.logWeight`             | Protected | Mutation | `{ weightKg, date? }`                                                                                                                                                                                                                                                                                                          |
| `tracker.weightHistory`         | Protected | Query    | `{ days? }` (default 90)                                                                                                                                                                                                                                                                                                       |
| `feedback.submit`               | Protected | Mutation | `{ message: 1-2000 chars, path? }` — beta feedback channel; stores a Feedback row (ux-fixes-plan.md 1.6)                                                                                                                                                                                                                       |

### Middleware Stack

```
publicProcedure     → timingMiddleware
protectedProcedure  → timingMiddleware → isAuthenticated
premiumProcedure    → timingMiddleware → isPremium   (PREMIUM tier or ADMIN role)
adminProcedure      → timingMiddleware → isAuthenticated → isAdmin
```

---

## 9. Authentication & Authorization

**Current state:** Session-based authentication via an HTTP cookie (`chefer_session`).

The `createContext` function in `apps/api/src/interfaces/http/middleware/auth.middleware.ts`:

1. Reads the session cookie or `Authorization: Bearer <token>` header
2. Hydrates `ctx.user` (null if unauthenticated)

**Web-side session gating** — the cookie is opaque, so its presence never implies a
live session (the row may have been deleted or expired):

| Layer                                            | Check                        | Rationale                                                                     |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/middleware.ts`                     | Cookie **presence** only     | Cheap edge gate on protected routes; deliberately does not call the API       |
| `getSessionUser()` (`features/auth/lib/session`) | Validates via `auth.me`      | Used by `/`, `/login`, `/register` before redirecting an "authenticated" user |
| `makeQueryClient()` (`lib/trpc.ts`)              | Redirects to `/login` on 401 | Catches sessions the edge gate let through; covers both queries and mutations |

Server components that branch on "is the user signed in" must call `getSessionUser()`,
never `cookies().get('chefer_session')` — a presence check bounces a user holding a dead
cookie from `/login` to `/dashboard`, where every query 401s and the sign-out control is
hidden, leaving no way back to the login form.

**Roles:**

| Role        | Capabilities                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `USER`      | Read public resources, update own profile, manage own custom ingredients                                         |
| `MODERATOR` | USER + moderation capabilities (reserved)                                                                        |
| `ADMIN`     | Full access — list/create/delete any user; edit/delete **global** ingredients (others' custom rows stay private) |

**Plan tiers** (orthogonal to roles, enforced by `premiumProcedure` / service branching):

| Tier      | Capabilities                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `FREE`    | Curated generic meal plans + swaps (random from pool); profile personalisation locked behind upgrade CTA |
| `PREMIUM` | AI-personalised plans and swaps, full preferences/onboarding. ADMIN role counts as premium               |

**Notes:**

- The database schema is **NextAuth.js compatible** (Account, Session, VerificationToken models exist)
- Password hashing in the seed uses SHA-256 — replace with **bcrypt or argon2** before production
- JWT infrastructure (secret + refresh secret) is wired in env but full JWT flow is not yet implemented

---

## 10. Environment Variables

### `apps/api/.env`

| Variable                   | Required | Default                        | Description                                                                                                                                                              |
| -------------------------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                 | No       | development                    | Runtime environment                                                                                                                                                      |
| `PORT`                     | No       | 3001                           | HTTP listen port                                                                                                                                                         |
| `HOST`                     | No       | 0.0.0.0                        | HTTP listen host                                                                                                                                                         |
| `DATABASE_URL`             | **Yes**  | —                              | PostgreSQL connection string                                                                                                                                             |
| `JWT_SECRET`               | **Yes**  | —                              | Min 32 chars                                                                                                                                                             |
| `JWT_EXPIRES_IN`           | No       | 15m                            | Access token TTL                                                                                                                                                         |
| `REFRESH_TOKEN_SECRET`     | **Yes**  | —                              | Min 32 chars                                                                                                                                                             |
| `REFRESH_TOKEN_EXPIRES_IN` | No       | 30d                            | Refresh token TTL                                                                                                                                                        |
| `CORS_ORIGINS`             | No       | http://localhost:3000          | Comma-separated allowed origins                                                                                                                                          |
| `REDIS_URL`                | No       | —                              | Redis connection string                                                                                                                                                  |
| `RATE_LIMIT_MAX`           | No       | 100                            | Max requests per window                                                                                                                                                  |
| `RATE_LIMIT_WINDOW_MS`     | No       | 60000                          | Rate limit window (ms)                                                                                                                                                   |
| `AI_MOCK_ENABLED`          | No       | true                           | `true` = fixture data; `false` = real AI provider                                                                                                                        |
| `AI_PROVIDER`              | No       | gemini                         | Active provider: `gemini` (primary, optional failover) \| `openai` (OpenAI-compatible client standalone)                                                                 |
| `GEMINI_API_KEY`           | No       | —                              | Required when `AI_PROVIDER=gemini` + mock disabled                                                                                                                       |
| `AI_SECONDARY_API_KEY`     | No       | —                              | Enables the OpenAI-compatible failover secondary (§5.5 W3-A) when set with `AI_PROVIDER=gemini`; required for `AI_PROVIDER=openai`. Unset = Gemini alone (failover dark) |
| `AI_SECONDARY_BASE_URL`    | No       | https://api.groq.com/openai/v1 | OpenAI-compatible endpoint of the secondary (no trailing slash)                                                                                                          |
| `AI_SECONDARY_MODEL`       | No       | openai/gpt-oss-120b            | Model id at the secondary endpoint. The default has **no vision** — photo calls stay Gemini-only                                                                         |
| `GROCERY_AI_MOCK_ENABLED`  | No       | true                           | Use fixture grocery store data (no Claude call)                                                                                                                          |
| `UNSPLASH_ACCESS_KEY`      | No       | —                              | Unsplash API key for ingredient images; falls back to category images without it. Get a free key at https://unsplash.com/developers                                      |
| `EMAIL_MOCK_ENABLED`       | No       | true                           | Mock logs emails (incl. reset links) to the console instead of sending                                                                                                   |
| `RESEND_API_KEY`           | No       | —                              | Required when `EMAIL_MOCK_ENABLED=false`                                                                                                                                 |
| `EMAIL_FROM`               | No       | Chefer <onboarding@resend.dev> | Sender address; shared Resend sender only delivers to the account owner — use a verified domain for real users                                                           |
| `APP_URL`                  | No       | http://localhost:3000          | Base URL used in emailed links (password reset)                                                                                                                          |

### `apps/web/.env.local`

| Variable                  | Required | Default                    | Description                                                                                    |
| ------------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`     | No       | http://localhost:3000      | Public app base URL                                                                            |
| `NEXT_PUBLIC_APP_NAME`    | No       | Chefer                     | App display name                                                                               |
| `NEXT_PUBLIC_API_URL`     | No       | http://localhost:3001      | API server URL                                                                                 |
| `NEXT_PUBLIC_TRPC_URL`    | No       | http://localhost:3001/trpc | tRPC endpoint URL                                                                              |
| `NEXTAUTH_URL`            | No       | —                          | NextAuth callback base URL                                                                     |
| `NEXTAUTH_SECRET`         | No       | —                          | Min 32 chars                                                                                   |
| `NEXT_PUBLIC_POSTHOG_DEV` | No       | —                          | Set `1` to send PostHog events from dev (normally production-only; see `src/lib/analytics.ts`) |

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

**`Dockerfile.api`** — runs the API via **`tsx`** (the monorepo resolves `@chefer/*` as
source, so there is no project-wide `tsc` emit; the container transpiles TS on load exactly
like `pnpm dev`). Stages: `deps` (install incl. tsx) → `runner` (source + Prisma client with
the `linux-musl-arm64` engine for ARM VMs, non-root `apiuser`, dumb-init, health check).

**`Dockerfile.web`** — 3-stage `next build` (standalone). Includes the `@chefer/api` +
`@chefer/database` workspace deps (needed for end-to-end tRPC types) and runs `prisma generate`.

### Production deployment (self-hosted, ~$0)

Deployed as containers on a single always-on VM (Oracle Always Free ARM), single origin behind
Caddy. See **`docs/plan-deployment.md`** for the full plan. Key files:

- `docker-compose.deploy.yml` (repo root) — `postgres` + `api` + `web` + `caddy` (no Redis/nginx),
  persistent `pgdata`/`uploads` volumes.
- `infrastructure/docker/Caddyfile` — TLS + single-origin path routing (`/trpc`, `/api/uploads/*`,
  `/api/recipe-images/*`, `/api/chat`, `/api/health`, `/uploads/*` → API; rest → web).
- `.env.production.example` — deploy env template.
- `infrastructure/scripts/{deploy,restore-dump,backup-db,duckdns-update}.sh`.

Ingress is single-origin, so there is no CORS or cross-subdomain cookie. SSR calls the API on the
internal Docker network via `API_INTERNAL_URL`. The app forces dynamic rendering
(`app/layout.tsx`) and the prod build sets `typescript.ignoreBuildErrors` (pre-existing
cross-package type debt; `pnpm typecheck` still enforces it).

### Backups & disaster recovery (A11)

Nightly `pg_dump` of the production database, installed in the `ubuntu` user's crontab on the VM
(2026-08-22):

```
0 3 * * * /home/ubuntu/chefer/infrastructure/scripts/backup-db.sh >> /home/ubuntu/chefer-backup.log 2>&1
```

`backup-db.sh` writes a custom-format dump to `~/chefer-backups/chefer-<timestamp>.dump` and keeps
the **14 most recent** (≈2 weeks). Restore procedure: `restore-dump.sh <dumpfile>` (pg_restore
`--clean --if-exists` into the live DB), or restore into a scratch DB first to inspect.

**Restore rehearsal 2026-08-22:** a fresh backup (144 KB) was restored into a scratch database
(`chefer_restore_test`) on the VM; all row counts matched live (users 6, meal_plans 18, recipes
298, daily_logs 6, shopping_lists 4) and seed accounts were present. Restore time: ~1 s at
current size.

- **RPO: 24 h** — nightly at 03:00 UTC; anything written since the last dump is lost.
- **RTO: ~5 min** if the VM survives (drop/recreate DB + `restore-dump.sh` + container restart);
  **~1–2 h** if the VM is lost (new VM, Docker + repo + `.env.production` re-setup, DNS move,
  then restore) — bounded by VM provisioning, not by the restore itself.
- **Off-VM copy (closed 2026-08-22):** dumps used to live only on the VM disk — a disk failure
  would have lost the DB and every backup together. `infrastructure/scripts/pull-backups.sh` now
  mirrors `~/chefer-backups` from the VM to the dev Mac (`~/chefer-backups-mirror`, keeps 30) via
  the keyed `chefer` SSH alias, warns loudly when the newest dump is older than 48 h (a broken
  VM cron), and runs daily at 09:30 via launchd (`~/Library/LaunchAgents/com.chefer.backup-pull.plist`,
  log: `~/chefer-backup-pull.log`; a missed schedule re-runs on wake). The mirrored dump was
  restore-tested on the Mac's local Postgres — the full chain VM dump → mirror → restore is
  proven. The mirror is as fresh as the last day the Mac was on; move to object storage (rclone)
  if that ever becomes too weak.

### Uptime monitoring (A12)

External monitoring via **UptimeRobot** (free tier: 50 monitors, 5-minute interval, email
alerts), on the account belonging to the project owner. Two monitors:

| Monitor      | URL                                     | Type / check                                  | Proves                 |
| ------------ | --------------------------------------- | --------------------------------------------- | ---------------------- |
| `chefer-api` | `https://chefer.duckdns.org/api/health` | Keyword: alert when `"ok":true` is **absent** | Caddy + API + Postgres |
| `chefer-web` | `https://chefer.duckdns.org/`           | HTTP 200                                      | Caddy + Next.js web    |

`/api/health` is served by the **API** (Caddy `@apiBackend` routes it since A12, 2026-08-22): it
runs `SELECT 1` against Postgres and answers `{"ok":true}`, or **503** `{"ok":false}` when the DB
is unreachable. The web app keeps its own `/api/health` liveness route, but it is only reachable
container-locally (Docker healthcheck in `docker-compose.deploy.yml`) — publicly the path always
hits the API. The deploy pipeline's `verify` job polls the same two URLs.

## 13. CI/CD

### `ci.yml` — lint / typecheck / test / build on push & PR to `master`

Jobs: `Lint` (ESLint + prettier check), `Type Check`, `Unit Tests` (vitest, all
workspaces), `Build`, and `E2E Tests` (PRs only — the unauthenticated `public`
Playwright project; the authenticated `mobile`/`desktop` projects need a seeded
fixture dataset, planned with roadmap P0-8). The four job names are polled by
name from `deploy.yml`'s gate — rename them in both files together.

### `deploy.yml` — one-button production deploy, gated on green CI

Triggered by **Actions → Deploy → Run workflow**, `gh workflow run deploy.yml`, or any push to
`master` that touches code (`**.md` and `docs/**` are ignored).

```
setup (resolve tag)
  └─ gate (Wait for CI)                          polls this commit's Lint / Type Check /
        Unit Tests / Build check runs; fails the deploy if any is red;
        skipped on the rollback path (the image was CI'd when first built)
  └─ build (matrix: api + web, in parallel)      GitHub runner, buildx + GHA layer cache
        push → ghcr.io/<owner>/chefer-{api,web}:latest and :sha-<short>
  └─ deploy (ssh to the VM)                      TAG=<tag> ./infrastructure/scripts/deploy.sh
        git pull → docker compose pull → up -d --no-build → prune
  └─ verify                                      polls <DEPLOYMENT_URL>/api/health (API + DB,
        expects {"ok":true}) and the homepage (web, expects 200); fails if either stays unhealthy
```

**Branch protection (manual, repo Settings → Branches → `master`):** require the
`Lint`, `Type Check`, `Unit Tests`, and `Build` status checks. This is the second
half of the gate — the deploy gate stops red code _shipping_; protection stops it
_merging_.

**Why images are built in CI:** the production VM is 1 OCPU / 1 GB, where `next build` takes
15–40 minutes. A runner does it in ~4–6 min cold, ~1–3 min with the layer cache, and the VM only
pulls. `infrastructure/scripts/deploy-local-build.sh` keeps the build-on-VM path as a fallback.

**Rollback:** Run workflow with `tag = sha-<short>` of a previous build (skips the build jobs).

**Required repo configuration**

| Kind     | Name                                          | Value                                          |
| -------- | --------------------------------------------- | ---------------------------------------------- |
| Secret   | `DEPLOY_HOST`                                 | VM public IP                                   |
| Secret   | `DEPLOY_USER`                                 | `ubuntu`                                       |
| Secret   | `DEPLOY_SSH_KEY`                              | private half of a **dedicated** deploy keypair |
| Variable | `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` | `https://chefer.duckdns.org`                   |
| Variable | `NEXT_PUBLIC_APP_NAME`                        | `Chefer`                                       |
| Variable | `DEPLOYMENT_URL`                              | `https://chefer.duckdns.org`                   |

`NEXT_PUBLIC_*` are baked into the web bundle at build time — changing them requires a rebuild
(updating `.env.production` on the VM alone has no effect on the client bundle). Application
secrets never enter CI: `.env.production` lives only on the VM.

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
| alice@chefer.dev | User@123!  | ADMIN     |
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
