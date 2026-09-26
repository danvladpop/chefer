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
   - [@chefer/tokens](#57-chefertokens)
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
│   ├── web/                    # Next.js 15 frontend (port 3000)
│   └── mobile/                 # Expo (React Native) app — iOS + Android
├── packages/
│   ├── database/               # Prisma client, schema, repositories
│   ├── types/                  # Shared TypeScript types & enums
│   ├── utils/                  # Pure utility functions
│   ├── ui/                     # React component library (shadcn-style)
│   ├── ui-mobile/              # React Native component library (NativeWind) for apps/mobile
│   ├── tokens/                 # Zero-dependency design tokens (motion, elevation, radius)
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

| Limit                          | Scope                                                      | Value                                                                                                                                                                | Where                                                               |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Global tRPC flood              | per IP                                                     | `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` (default 100/min)                                                                                                            | `index.ts` (express-rate-limit)                                     |
| `auth.login` / `auth.register` | per IP                                                     | 10 per 15 min                                                                                                                                                        | `auth.router.ts` → `lib/rate-limit.ts` (in-memory sliding window)   |
| Plan generations               | per user per UTC day                                       | from `PLAN_FEATURES` (counted from `ai_call_logs` MEAL_PLAN reservations — both tiers; templates and carry-forward copies don't count); refunded if generation fails | `meal-plan.router.ts` → `reservePlanGeneration`                     |
| AI swaps                       | per premium user per UTC day                               | from `PLAN_FEATURES` (`ai_call_logs` RECIPE_SWAP); refunded if the swap fails                                                                                        | `meal-plan.router.ts`, chat swap tool → `reserveAiSwap`             |
| Chat messages                  | premium only (free → FORBIDDEN)                            | `PLAN_FEATURES.chatMessagesPerDay` (`ai_call_logs` CHAT; attempts count)                                                                                             | `ChatService.chat` → `reserveChatMessage`                           |
| Meal photo scans (F4)          | per premium user per UTC day                               | from `PLAN_FEATURES` (`ai_call_logs` SCAN; attempts count); free tier → FORBIDDEN                                                                                    | `ScanService` → `reserveMealScan`                                   |
| Recipe imports                 | premium only (free → FORBIDDEN)                            | `PLAN_FEATURES.recipeImportsPerDay` (`ai_call_logs` RECIPE_IMPORT); refunded when the preview fails                                                                  | `RecipeImportService.preview` → `reserveRecipeImport`               |
| AI nutrition auto-fill         | premium only (free → FORBIDDEN); catalog matches stay free | `PLAN_FEATURES.aiNutritionEstimatesPerDay` (`ai_call_logs` INGREDIENT_PRICES); refunded on failure                                                                   | `IngredientsService.estimateNutrition` → `reserveNutritionEstimate` |

Daily quotas are **reservations** (`lib/quotas.ts`): count and insert the usage row in one SERIALIZABLE transaction, retried on conflict, so parallel requests can't exceed a limit (audit F-PLAN-2-3, F-TRK-2-2); callers that shouldn't charge a failed attempt call `release()`.

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

| Route                                | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                  | Server Component | Landing page — hero, feature list, tech stack                                                                                                                                                                                                                                                                                                                                                                     |
| `/robots.txt`, `/sitemap.xml`        | Route Handler    | Generated by `app/robots.ts` / `app/sitemap.ts` from `lib/seo/brand.ts` `PUBLIC_ROUTES` + `NEXT_PUBLIC_APP_URL` (audit F-PUB-1-1)                                                                                                                                                                                                                                                                                 |
| `/privacy`, `/terms`, `/support`     | Server Component | Public legal/support pages (no auth — not in `middleware.ts` PROTECTED_ROUTES; listed in `PUBLIC_ROUTES`). `/support` (App Store Connect Support URL): what Chefer is, in-app Send feedback + `SUPPORT_EMAIL` (`@chefer/types`, **TODO(owner)** confirm the address), FAQ (password reset, delete account, AI use, Premium pricing). `/privacy` covers self-serve deletion, AI consent, camera/photos and Contact |
| `/opengraph-image`, `/twitter-image` | Route Handler    | 1200×630 brand share card (`next/og` ImageResponse); `/favicon.ico` redirects to `app/icon.svg`                                                                                                                                                                                                                                                                                                                   |
| `/(auth)/login`                      | Client Component | Login form (react-hook-form + Zod)                                                                                                                                                                                                                                                                                                                                                                                |
| `/(auth)/register`                   | Client Component | Registration form, redirects to `/onboarding`                                                                                                                                                                                                                                                                                                                                                                     |
| `/(auth)/unsubscribe`                | Client Component | Weekly-email unsubscribe from the email link (P2-5): `?token=` → `notifications.unsubscribe` on mount (not server-side, so link scanners don't fire it), Undo re-subscribes; public                                                                                                                                                                                                                               |
| `/(auth)/verify-email`               | Client Component | Email confirmation link (P2-5): `?token=` → `notifications.confirmEmail`; weekly emails need a confirmed address; public                                                                                                                                                                                                                                                                                          |
| `/(dashboard)/dashboard`             | Client Component | **Today** (P2-2): eaten-vs-target ring (NutritionSummary), quick add + scan, next meal with one-tap "I ate this" (`tracker.logRecipe`) that advances past logged meals, later today, "See full day" → `/tracker`, weekly outlook                                                                                                                                                                                  |
| `/(dashboard)/meal-plan`             | Client Component | Week grid at `lg`+, single-day view below; Generate / Regenerate; GenerateOverlay spinner                                                                                                                                                                                                                                                                                                                         |
| `/(dashboard)/recipes`               | Client Component | **Cookbook** (P2-8): All / Saved / My Recipes / Discover (`?tab=`); Discover browses the safety-filtered curated pool (`recipe.discover`) with meal-type and ≤ 30 min filters                                                                                                                                                                                                                                     |
| `/(dashboard)/ingredients`           | Client Component | Ingredient catalog — All/Mine tabs, search, permissioned edit/delete, add custom. Out of the nav since P2-8; reachable by URL                                                                                                                                                                                                                                                                                     |
| `/(dashboard)/recipes/[id]`          | Client Component | Recipe detail — ingredients, instructions, macros, Swap/Save, StarRatingWidget                                                                                                                                                                                                                                                                                                                                    |
| `/(dashboard)/recipes/[id]/cook`     | Client Component | Cook mode (P1-3): full-screen stepper, wake lock, inline timers, servings scaling, ingredients drawer; finish logs to the tracker + opens the rating                                                                                                                                                                                                                                                              |
| `/(dashboard)/admin/users`           | Client Component | Admin tier management (PW-2): search users, flip FREE/PREMIUM, today's AI usage — server-gated by adminProcedure                                                                                                                                                                                                                                                                                                  |
| `/(dashboard)/preferences`           | Client Component | Edit ChefProfile + DietaryPreferences + display units; saves redirect to `/dashboard`. Anchors `#household` (every-tier member editor, P2-3; linked from Profile and the page header) and `#targets` (premium goal section). Delivery address/currency inputs removed 2026-08-22 (schema fields remain; currency UI returns with P2-4). Every-tier Sunday auto-plan + Weekly emails card (P2-5)                   |
| `/(dashboard)/shopping-list`         | Client Component | **Shop** (P2-8): "To buy" / "In my kitchen" segments (`?view=kitchen` renders `PantryPanel`). To buy: week navigator, categorised items with price estimates + est. total; F3 "Have it" chips + savings (premium), ghost banner (free), inline "Still have these?" banner (`PantryCheckBanner`, weekly, items ≥ 3 days old — F-PM-13)                                                                             |
| `/(dashboard)/pantry`                | Server Component | Redirects to `/shopping-list?view=kitchen` (P2-8)                                                                                                                                                                                                                                                                                                                                                                 |
| `/(dashboard)/history`               | Server Component | Redirects to `/my-weeks` (P2-8)                                                                                                                                                                                                                                                                                                                                                                                   |
| `/(dashboard)/my-weeks`              | Client Component | **My weeks** (P2-8): saved weeks (`WeekTemplates`: save this week, follow, rename, delete) on top, past weeks below — past only, one card per week, newest first (`pastWeeks`, F-PLAN-6-3)                                                                                                                                                                                                                        |
| `/(dashboard)/tracker`               | Client Component | Full-day tracker (portions, past days, un-logging, custom entries). Out of the nav since P2-2: reached from Today ("See full day") and lights the Today tab                                                                                                                                                                                                                                                       |
| `/(dashboard)/history/[planId]`      | Client Component | Read-only plan — week grid at `lg`+, single-day view below                                                                                                                                                                                                                                                                                                                                                        |
| `/(dashboard)/onboarding`            | Client Component | Step 0 "What brings you here?" (P2-3, while `onboardingIntent` is null) → households get "Who's at your table?", Train goes to `/gym/setup`; then free Diet → Goal → Metrics or premium Goals → Metrics → Diet → Cuisine & Cadence (no serving size). Steps from `onboardingSteps` (`@chefer/utils`)                                                                                                              |
| `/(dashboard)/premium`               | Client Component | Premium showcase (premium_plan.md §6.2) — feature cards from the registry, matrix-driven Free-vs-Premium table, anchor stack, FAQ; deep-linked with `?source=` preserved into the funnel events                                                                                                                                                                                                                   |
| `/(dashboard)/gym`                   | Client Component | Gym Today (G5-A): resume banner, next up (start / another day / skip), week strip + ring + streak, one offer card, last session, freestyle, sync indicator; no profile → `/gym/setup`                                                                                                                                                                                                                             |
| `/(dashboard)/gym/setup`             | Client Component | Gym setup wizard: days, experience, equipment + units, weekdays + reminder, program preview (engine-computed alternatives, weekly balance) and "I know my weights" → `completeSetup`                                                                                                                                                                                                                              |
| `/(dashboard)/gym/workout`           | Client Component | Active workout: phone = one column of exercise cards; `lg` = navigator + active card. Shared `workoutReducer`, localStorage crash-safety, rest timer, plate calculator, live PRs                                                                                                                                                                                                                                  |
| `/(dashboard)/gym/summary/[id]`      | Client Component | Workout summary: duration, sets, PRs, week ring, "Next time" per exercise with Adjust (`gym.progression.setOverride`)                                                                                                                                                                                                                                                                                             |
| `/(dashboard)/gym/settings`          | Client Component | Gym settings: units, weekly goal, equipment inventory, reminders (stored only; the phone sends them), pause, outbox "needs attention" (Copy / Retry / Discard)                                                                                                                                                                                                                                                    |

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
of truth for routes, through the active **mode** (`navFor(mode)`):

| Component         | Role                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SideBar`         | Desktop rail (`lg`+): the `Food \| Gym` switch on top, then the tab bar's destinations, a divider, and the drawer's (one grouping on every shell) |
| `BottomNav`       | Mobile tab bar — the mode's 4 primary destinations plus a More button (`< lg`)                                                                    |
| `MobileNavDrawer` | Slide-over with the `Food \| Gym` switch, the mode's remaining destinations and the plan/upgrade footer                                           |
| `TopHeader`       | Sticky header; carries a compact `Food \| Gym` switch below `lg`                                                                                  |

**Accessibility conventions (audit P2-7).** Every page renders its content inside
`<main id="main" tabIndex={-1}>` (the dashboard shell, the auth layout, the
landing, legal, 404 and error pages), and the root layout's first element is a
"Skip to content" link targeting it. The `TopHeader` title is a `<p>`, not a
heading: each page owns exactly one `<h1>` (use `sr-only` when the design shows
no visible title). Browser-tab titles come from a small server `layout.tsx` per
dashboard route segment that exports `metadata.title` (rendered through the root
`'%s | Chefer'` template) — dashboard pages are client components and can't
export metadata themselves, and a client `document.title` effect lost to Next's
`<title>` on hard loads (F-X-1-1).

**Food IA (P2-2 / P2-8, PM review §5).** The phone tab bar is **Today · Plan ·
Shop · Cookbook · More**; More holds Progress, My weeks, Profile, Preferences.
Today (`/dashboard`) absorbed the Tracker (`/tracker` lights Today via
`alsoActiveFor`), Shop absorbed the Pantry (`/pantry` redirects to
`/shopping-list?view=kitchen`), My weeks absorbed History (`/history`
redirects; `/history/[planId]` stays), Ingredients left the nav. Routes that
left the nav are listed in `FOOD_EXTRA_ROUTES` so they still render in Food
mode.

**Food / Gym mode (gym_plan.md D3, G5-A).** `FOOD_NAV_ITEMS` (the 8 food
destinations; `NAV_ITEMS` stays as an alias) and `GYM_NAV_ITEMS` (Today `/gym`,
Routine, Exercises, Stats; plus `/gym/settings` in the drawer / sidebar). The mode
is **derived**, never stored in React alone (`deriveMode` in `nav-items.ts`):
`/gym*` is Gym, a food destination is Food, and neutral pages (profile,
preferences, premium, admin, onboarding) keep the `chefer_mode` cookie's mode.
The `(dashboard)` layout reads that cookie server-side and passes it to
`DashboardShell` → `ModeProvider` (`features/nav/mode-context.tsx`), so SSR
renders the right nav with no flash. Visiting a page that belongs to a mode
rewrites the cookie; the `ModeSwitch` writes it and navigates to `/dashboard` or
`/gym` (which sends a profile-less account on to `/gym/setup`). The food
dashboard's "Today's workout" card also switches to Gym.

**Gym offline layer on web** (`features/gym/workout/`): the active
`WorkoutSessionDoc` is written to localStorage on every reducer action
(`chefer.gym.active-session`, memory fallback when storage is blocked) and
resumed on reload; finished/discarded docs go to a localStorage outbox
(`chefer.gym.outbox`, a port of the mobile outbox: removed only on an
`applied`/`stale` ack, `rejected` entries parked for the user, uploads scoped to
the confirmed owner id). `GymSync`, mounted in the shell, flushes it on `online`,
window focus / tab visible and every 30 s, and invalidates `gym.bootstrap` after
an ack; pages fold still-pending workouts back into the bootstrap
(`reconcileWithPending`) so "next up" never rolls back. `/gym*` is in the
middleware's protected routes.

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

### 4.3 Mobile (`apps/mobile`)

Expo (SDK 57) React Native app — one codebase for iOS and Android. EAS project
`@cheferoni/chefer` (bundle id `dev.chefer.app`, dev variant `dev.chefer.app.dev`; `eas.json` profiles:
development→iOS-simulator dev client, development-device, preview, production).
Being built
out per [`mobile_native_plan.md`](./mobile_native_plan.md); currently: auth
(login/register/logout via Bearer session, forgot/reset password), NativeWind theme (web's brand
tokens), a **Food / Gym mode switch** (gym_plan.md D3) between two tab
shells — Food: Today/Plan/Shop/Cookbook/More (mirrors
`apps/web/src/features/nav/nav-items.ts`; P2-2 / P2-8: Today = Home + Tracker
with "I ate this" and "See full day" → `tracker`, Shop has To buy / In my
kitchen segments with the inline "Still have these?" banner, Cookbook has
Discover, More lists AI Chef, Progress, My weeks (saved + past weeks),
Household, Profile, Preferences; the `tracker`, `pantry` and `history`
screens still open by route); Gym: Today/Routine/Exercises/Stats —
and the three-layer test harness (Jest+RNTL unit, Vitest contract vs the live
API, Maestro E2E in `e2e/`).

- **Stack:** expo-router (file-based, deep-link scheme `chefer://`; the dev
  variant uses `chefer-dev://`), expo-dev-client, expo-updates (EAS Update),
  expo-secure-store (session token), tRPC + TanStack Query + superjson at the
  same versions as web
- **Monorepo:** `metro.config.js` watches the workspace root so `@chefer/types`,
  `@chefer/utils`, `@chefer/tokens` and `@chefer/ui-mobile` (raw-TS exports) resolve
  (Jest maps them to source in `jest.config.js`); `@chefer/ui` and
  `@chefer/database` are forbidden by lint (platform boundary)
- **Auth:** `Authorization: Bearer <sessionToken>` + `x-chefer-client: mobile`
  header — see §9. Form rules (email, password length, confirm-password match)
  come from `@chefer/types` `auth.ts`. In `__DEV__` the tRPC `loggerLink`
  logs every request, so `src/lib/trpc-links.ts` `redactSecrets` masks
  `password` / `newPassword` / `currentPassword` / `confirmPassword` / `token`
  (any depth) before anything reaches the console (audit F-M-AUTH-2-2)
- **Scripts:** `start` (Metro; root: `pnpm dev:mobile` — deliberately not part
  of `turbo dev`), `ios` / `android` (dev variant: build + run on
  simulator/emulator/device), `release:ios` / `release:android` (standalone
  production builds installed over USB — §11), `update:prod` (publish an OTA
  update — §11), `bundle:check` (headless Metro export, the fastest full-app
  smoke test), `typecheck`, `lint`
- **App variants** (`APP_VARIANT`, read by `app.config.js`; M4-4):

  | Variant                 | Name       | Bundle id / package  | Scheme       | Runs JS from                                                    |
  | ----------------------- | ---------- | -------------------- | ------------ | --------------------------------------------------------------- |
  | `development` (default) | Chefer Dev | `dev.chefer.app.dev` | `chefer-dev` | Metro on the Mac (:8083) + local API — dev client               |
  | `production`            | Chefer     | `dev.chefer.app`     | `chefer`     | embedded bundle, then EAS Update channel `production`; prod API |

  Distinct ids let both install side by side on one phone. Icons: plate-and-cutlery
  on brand brown `#944a00`; the dev variant's icons carry a green DEV band.
  Vector sources live in `apps/mobile/assets/icon-source/*.svg` (render each
  to a 1024×1024 PNG of the same name in `assets/`). Icons are native — an
  icon change needs `release:*` rebuilds, not an OTA update. `ios/` and
  `android/` are generated per variant (`scripts/ensure-variant.sh` re-runs
  `expo prebuild --clean` when the variant changes). Maestro flows target the
  dev variant.

- Preflight for simulator/E2E work: `scripts/mobile-preflight.sh`

**Mobile routes** (expo-router; deep-link scheme `chefer://`):

| Route                    | Screen                                                                                                                                                                                                                                                                            | Web counterpart                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `(auth)/login`           | Sign in                                                                                                                                                                                                                                                                           | `/login`                             |
| `(auth)/register`        | Create account                                                                                                                                                                                                                                                                    | `/register`                          |
| `(auth)/forgot-password` | Request a reset link (`auth.requestPasswordReset`) — linked from Sign in                                                                                                                                                                                                          | `/forgot-password`                   |
| `(auth)/reset-password`  | New password from a reset token; deep link `chefer://reset-password?token=…`                                                                                                                                                                                                      | `/reset-password`                    |
| `(food)/` (index)        | Dashboard: week outlook, nutrition summary, hero meal, favourites (M2-1)                                                                                                                                                                                                          | `/dashboard`                         |
| `(food)/meal-plan`       | Placeholder (M2-2)                                                                                                                                                                                                                                                                | `/meal-plan`                         |
| `(food)/recipes`         | Recipe list: tabs, search, optimistic favourites (M2-3)                                                                                                                                                                                                                           | `/recipes`                           |
| `recipe/[id]`            | Recipe detail: scaled ingredients, instructions, nutrition (M2-3); star rating when opened with `day` from the Plan tab                                                                                                                                                           | `/recipes/[id]`                      |
| `(food)/shopping-list`   | Placeholder (M2-5)                                                                                                                                                                                                                                                                | `/shopping-list`                     |
| `(food)/more`            | Secondary nav hub + sign out                                                                                                                                                                                                                                                      | mobile drawer                        |
| `tracker`                | Daily log: check-off, portions, custom entries, targets (M2-4); quick add sheet + rebalance banner/undo (P1-7)                                                                                                                                                                    | `/tracker`                           |
| `pantry`                 | Kitchen inventory, premium add/remove, free upsell (M2-6)                                                                                                                                                                                                                         | `/pantry`                            |
| `preferences`            | Safety, goal/body, units (free) + budget (premium); Sunday auto-plan + Weekly updates card (P2-5)                                                                                                                                                                                 | `/preferences`                       |
| `profile`                | Account card, "Your household" row → `household` (P2-3), up/downgrade (PW-2), AI usage quotas (M2-8)                                                                                                                                                                              | `/profile`                           |
| `chat`                   | Streaming AI chef chat, quota upgrade gate (M2-9/M3-1)                                                                                                                                                                                                                            | chat widget                          |
| `onboarding`             | Post-register wizard: step 0 "What brings you here?" (`preferences.setIntent`, P2-3; households → "Who's at your table?", Train → Gym mode + `gym/setup`), then free 3-step (safety, optional goal/metrics) or premium 4-step → `preferences.setup` (dogfood #9); no serving size | `/onboarding`                        |
| `cook/[id]`              | Cook mode: steps, timers, keep-awake, log to tracker (P1-3)                                                                                                                                                                                                                       | `/recipes/[id]/cook`                 |
| `import-recipe`          | F5 import: URL/text preview + premium save                                                                                                                                                                                                                                        | Import sheet                         |
| `recipe-form`            | Manual recipe create/edit                                                                                                                                                                                                                                                         | `/recipes/new`, `/recipes/[id]/edit` |
| `household`              | F2 household members — every tier adds (name, portion, kid, allergies, restrictions, dislikes) and removes with a confirm (P2-3); shared `HouseholdEditor` also renders the onboarding table step                                                                                 | preferences `#household`             |
| `(gym)/today`            | Gym Today: next up, week strip/ring, streak, offers, resume (G2-B)                                                                                                                                                                                                                | — (G5)                               |
| `(gym)/routine`          | Active routine + weekly balance (placeholder, G2-C)                                                                                                                                                                                                                               | — (G5)                               |
| `(gym)/exercises`        | Exercise library (placeholder, G2-D)                                                                                                                                                                                                                                              | — (G5)                               |
| `(gym)/stats`            | Strength / volume / consistency stats (placeholder, G2-D)                                                                                                                                                                                                                         | — (G5)                               |
| `gym/setup`              | 7-step setup wizard: days, experience, equipment/unit, weekdays, preview, starting weights, finish (G2-B)                                                                                                                                                                         | — (G5)                               |
| `gym/workout`            | Active workout: set rows, rest bar, RIR, swap/skip, finish (G2-A)                                                                                                                                                                                                                 | — (G5)                               |
| `gym/summary/[id]`       | Post-workout summary: PRs, week ring, "Next time" + Adjust (G2-A)                                                                                                                                                                                                                 | — (G5)                               |
| `gym/session/[id]`       | Past session detail (placeholder, G2-B)                                                                                                                                                                                                                                           | — (G5)                               |
| `gym/routine-editor`     | Routine editor (placeholder, G2-C)                                                                                                                                                                                                                                                | — (G5)                               |
| `gym/routines`           | My routines (placeholder, G2-C)                                                                                                                                                                                                                                                   | — (G5)                               |
| `gym/exercise/[id]`      | Exercise detail (placeholder, G2-D)                                                                                                                                                                                                                                               | — (G5)                               |
| `gym/exercise-form`      | Custom exercise form (placeholder, G2-D)                                                                                                                                                                                                                                          | — (G5)                               |
| `gym/settings`           | Units, weekly goal, equipment, reminder, pause, needs-attention (G2-B)                                                                                                                                                                                                            | — (G5)                               |
| `history/index`          | Past plans list; View week + Restore behind a ConfirmSheet, per-row pending (M2-10, P1-7)                                                                                                                                                                                         | `/history`                           |
| `history/[planId]`       | Read-only week: day chips, meals → recipe, Restore with confirm (P1-7; `status` route param hides it for ACTIVE)                                                                                                                                                                  | `/history/[planId]`                  |
| `progress`               | 28-day calories vs target + macros, 90-day weight chart, goal-aware change, log form, entries edit/delete (P1-7)                                                                                                                                                                  | `/progress`                          |

**Food / Gym mode (gym_plan.md D3, §5.1).** `(food)` and `(gym)` are two
`Tabs` groups registered side by side in the root `Stack` (groups add no URL
segment, so the gym tabs are not `index`). `src/features/gym/mode-store.ts`
persists `'food' | 'gym'` in the gym KV store (synchronous read, so the first
frame already knows it). A plain launch or sign-in opens `/`; the `(food)`
layout redirects that to `/today` when the persisted mode is Gym. `<ModeSwitch/>`
(`src/features/gym/components/mode-switch.tsx`, ui-mobile `SegmentedControl`)
sits in the header of every tab root in both groups and calls
`router.replace('/')` / `router.replace('/today')`; switching to Gym while the
persisted `gym.bootstrap` says `profile === null` also pushes `/gym/setup`.

**Gym offline layer (gym_plan.md D6, §5.2; `src/features/gym/offline/`).**
Workout logging never needs a connection:

- `kv.ts` — synchronous JSON KV over `expo-sqlite/kv-store` (database
  `chefer-gym.db`; in-memory fallback under Jest). Keys live in `keys.ts`.
- `active-session-store.ts` — the in-progress `WorkoutSessionDoc`, written with
  `setItemSync` on every reducer action (crash-safe; unreadable payloads are
  quarantined, never deleted). `use-active-workout.ts` wraps the shared engine
  reducer: `start` / `dispatch` / `finish` / `discard`, resume on launch.
- `outbox.ts` — persisted queue of finished/discarded docs sent to
  `gym.session.upsertMany` in batches of ≤ 20. An entry leaves ONLY on an
  `applied`/`stale` ack (or an explicit user discard of a parked entry);
  `rejected` or locally-invalid docs are parked for the user; network errors
  back off exponentially (5 s → 5 min). Flushes on reconnect, foreground, after
  each enqueue and every 30 s while non-empty (`sync-triggers.ts`); a success
  invalidates `gym.bootstrap`. `useOutboxStatus()` exposes pending / parked /
  lastSyncAt.
- `checkpoint.ts` — while online, the active doc is upserted as `IN_PROGRESS`
  at most once a minute (best effort).
- `owner.ts` — entries are stamped with the user id; only the user confirmed
  by `auth.me` for the CURRENT token may upload them, so one account's
  workouts are never sent with another's session.
- Read model: the root layout uses `PersistQueryClientProvider` with an
  async-storage persister over the KV store (`query-persistence.ts`). Only
  successful `gym.*` tRPC queries are persisted (`maxAge` 30 days, `buster`
  `${ENGINE_VERSION}:1`); gym queries use `networkMode: 'offlineFirst'` and
  `gcTime: Infinity` (30 days in ms overflows the 32-bit timer). NetInfo feeds
  `onlineManager` and AppState feeds `focusManager` (`connectivity.ts`).
- `use-gym-bootstrap.ts` — `useGymBootstrap()` uses an input-free query key
  (the device's `today` is sent as input, not keyed, so the cache survives
  midnight), merges `librarySince` deltas into the cached library, and re-folds
  finished-but-unsent outbox docs. `applyFinishedLocally(doc)` runs the engine's
  `applyFinishedSession` on the cached bootstrap after Finish.
- `gym-sync-provider.tsx` — mounted in the root layout; wires the outbox sender,
  triggers, checkpointing and the rest-timer notification bridge
  (`rest-timer.ts`: absolute `endsAt`, local notification while backgrounded).

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
│   ├── chef-review.repository.ts        # ChefReviewRepository + IChefReviewRepository (F1)
│   ├── exercise.repository.ts           # Gym: curated + custom exercises
│   ├── gym-profile.repository.ts        # Gym: profile + transactional completeSetup
│   ├── routine.repository.ts            # Gym: routine document replace (version check), setActive, pointer
│   ├── workout-session.repository.ts    # Gym: idempotent session upsert + once-only rotation claim
│   ├── exercise-progression.repository.ts # Gym: derived progression cache + overrides
│   ├── training-pause.repository.ts     # Gym: streak pauses
│   └── weekly-email.repository.ts       # Weekly emails: recipients, send claims, opt-outs (P2-5)
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
- App Store readiness (2026-09-26): `AI_CONSENT_FEATURES` / `AI_CONSENT_FEATURE_DATA` / `AI_CONSENT_COPY` (`ai-consent.ts`), `ACCOUNT_DELETION_COPY` (`account-deletion.ts`), `SUPPORT_EMAIL` (`support.ts`, TODO(owner))
- Household + audience (P2-3, `household.ts`): `ONBOARDING_INTENTS` / `onboardingIntentSchema` / `setOnboardingIntentInputSchema`, `householdMemberFieldsSchema` (household.add/update input), `HOUSEHOLD_PORTION_OPTIONS`

### 5.3 `@chefer/utils`

Pure, side-effect-free utilities. Dependencies: `clsx`, `tailwind-merge`, `date-fns`.

| Module                    | Functions                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object                    | `cn()`, `pick()`, `omit()`, `deepClone()`, `deepMerge()`, `groupBy()`, `keyBy()`, `flattenObject()`, `removeNullish()`                                                                                                                                                                                                                                                                                                     |
| Date                      | `formatDate()`, `formatRelativeTime()`, `formatIso()`, `addDaysToDate()`, `isDateAfter()`, `isPast()`, `isFuture()`                                                                                                                                                                                                                                                                                                        |
| String                    | `slugify()`, `capitalize()`, `truncate()`                                                                                                                                                                                                                                                                                                                                                                                  |
| Array                     | `unique()`, `chunk()`, `flatten()`, `first()`, `last()`                                                                                                                                                                                                                                                                                                                                                                    |
| Async                     | `sleep()`, `retry()` (exponential backoff)                                                                                                                                                                                                                                                                                                                                                                                 |
| Number                    | `clamp()`, `randomInt()`                                                                                                                                                                                                                                                                                                                                                                                                   |
| Assertion                 | `invariant()`, `assertDefined()`, `assertNever()`, `safeInvariant()`                                                                                                                                                                                                                                                                                                                                                       |
| Training nutrition (P2-4) | `isLifter()`, `lifterProteinGPerKg()` / `LIFTER_PROTEIN_G_PER_KG_BY_GOAL` (GAIN 1.8, LOSE 2.0, MAINTAIN / EAT_HEALTHIER 1.6 g/kg), `withLifterProtein()`, `hasTrainingDayBump()` (GAIN_MUSCLE only), `trainingDayBonus()` / `applyTrainingDayBonus()` (2.2 g/kg, +10% kcal 150–300), `resolveTrainingDay()`, `buildTrainingDayNutrition()`, `trainingDayLine()`, `postWorkoutProteinG()` (~0.4 g/kg), `trainingWeekdays()` |
| Household (P2-3)          | `householdPortionSum()` (ceil(1 + Σ portionFactor) — API, web, mobile agree), `perPortionCost()` (total ÷ the portions the list is sized for, F-PM-5), `onboardingSteps()` (intent → wizard steps), `householdGhostSample()` (F-PM-12)                                                                                                                                                                                     |
| AI consent (2026-09-26)   | `needsAiDataConsent(user, usesAi?)`, `aiConsentRequiredFor(feature, isPremium)` (free plan generation/swaps are curated → no ask), `aiConsentIntro(feature)` — shared by the web and mobile consent guards                                                                                                                                                                                                                 |

Domain helpers shared by web, mobile and the API (not exhaustive): `today.ts` — `resolveTodayMeals()` / `isSlotEaten()` (the Today next meal skips meals already logged, F-PM-10; `MEAL_ORDER`, `MEAL_WINDOW_END`); `my-weeks.ts` — `pastWeeks()` (My weeks: past weeks only, one card per week, F-PLAN-6-3); `pantry-confirm.ts` — `pantryItemsToConfirm()` / `pantryConfirmWeekKey()` (the inline "Still have these?" banner asks weekly, about items ≥ 3 days old, F-PM-13); `feedback.ts` — `feedbackCounter()` / `FEEDBACK_MAX_LENGTH` (the feedback field's live counter against the API's 2,000-char cap, F-PROF-2-2); `premium-activation.ts` — `activationStepKeys()` / `ACTIVATION_STEP_COPY` / `SOURCE_FEATURE_PRIORITY` (the source-aware "You're premium" sheet, F-PREM-1-5, F-PM-9; each platform maps step keys to its own routes); `household.ts` — `onboardingProgress()` ("Step 1" with no total on the intent question); `cook-mode.ts` — `defaultCookServings()` (table portions × plan slot portion).

### 5.4 `@chefer/ui`

React component library. Peer deps: `react`, `react-dom`. Built with `class-variance-authority`.

**Components:**

| Component      | Variants / Notes                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`       | default, destructive, outline, secondary, ghost, link · sizes: sm, default, lg, icon · supports `asChild`, `isLoading`                                                                                                                                        |
| `Input`        | label, error message, hint text, icon slots                                                                                                                                                                                                                   |
| `Card`         | CardHeader, CardTitle, CardDescription, CardContent, CardFooter                                                                                                                                                                                               |
| `Badge`        | default, secondary, destructive, outline, success, warning, info                                                                                                                                                                                              |
| `Toast`        | success / error, auto-dismiss                                                                                                                                                                                                                                 |
| `Sheet`        | Responsive dialog — bottom sheet below `sm`, centred dialog above. Sizes sm/md/lg/xl, optional footer slot                                                                                                                                                    |
| `Drawer`       | Edge slide-over (left/right). Used for the mobile navigation menu                                                                                                                                                                                             |
| `ProgressRing` | Circular progress (MO-06): animates from its previous value, `overColor` past 100% + a second overflow lap. `role="progressbar"`, centre children                                                                                                             |
| `ProgressBar`  | Horizontal progress (MO-06): `scaleX` from the left (never `width`), over colour + end cap past 100%                                                                                                                                                          |
| `CountUp`      | `tabular-nums` number that counts up to `value` (`useCountUp`)                                                                                                                                                                                                |
| `ErrorState`   | Load-failure panel with Try again (`onRetry`, or `retryHref` for server components). Render it before any empty state — pages used to show "No meal plan yet — Generate" when the API failed (audit F-X-3-1). `@chefer/ui-mobile` has a matching `ErrorState` |
| `Switch`       | On/off preference toggle (`role="switch"`, `checked` + `onCheckedChange`); 44×44 hit area around a 44×24 track. Label with `aria-labelledby` (P2-5)                                                                                                           |

`Sheet` and `Drawer` share `lib/use-dismissable.ts`, which provides a
ref-counted body scroll lock, a Tab focus trap, Escape-to-close and focus
restore. **New overlays should use `Sheet` rather than a hand-rolled
`fixed inset-0` div** — six of those existed before and none had scroll
locking or focus management.

Small dropdown menus (the header user menu, the shopping list's "…" menu) use
the `useMenu()` hook from `lib/use-menu.ts` instead: it wires the WAI-ARIA
menu-button pattern (`aria-haspopup`/`aria-expanded`, focus to the first
`role="menuitem"` on open, Escape closes and refocuses the trigger, arrow
keys/Home/End move, Tab and outside pointerdown close). Spread `triggerProps`
on the button, `menuProps` on the menu, and put `rootRef` on the wrapper.

**Motion kit** (`src/motion/`, motion-system.md MO-01/02/06, tokens from `@chefer/tokens`):
`pressControl` / `pressCard` / `pressTransition` class strings (scale 0.97 / 0.98 on
`:active`, `duration-instant ease-standard`, no scale under reduced motion — `buttonVariants`
already carries it); `usePresence(open, exitMs)` keeps `Sheet`/`Drawer` mounted in
`data-state="closed"` (inert, click-through) until the exit's `animationend`, with a
`setTimeout(exitMs + 50)` fallback; `useReducedMotion()`; `useTween`/`useCountUp` (rAF,
`enter` curve, final value under reduced motion); pure progress maths (`progressOf`,
`isOverTarget`, …) mirroring ui-mobile's. `Sheet`/`Drawer` fade the scrim and slide the panel
(320 ms enter / 220 ms exit; sm+ dialog fades + scales from 0.96) and under reduced motion
crossfade in 150 ms — they carry `data-motion-safe`, which exempts them from the global
reduced-motion kill-switch in `apps/web/src/app/globals.css`. Tests live in
`apps/web/src/lib/motion/ui-motion.test.tsx` (this package has no test runner).

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

| Config            | Target use                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `base.js`         | TypeScript, import ordering, general rules                                                             |
| `nextjs.js`       | Extends base + Next.js + React hooks; forbids `react-native`/`expo*` imports (platform boundary)       |
| `node.js`         | Extends base + Node.js rules                                                                           |
| `react-native.js` | Extends base + React/hooks for `apps/mobile`; forbids `@chefer/ui`, `@chefer/database`, `next` imports |

### 5.7 `@chefer/tokens`

Zero-dependency design tokens — plain TS data (plus two pure helpers), importable by **both** apps at
runtime and by both Tailwind configs at build time. Spec: `docs/audit-2026-09/motion-system.md` §2.

| Module         | Exports                                                                                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion.ts`    | `duration` (instant 100 · fast 150 · base 220 · slow 320 · deliberate 600 · celebrate 1000 ms), `exit()` (≈70% of an enter), `easing` (cubic-bézier control points) + `cssEasing()`, `spring` (Reanimated configs) + `cssSpring` (the same springs as CSS `linear()`), `stagger`, `haptic` vocabulary, `pressScale`, `overTargetColor` |
| `bezier.ts`    | `cubicBezier()` / `easingFn()` — JS easing for the few JS-thread tweens (count-up text)                                                                                                                                                                                                                                                |
| `elevation.ts` | `elevation.e0…e4`, `e4Up` — warm two-layer shadow strings (web CSS variables; mobile RN `boxShadow` via `style`, never a toggled className)                                                                                                                                                                                            |
| `radius.ts`    | Role radii in px: `inner` 8 · `control` 12 · `card` 16 · `sheet` 24 · `full`                                                                                                                                                                                                                                                           |

Tests: Vitest (`pnpm --filter @chefer/tokens test`) — includes the spring integrator that regenerates
`cssSpring`, so a spring edit without new `linear()` strings fails CI.

Consumers today: `@chefer/ui-mobile`'s motion layer (`src/motion/`: `timing()`/`springs` Reanimated
configs, `PressableScale`, `useReducedMotion`, `haptics`, `CountUp`, progress helpers) and the
`Sheet`/`ProgressRing`/`ProgressBar` built on it; `apps/web/tailwind.config.ts` (`transitionDuration`,
`transitionTimingFunction` incl. `spring-*` `linear()` curves, `boxShadow: var(--elevation-*)`,
role `borderRadius`, plus `future.hoverOnlyWhenSupported`) with the `--elevation-*` variables in
`globals.css` (a unit test keeps them equal to `elevation.ts`); and `@chefer/ui`'s web motion kit
(§5.4). The package's `exports` carry a `default` condition so Tailwind's `jiti` loader can
`require` it.

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
User ─────────── EmailSend[]        (1:N, cascade delete, weekly-email send log, P2-5)
MealPlan ──────── MealPlanDay[]     (1:N, cascade delete)
                  MealPlan.isTemplate/name/isFollowed: week templates ("My weeks",
                  max 4/user, at most one followed) — excluded from every
                  week/active/history query; carry-forward clones the followed one
                  MealPlan.origin (MealPlanOrigin: USER | CARRY_FORWARD | TEMPLATE |
                  WEEKLY_AUTO): how the week came to exist — the Sunday worker only
                  replaces untouched CARRY_FORWARD copies; weekReady = WEEKLY_AUTO
Post ─────────── PostTag[]          (1:N, cascade delete)
Tag  ─────────── PostTag[]          (1:N, cascade delete)
PostTag          (composite PK: postId + tagId)
VerificationToken (standalone, password-reset tokens)
```

### Model Field Reference

**User**

| Field                 | Type          | Notes                                                                                                                                                                                                                                                                            |
| --------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                    | String (cuid) | PK                                                                                                                                                                                                                                                                               |
| email                 | String        | Unique, indexed                                                                                                                                                                                                                                                                  |
| firstName / lastName  | String?       | —                                                                                                                                                                                                                                                                                |
| name                  | String?       | Display name                                                                                                                                                                                                                                                                     |
| image                 | String?       | Avatar URL                                                                                                                                                                                                                                                                       |
| role                  | UserRole      | Default: USER                                                                                                                                                                                                                                                                    |
| planTier              | PlanTier      | Default: FREE — PREMIUM unlocks AI features                                                                                                                                                                                                                                      |
| passwordHash          | String?       | SHA-256 in seed (use bcrypt/argon2 in production)                                                                                                                                                                                                                                |
| emailVerified         | DateTime?     | Confirmed address; weekly emails need it (P2-5)                                                                                                                                                                                                                                  |
| weeklyEmailReady      | Boolean       | Default true — Monday "week ready" email (P2-5)                                                                                                                                                                                                                                  |
| weeklyEmailRecap      | Boolean       | Default true — Sunday recap email (P2-5)                                                                                                                                                                                                                                         |
| aiDataConsentAt       | DateTime?     | App Store 5.1.2(i): when the user allowed AI features to process their data (`user.grantAiDataConsent`); null = not asked yet / revoked → clients ask before the first AI action. Client-enforced only (background jobs unaffected). Applied with `db push` (additive, nullable) |
| createdAt / updatedAt | DateTime      | Auto-managed                                                                                                                                                                                                                                                                     |

**EmailSend** (P2-5) — weekly-email send log

| Field     | Type          | Notes                                                                    |
| --------- | ------------- | ------------------------------------------------------------------------ |
| id        | String (cuid) | PK                                                                       |
| userId    | String        | FK → User (cascade)                                                      |
| kind      | String        | `WEEK_READY` or `WEEKLY_RECAP` (a string: new kinds need no enum change) |
| weekStart | DateTime      | UTC midnight of the Monday of the week the email is about                |
| sentAt    | DateTime      | Default now()                                                            |

`@@unique([userId, kind, weekStart])` — the row is claimed before sending, so
nobody is emailed twice for the same week.

**Post**

| Field     | Type          | Notes           |
| --------- | ------------- | --------------- |
| id        | String (cuid) | PK              |
| slug      | String        | Unique, indexed |
| status    | PostStatus    | Default: DRAFT  |
| published | Boolean       | Default: false  |
| authorId  | String        | FK → User       |

**ChefProfile**

| Field                | Type              | Notes                                                                                                     |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| id                   | String (cuid)     | PK                                                                                                        |
| userId               | String            | Unique FK → User, cascade delete                                                                          |
| displayName          | String?           | —                                                                                                         |
| biologicalSex        | BiologicalSex?    | MALE / FEMALE / OTHER                                                                                     |
| age                  | Int?              | —                                                                                                         |
| heightCm             | Float?            | —                                                                                                         |
| weightKg             | Float?            | —                                                                                                         |
| activityLevel        | ActivityLevel?    | SEDENTARY/LIGHTLY_ACTIVE/…/ATHLETE                                                                        |
| goal                 | Goal?             | LOSE_WEIGHT/MAINTAIN/GAIN_MUSCLE/EAT_HEALTHIER                                                            |
| dailyCalorieTarget   | Int?              | Computed by Mifflin-St Jeor at save                                                                       |
| weeklyBudgetEur      | Float?            | Weekly ingredient budget ceiling (P2-4) — generation treats it as a hard constraint                       |
| targetAdjustmentKcal | Int               | Default 0 — cumulative Adaptive Chef dial (F1), applied by resolveDailyTargets after the goal adjustment  |
| autoPlanWeekly       | Boolean           | Default true — Sunday auto-plan opt-out (F-PLAN-4-3); free = curated week (P2-5)                          |
| onboardingIntent     | OnboardingIntent? | Onboarding step 0 answer (P2-3, F-PM-6): EAT_BETTER / HOUSEHOLD / TRAIN; null = never asked (older users) |
| deliveryAddress      | String?           | Full address string for grocery delivery                                                                  |
| deliveryCurrency     | String?           | ISO 4217 currency code (EUR/USD/GBP/RON)                                                                  |
| updatedAt            | DateTime          | Auto-managed                                                                                              |

**DietaryPreferences**

| Field               | Type     | Notes                                                                                                                                                                                                                                                                                   |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                  | String   | PK                                                                                                                                                                                                                                                                                      |
| userId              | String   | Unique FK → User, cascade delete                                                                                                                                                                                                                                                        |
| cuisinePreferences  | String[] | —                                                                                                                                                                                                                                                                                       |
| dietaryRestrictions | String[] | Vegan, Gluten-Free, etc.                                                                                                                                                                                                                                                                |
| allergies           | String[] | —                                                                                                                                                                                                                                                                                       |
| dislikedIngredients | String[] | —                                                                                                                                                                                                                                                                                       |
| mealsPerDay         | Int      | Default 3                                                                                                                                                                                                                                                                               |
| servingSize         | Int      | Default 1. **Legacy** (P2-3, F-PM-8): the household is the one people model. A value > 1 is converted into "Person N" placeholder members once (only when the user has none) and reset to 1; `preferences.get` reports it derived from the household (≤ 6) for app builds in the stores |

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
| ---------- | ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | String (cuid) | PK                            |
| mealPlanId | String        | FK → MealPlan, cascade delete |
| dayOfWeek  | Int           | 0 = Monday … 6 = Sunday       |
| meals      | Json          | `[{ type: 'breakfast'         | …, recipeId: string, leftoverOf?: string, portion?: number }]` (`PlanMealSlotJson`; `portion` = servings of the recipe, 0.75–2, absent = 1 — P1-1, no schema change) |

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
| checkedKeys | String[] | Synced check-off state (P1-5); carried over by name on AI regenerate                            |
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

| Field                                                 | Type     | Notes                                                                         |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| id                                                    | String   | PK (cuid)                                                                     |
| userId                                                | String   | FK → User, cascade delete                                                     |
| name                                                  | String   | —                                                                             |
| portionFactor                                         | Float    | Default 1 (0.5 kid … 1.5 big eater)                                           |
| isKid                                                 | Boolean  | Default false                                                                 |
| allergies / dietaryRestrictions / dislikedIngredients | String[] | Unioned with the owner's for safety filtering on every tier (free since P2-3) |

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

**Gym models** (gym_plan.md §2.2; schema from G0-2, repositories + services from G1-B). Weights are
kg (`Float`, 0.01 precision) rendered in `GymProfile.unit`. Ids a phone creates offline
(sessions, session exercises, sets) are **client UUIDs** so the sync upsert is idempotent.

| Model                 | Key / relations                                                  | Notes                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exercise`            | `id` = curated slug or custom UUID; `ownerId?` → User (cascade)  | `ownerId = null` = curated, upserted from `@chefer/types` `EXERCISE_CATALOG` at API boot (`ensureExerciseLibrary`, `contentVersion` bumps on content change, dropped slugs archived). Custom rows are owner-only and archived, never deleted. `imageKeys` → `/static/exercises/<key>` |
| `GymProfile`          | `userId` PK → User (cascade)                                     | Setup answers + equipment inventory. JSON: `goalHistory` `[{ fromWeek (Monday), goal }]`; `offerState` (API-owned) `{ dismissed: {key→ISO}, deload: {startDate,endDate} \| null, knownWeightsKg: {exerciseId→kg} }`                                                                   |
| `Routine`             | `userId` → User; `days` RoutineDay[] (cascade)                   | One `isActive` per user. `version` = optimistic concurrency for document saves (bumped only by `routine.save`). `nextDayId` = rotation pointer (NOT document content; moved by completed sessions and `setNextDay`)                                                                   |
| `RoutineDay`          | `routineId` (cascade); `exercises` RoutineExercise[] (cascade)   | `position`, `plannedWeekday` 0 = Mon … 6 = Sun                                                                                                                                                                                                                                        |
| `RoutineExercise`     | `dayId` (cascade); `exerciseId` → Exercise                       | A slot: sets, rep range, target RIR, rest, superset group. Ids survive document saves when the client sends them back                                                                                                                                                                 |
| `WorkoutSession`      | `id` client UUID; `userId` → User                                | Full synced document. `clientUpdatedAt` = last-write-wins guard; `rotationAppliedAt` = set once when completion advanced `Routine.nextDayId` (re-syncs never advance twice). `localDate` is the device's date                                                                         |
| `SessionExercise`     | `id` client UUID; `sessionId` (cascade); `exerciseId` → Exercise | Snapshot of the slot at start + `prescription` JSON (the engine Suggestion shown); deleted + recreated on every applied upsert                                                                                                                                                        |
| `SessionSet`          | `id` client UUID; `sessionExerciseId` (cascade)                  | `completedAt null` = planned, not ticked                                                                                                                                                                                                                                              |
| `ExerciseProgression` | PK `[userId, exerciseId, repBucket]`                             | **Derived cache**: `state` is recomputed by folding the engine over completed sessions (`ProgressionService.recompute`). `override` (user-edited next targets) survives recomputes and is cleared once an exposure newer than it is logged                                            |
| `TrainingPause`       | `userId` → User                                                  | Inclusive localDate range that freezes the streak (≤ 35 days, no overlaps)                                                                                                                                                                                                            |

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
enum OnboardingIntent { EAT_BETTER  HOUSEHOLD  TRAIN }   // P2-3 audience routing
// Gym (gym_plan.md §2.2)
enum ExerciseEquipment  { BARBELL  DUMBBELL  CABLE  MACHINE  BODYWEIGHT  SMITH  EZ_BAR  KETTLEBELL  BAND  ASSISTED }
enum ExerciseLoadType   { WEIGHTED  BODYWEIGHT  BODYWEIGHT_PLUS  ASSISTED }
enum ExerciseCategory   { COMPOUND  ISOLATION }
enum TrainingExperience { BEGINNER  INTERMEDIATE }
enum GymEquipmentAccess { FULL_GYM  DUMBBELLS  BODYWEIGHT }
enum WeightUnit         { KG  LB }
enum WorkoutStatus      { IN_PROGRESS  COMPLETED  DISCARDED }
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

`apps/api/src/application/preferences/preferences.service.ts`. Methods: `hasProfile` (goal set), `get` (reports `dietaryPreferences.servingSize` derived from the household via an injected `HouseholdPort`, P2-3), `setIntent` (onboarding audience, every tier), `setDisplayPreferences` (units + currency, every tier; syncs the gym unit through an injected `GymUnitSync`, lazily wired to `gymProfileService.syncFromPreferredUnits` so the service never loads the gym graph eagerly — P2-6), `setup` (never shrinks the safety lists — it unions saved and submitted allergies/restrictions/dislikes, since the onboarding wizard can be re-opened after an upgrade; F-ONB-1-1), `update` (backing `preferences.updateSafety`, `preferences.updateTargets` and the every-tier `preferences.saveProfileBasics` — the split is enforced at the router's auth level, P1-2 / ux-fixes-plan.md 3.1).
A `servingSize > 1` written by an older app build (setup/updateTargets) is absorbed into the household right after the write (`HouseholdPort.migrateLegacyServingSize`). Orchestrates `IChefProfileRepository` + `IDietaryPreferencesRepository` inside a Prisma `$transaction`. Recomputes `dailyCalorieTarget` via Mifflin-St Jeor on every update. Accepts `deliveryAddress` and `deliveryCurrency` fields.

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
teaser-only (dial untouched). Review prose comes from `application/coach/review-text.ts` via
`IAIService.generateReviewText` (primary-first with failover like other generation calls;
non-medical tone rules in `lib/ai/prompts.ts`; deterministic template in mock mode or on failure).
`getCurrentReview` shapes the payload by entitlement: full for `adaptiveCoaching`, first-line
teaser for free (the full text never leaves the server). Targets come from
`resolveDailyTargets(profile, lifterBodyweightKg)`: lifters are judged on their g/kg protein rule,
and the review adds one protein line (average logged protein vs target; template + AI prompt
field `protein`) for lifters only. Depends on `IChefReviewRepository`,
`IChefProfileRepository`, `IWeightEntryRepository` and `TrainingNutritionService.loadLifter`
(constructor-injected for tests).

### HouseholdService (application layer)

`apps/api/src/application/household/household.service.ts` (F2 "Feed the Whole Table", premium_plan.md W2-D; free member safety + one people model since backlog P2-3). CRUD over `IHouseholdMemberRepository` (constructor-injected): `list` (converts a legacy servingSize first), `add` (capped by `getLimit(user, 'householdMembers')` — **5 on both tiers**; count + insert run in one SERIALIZABLE transaction with P2034 retry via `createWithinCap`, so parallel adds can't pass the cap — F-ONB-3-1), `update`/`remove` (ownership-scoped, NOT_FOUND otherwise), `scalingPortions(user)` (the table's portion sum when the user has `householdPlans` AND members, else null — the one scaling decision the shopping list uses), `migrateLegacyServingSize(userId)` (best effort) and `backfillLegacyServingSizes()` (run once at API boot). Also exports the PURE helpers:

- `legacyServingSizePlaceholders(n)` — servingSize N → N−1 standard-portion `Person 2…N` members (capped at 5); deterministic. The repository's `migrateLegacyServingSize` claims the value with a conditional `UPDATE … WHERE servingSize = N` (reset to 1) and inserts the placeholders in the same transaction only when the user has no members, so it is idempotent and race-safe.
- `derivedServingSize(members)` — the legacy field old app builds read: `min(6, householdPortionSum)`.

- `mergeHouseholdSafety(owner, members)` — case-insensitive union of every member's allergies + dietary restrictions with the owner's (SafetyPrefs shape; member dislikes stay OUT — they are soft). **Safety is never premium**: MealPlanService applies this union on the free curated path, curated swaps and AI swaps whenever members exist (e.g. created before a downgrade).
- `computeHouseholdContext(members, owner)` — fills `MealPlanInput.householdContext`: `portionSum = householdPortionSum(members)` from `@chefer/utils` (`ceil(1 owner portion + Σ member portionFactor)`; drives recipe servings + quantity scaling, and premium generation's `servingSize` — the legacy setting is no longer read), `mergedSafety`, and per-member `dislikeNotes` ("avoid mushrooms for Maria"); `undefined` with no members so the seam stays absent.

### ChatService (application layer)

`apps/api/src/application/chat/chat.service.ts` (P1-4). Backs `POST /api/chat`: enforces the matrix chat quota (`chatMessagesPerDay` — FREE 5/day counted from `ai_call_logs` CHAT rows, premium unlimited), builds a fresh per-message context from the user's REAL data (today's meals with macros + day totals, weekly overview, resolved daily targets, allergies/restrictions/dislikes, recent rating signals) and hands the model tools over the real services: `swapMeal` (performs an actual plan swap through MealPlanService, respecting the swap quota), `scaleRecipe` (rescales ingredient quantities from the active plan), `addToShoppingList` (items land in the customItems overlay), `logMeal` (F4 "I ate this" — logs a manual custom entry into today's tracker via TrackerService, rebalance included) and `whatCanIMake` (F3 — pantry-coverage ranking via PantryService; free tier gets a teaser). The Gemini implementation runs a bounded function-calling loop and streams the final answer; the mock echoes the same context and exercises the same tool handlers.

### RecipeImportService (application layer)

`apps/api/src/application/recipe-import/recipe-import.service.ts` (F5 "Cheferize Anything", premium_plan.md W1-C). Backs `recipe.importPreview` / `recipe.importSave`:

- **`preview(user, source)`** — metered via `recipeImportsPerDay` (AiCallLog `RECIPE_IMPORT` rows, attempts not successes; FREE 1/day = the §6.4 ghost preview, premium 5/day). URL sources go through `lib/recipe-import/`: SSRF-guarded fetch (`ssrf-guard.ts` — http(s) only, default ports, every DNS-resolved address checked against private/loopback/link-local/metadata/CGNAT/ULA ranges; `fetch-page.ts` — 10 s timeout, 1 MB streaming cap, ≤3 redirects each re-validated) then a dependency-free readability strip (`extract-content.ts` — schema.org Recipe JSON-LD extraction, chrome/script removal, og:image, 20 k char cap). Extraction (`IAIService.extractRecipe`, text or photo multimodal) is followed by the **Cheferize pass** (`IAIService.cheferizeRecipe`: allergen/restriction substitutions, soft dislike swaps, serving rescale) whose output is **re-validated by the P1-2 allergen matcher — AI output is never trusted for safety**; surviving terms are reported and the adapted variant is unusable (fail closed). The AI's calorie estimate is cross-checked against the ingredient price/macro vocabulary (`lib/recipe-import/macro-check.ts`, >25% disagreement → "estimate uncertain").
- **`save(user, input)`** (premium) — re-runs the matcher server-side on any `adapted` payload (rejects violations regardless of what the client sends), then creates a `source: MANUAL` recipe with `sourceUrl` provenance; image = the page's og:image when a guarded HEAD check confirms it serves an image, else the deterministic name-seeded Pollinations URL. Saved imports are rateable/pinnable, so they flow into P1-1 generation placement unchanged.
- Chat tool `importRecipe(url)` (ChatService.buildTools): premium → preview + auto-save (adapted when safe and changed, else original); free → preview summary + upgrade pointer.
- **Friendly AI-failure mapping (§4.5.2):** both AI calls are wrapped with `lib/ai/friendly-error.ts#toFriendlyAiError` — upstream 429/5xx/timeouts become a `SERVICE_UNAVAILABLE` TRPCError with the "chef is over capacity" copy, other AI failures an `INTERNAL_SERVER_ERROR` with a task-specific sentence; the raw provider error goes to the server log only (the import sheet used to render the raw 429 JSON blob).

### VideoRecipeService (application layer) — curated dataset pipeline

`apps/api/src/application/video-import/video-recipe.service.ts`. Turns a short cooking video (Instagram reel, TikTok, YouTube Short) into an `ExtractedRecipe` for the **CURATED** pool. Extraction only — it writes nothing; drafts go to review before promotion, because an unreviewed extraction that mis-states `servings` silently rescales every per-serving macro built on it.

**Two stages, because the caption and the clip carry different halves of a recipe.** Measured on real reels: captions carry the QUANTITIES in clean prose (~550 input tokens, no download); the clip carries the METHOD (~20,000 input tokens, ~15 MB). Many creators publish an ingredient list with no steps at all.

- **Stage 1 — caption only.** `IMediaFetcher.fetchMetadata` (yt-dlp `--skip-download`) → `IAIService.extractRecipeAnnotated({ text })`. Returns immediately when the caption carries a complete recipe.
- **Escalation** fires on a concrete signal: fewer than 2 instructions, `NO_RECIPE_FOUND`, `low` confidence, no ingredients, or a caption under 40 chars (a hashtag dump — stage 1 is skipped entirely, saving the call).
- **Stage 2 — the clip, with the caption alongside it.** `downloadVideo` (yt-dlp, re-encoded by ffmpeg above 12 MB raw since base64 inflates 4/3 against Gemini's 20 MB inline cap) → `extractRecipeAnnotated({ videoBase64, text })`. Gemini-only: the secondary provider has no vision, and `FailoverAIService` keeps video sources primary-only.
- **Name reconciliation** (`lib/video-import/reconcile.ts`) — with the clip in context the model echoes spoken phrasing into ingredient names (`garlic cloves, minced`), which degrades the `normalizeIngredientName` matching that pricing and shopping lists depend on. Stage 1's names are cleaner and already in hand, so names are rewritten deterministically rather than by trusting the prompt. Conservative by design: only an exact key match or a trailing FORM_WORD (`garlic` ≡ `garlic clove`, but `garlic powder` is its own ingredient). Quantities are never touched.
- **Serving-count trust** (`lib/video-import/servings.ts`) — `servings` is the least reliable field and the most damaging when wrong. One clip yielded 2, 3, 5, 5 and 2 across five runs, and the model reported "high" confidence every time, so self-reporting is not usable. When the caption states no explicit yield (`serves 4`, `4 servings` — _not_ "per serving", which is a portion size), confidence is capped at `medium` in code and an explicit verify-this note is appended.
- Output carries `stage`, `escalationReason`, `confidence`, `assumptions` (the reviewer's checklist), `renames`, `sourceUrl` and `creator`.

**Batch driver:** `scripts/extract-video-recipes.ts` (`pnpm recipes:from-video <url…>` / `--file urls.txt --out drafts.json`). Reports the **escalation rate** per run — the multiplier that sets real cost per recipe at dataset scale.

**Prompt contract note.** `EXTRACT_RECIPE_ANNOTATED_SYSTEM_PROMPT` carries an explicit _no invented method_ rule and, unlike `extractRecipe`, leaves thinking ENABLED. With `thinkingBudget: 0` the model pattern-completed all ten steps of a method it was never given — inventing an air-fryer temperature, garbling it to "3750F (1900C)", reporting high confidence and flagging none of it. Ten fabricated instructions are indistinguishable from ten real ones to the caller, so the extractor never escalated to the video that actually held the method. Stage 1 must be explicitly licensed to return an empty `instructions` array.

### MealPlanService (application layer)

`apps/api/src/application/meal-plan/meal-plan.service.ts`. Methods: `generate`, `getActive`, `getForWeek`, `getRecipe`, `swapRecipe`, `replaceRecipe`, `list`, `restore`, `getById` — the plan→DTO join lives once in the private `assemblePlanDto` and week lookups use the indexed `findByWeekStart` (no more 52-plan scans). `getForWeek` carries plans forward: an empty current/next week is materialized as a copy of the user's most recent plan (`findLatestWithDaysBefore`, deliberate write-on-read) and flagged `carriedOver` on that first response — plans continue week to week until the user changes them. Ingredient categorisation is shared: `application/shared/category-map.ts` (word-boundary matching, longest keyword first — "pepperoni" no longer lands in produce via "pepper").

- `generate(userId, weekOffset, premium)` — **tier-branched**:
  - _Premium_ (or ADMIN): reads prefs **+ learning signals (P1-1)**: pinned favourites (`favouriteRecipeRepository.findPinnedForNextPlan`) and the 20 most recent ratings (`mealRatingRepository.findSignalsForUser`) → **recomputes the daily calorie target live** from body metrics + goal via `computeCalorieTarget` (the stored `dailyCalorieTarget` is a display snapshot and may be stale) → calls `IAIService.generateMealPlan` with liked/disliked dish lines and the daily **macro targets** (protein/carbs/fat from `resolveDailyTargets`) in the prompt → **reconciles AI macros** (`macro-reconcile.ts`, F-REC-2-4: a recipe whose stated kcal drifts >25% from its ingredients — per-100 g vocabulary, ≥70% line coverage — has its quantities scaled 0.6–1.8× toward the stated kcal and every macro restated from the scaled ingredients; same for AI swaps) → one corrective retry when days stray beyond ±15% kcal **or ±20% on any macro** (`planOffTargetScore`, F-PLAN-1-2), keeping the closer attempt → **places pinned favourites verbatim** into matching meal slots (type inferred from the recipe's last appearance in the user's recent plans; pins spread across the week; pinned rows are excluded from the upsert so shared curated rows keep their creator/source) → reuses existing images by recipe name (`findRecipeImagesByNames`) → upserts recipes with `imagePriority` (day-distance from today) → archives old plan → creates new `ACTIVE` plan → `recipeImageWorker.wake()` → clears the `useInNextPlan` flags (a pin means "next plan", not "forever"). The response carries `personalisation { pinnedDishNames, likedCount, dislikedCount }` so the UI can show what the generation learned from.
  - _Free_: `generateCurated` — breakfast/lunch/dinner from the **safety-filtered** curated pool (allergies, dietary restrictions, dislikes — P1-2) for each of 7 days, planned by the pure `curated-planner.ts`: each day picks the combination of the next five unused recipes per type (eight for GAIN_MUSCLE, which also keeps preferring protein-dense dishes once the target is met) that — **portioned** — lands closest to the targets, and adds up to two snacks while the portioned mains still miss (kcal out of ±10% or protein meaningfully short). **Portions (P1-1):** `@chefer/utils` `choosePortions` sizes every slot 0.75×–2× (quarter steps, exhaustive search) so the day lands within ±10% of the calorie target with protein as close to target as the dishes allow (protein-dense meals are upsized first; a cut penalises calorie overshoot). The multiplier is stored on the slot JSON (`portion`, omitted at 1×) and returned as `MealSlotDto.portion`; `recipe.nutritionInfo` stays per ONE serving. A day still short of protein carries `DayPlanDto.proteinGapG` (computed on read for every plan from the portioned totals — under 90% and ≥ 10 g short); the plan also returns `proteinTarget`. A free swap of a portioned slot sizes the new dish to the old slot's calories (nearest step); AI swaps, replacements and rebalance swaps reset the slot to 1× (`updateDayMeal`'s optional `portion`). Everything downstream counts slots at their portion: shopping list lines, plan cost, pantry savings, dashboard planned totals/hero kcal (`nextMeal.portion`), tracker `plannedMeals[].portion` (macros stay per serving; clients default the logged portion to it) and rebalance. Household portions (premium) are a separate factor that multiplies with it. (Audit F-PLAN-1-3 / F-PM-4 / F-TRK-4-2 — days used to land 18–29% under, a 175 g protein target got 43–106 g.) No repeats until a pool is used up, no AI calls, preset images. If any meal type keeps fewer than `MIN_SAFE_POOL_SIZE` safe recipes, throws `PRECONDITION_FAILED` — the meal-plan page renders it as the contextual upgrade prompt.
- **Training days (audit P2-4)** — both tiers call `trainingNutritionService.loadLifter` (constructor-injected) and pass the lifter bodyweight to `resolveDailyTargets` (protein 1.8 g/kg). Premium: the active routine's planned weekdays and the training-day bump go into `MealPlanInput.trainingDays` (`buildTrainingDaysSection` in the prompt, no extra call), and `planOffTargetScore` judges those days against the bumped targets. Free: `planCuratedWeek` gets `trainingDays` and weighs the protein shortfall double on them (higher-protein picks and portions, no kcal bump); the P1-1 portions aim at these lifter-resolved base targets, and plan reads judge `proteinGapG` against them too.
- **Household (F2, premium_plan.md W2-D)** — both tiers load the user's `HouseholdMember` rows (`IHouseholdMemberRepository`, constructor-injected). Premium generation fills `MealPlanInput.householdContext` via `computeHouseholdContext` (portionSum servings, merged safety, per-member dislike notes) and puts the merged allergies/restrictions on the top-level prompt fields; the free curated path, curated swaps and AI swaps run `loadMergedSafety` (union via `mergeHouseholdSafety`, filtering via the unchanged `filterSafeRecipes`) — **safety is never premium**. The pantry context provider (F3) is wired at the marked integration point in `generate` by the wave-2 integrator.
- `swapRecipe(..., premium)` — premium: AI-generated alternative (with name-based image reuse + worker wake); free: random curated recipe of the same meal type from the safety-filtered pool (`PRECONDITION_FAILED` when nothing safe remains). Swap safety uses the household union (F2).
- Per-slot operations (`swapRecipe`, `replaceRecipe`) address a slot through `resolvePlanSlot(plan, dayOfWeek, mealType, slotIndex?)`: the given index (must be a slot of `mealType`, else `BAD_REQUEST`) or, when absent, the first slot of the type. `mealPlanRepository.updateDayMeal(..., portion?, slotIndex?)` rewrites only that one slot — it used to rewrite every slot of the type, so swapping one snack of a two-snack curated day turned both into the same dish.
- `list` / `restore` / `getById` — history + restore support.
- Every assembled `WeekPlanDto` carries `estimatedCost` (P2-4): `application/shared/plan-cost.ts` prices the same aggregated lines as the shopping list (`aggregateIngredientLines`), so the chip equals the list total unless the list adds custom items or subtracts pantry stock. Premium generation feeds `ChefProfile.weeklyBudgetEur` into the prompt as a hard budget constraint; the meal-plan page shows the week cost on every tier and an over-budget warning when the estimate exceeds the budget.

### TrackerService & ScanService (application layer) — F4 Snap-to-Log

`apps/api/src/application/tracker/tracker.service.ts`. Day log CRUD (`getDay` — also returns `offPlanLogged`, logged recipes no longer in today's plan; `upsertDay` — merges via `merge-log.ts`; `logRecipe`; summaries, weight). Every day write goes through `dailyLogRepository.mutateDay` (serializable transaction + retry, totals recomputed), so concurrent writes never lose entries (audit F-TRK-1-2). F4 additions: `logCustomMeal` (appends a custom entry `{ custom: { name, estimatedBy: 'vision'|'manual' }, … }` to the day, portionMultiplier fixed at 1 — macros arrive pre-edited from the confirm sheet), `deleteCustomMeal` (removes one custom entry by its index in the day's `loggedMeals` array; planned entries are rejected), and the `maybeRebalance` hook: after every log write (`upsertDay` and `logCustomMeal` — cook-mode and chat log through these same paths), users with `photoLogging` access get `rebalanceWeek` run against their active plan. Rebalance failures are swallowed (a log save must never fail because of it); mutations return `{ log, rebalance }` so the client can hand applied swaps to the meal-plan banner.

`apps/api/src/application/tracker/scan.service.ts`. Backs `POST /api/scan-meal`: `assertMealScanQuota` (FORBIDDEN for free, TOO_MANY_REQUESTS at the matrix limit), writes the `SCAN` AiCallLog row up front (quota counts attempts), then `IAIService.analyzeMealPhoto(base64, mime)` → `{ dishName, confidence low|med|high, kcal, protein, carbs, fat, portionNote }` (Gemini multimodal structured output validated by `parseMealPhotoResponse` in `lib/ai/schemas.ts`; deterministic byte-hash scenario table in mock mode — see MealPlanAIService below). Upstream AI failures are mapped by `lib/ai/friendly-error.ts` to a friendly `SERVICE_UNAVAILABLE`/`INTERNAL_SERVER_ERROR` TRPCError (raw error in the server log; scan.router forwards the message as HTTP 503/500). Confirming the estimate is a separate `tracker.logCustomMeal` call — discarded scans never touch the DailyLog.

### Rebalance (application layer) — F4

`apps/api/src/application/meal-plan/rebalance.ts` (the wave-0 seam module — meal-plan.service.ts untouched). `selectRebalanceSwaps` is a pure, fixture-tested greedy selector: project the week (Σ logged kcal Mon…today + Σ planned kcal for days strictly after today) against 7×dailyCalorieTarget; when off by more than ±15%, swap up to 2 FUTURE slots for the curated-pool alternative that most reduces the deviation (safety-filtered pool, no AI call, ≥2%-of-target minimum improvement so re-runs converge to a no-op, stops early once back within tolerance). `rebalanceWeek(userId, planId)` orchestrates: current-week plans only, Sunday no-ops, applies swaps via `mealPlanRepository.updateDayMeal` (by slot index, so each snack of a two-snack day is its own slot) and returns the swaps with an additive `slotIndex` and the previous↔new recipe pairs (+ `planId`) for the client-side undo banner (undo replays `mealPlan.replaceRecipe`; pairs live in localStorage — nothing server-side, wave-0 schema freeze).

### CuratedRecipes (lib)

`apps/api/src/lib/curated-recipes/`. Generic recipe pool for FREE-tier users: the original AI fixtures plus the 42-recipe expansion in `extra-pool.ts` (64 total, ≥3 compliant options per plan meal type for vegan/vegetarian/pescatarian/gluten-free/dairy-free and the major allergens — pinned by `safety.test.ts`), under deterministic `curated-*` IDs (`source: CURATED`, `imageStatus: DONE`; fixture recipes use stock Unsplash images, expansion recipes use deterministic Pollinations URLs warmed on first use). `safety.ts` implements the P1-2 filter: allergen/dislike term-matching over recipe name + ingredients + instructions (with synonym expansion, family-scoped substitute qualifiers such as "dairy-free"/"vegan"/"gluten-free", e.g. "nuts" → almond/cashew/coconut/…) and restriction rules that require the dietaryTag AND scan ingredients so mis-tagged recipes fail safe. `ensureCuratedRecipes()` idempotently upserts the pool on first free-tier generation; `safeCuratedPools(prefs)` / `pickRandomCurated(mealType, excludeId?, prefs?)` power filtered generation and swaps. `findSafetyIssues(recipe, prefs)` names the conflicting terms; it backs the premium AI safety pass (`MealPlanService.enforcePlanSafety`), the AI-swap fallback, import validation and the `allergenWarnings` field on recipe DTOs.

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

`apps/api/src/workers/weekly-plan.worker.ts` (PW-5). Hourly tick; on Sundays from 08:00 UTC it pre-generates NEXT week's plan for every `planTier = PREMIUM` user with a complete chef profile (admins get access-premium, not subscriber perks). **Free accounts get a curated week the same way (P2-5)**: `planTier = FREE`, `autoPlanWeekly` on (or no ChefProfile row yet) and a live (unexpired) session, via `generate(userId, 1, false, { origin: WEEKLY_AUTO })` — deterministic, no AI call, no per-user delay; a restriction set that exhausts the curated pool only fails that user. Premium uses `MealPlanService.generate(userId, 1, true, { origin: WEEKLY_AUTO })`, so pinned favourites, rating signals, budget and safety prefs all apply (P1-1/P2-4), and the image worker picks the recipes up as usual. Users with `ChefProfile.autoPlanWeekly = false` are skipped. A user who follows a "My weeks" template gets that template applied (`applyTemplateToWeek`, origin TEMPLATE, no AI call) instead of a generated week (F-PLAN-4-1). Idempotency comes from the data — a user who already has a plan for next week (`findByWeekStart`) is skipped unless it is an untouched carry-forward copy (origin CARRY_FORWARD with no shopping ticks or custom items, F-PLAN-4-2), so restarts and repeated ticks are safe; per-user failures are logged and don't starve the sweep. Router-level daily generation quotas don't apply to worker calls. The dashboard celebrates the result: `dashboard.summary` returns `weekReady { preparedAt, ratedCount }` only when the active plan's origin is WEEKLY_AUTO (it used to fire for any plan created before its week, including carry-forward copies), and the dashboard shows "Your week is ready — built from N dishes you rated" on Mondays (`ratedCount` is 0 for free accounts: a curated week doesn't learn from ratings).

### WeeklyEmailWorker + WeeklyEmailService (worker / application layer) — P2-5

The outbound retention channel (audit F-PM-14, F-PLAN-4-3), both tiers.
`apps/api/src/workers/weekly-email.worker.ts` ticks hourly and, because no
per-user time zone is stored, uses **fixed UTC hours**: Mondays from 07:00 UTC
→ `weeklyEmailService.sendWeekReady`, Sundays from 17:00 UTC →
`sendWeeklyRecap`. `apps/api/src/application/notifications/weekly-email.service.ts`:

- **Recipients** (`WeeklyEmailRepository.findRecipients`): a confirmed address
  (`emailVerified` set), the matching `User.weeklyEmail*` flag on, and no
  `EmailSend` row for that kind and week. Deleted accounts are hard-deleted,
  so they never match.
- **Monday "week ready"**: this week's plan (skipped when nothing is planned) →
  one dinner per day, the list total from `shoppingListService.getForWeek`
  formatted with `formatMoney` in the user's currency, and a source line —
  premium `WEEKLY_AUTO` = "your chef planned it … N dishes you rated", free
  `WEEKLY_AUTO` = the curated week plus a quiet premium line, `TEMPLATE`, or
  the user's own week.
- **Sunday recap**: meals logged, days within ±10% of the calorie target,
  weight change vs the previous weigh-in, completed workouts (Gym users only),
  next week's planned dinners and the chef-review pointer (premium). Skipped
  when the week has nothing to recap.
- **Idempotency**: `claimSend` inserts the `EmailSend` row _before_ sending
  (`@@unique(userId, kind, weekStart)`); a failed send releases it so a later
  tick retries. 600 ms between sends (Resend's 2 req/s).
- Templates: `lib/email/templates.ts` (branded HTML + text part, escaped).
  Every weekly email carries an unsubscribe link and a `List-Unsubscribe`
  header.
- Signed links: `lib/email/tokens.ts` — HMAC-SHA256 over a small JSON payload
  (`EMAIL_TOKEN_SECRET`, else a key derived from `JWT_SECRET`). Unsubscribe
  tokens never expire (scope `WEEK_READY` | `WEEKLY_RECAP` | `ALL`);
  confirmation tokens are bound to the address and last 7 days.
- **Manual trigger** (no procedure):
  `cd apps/api && pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts <ready|recap> [--user=email] [--dry-run]`
  runs one sweep now, ignoring the day and hour but keeping opt-outs,
  confirmation and the send claims.

`EmailPreferencesService` (same folder) backs the `notifications.*`
procedures: the two switches, the confirmation email (sent at signup from
`auth.register`, re-sendable from Preferences) and the public unsubscribe.

### RecipeImageWorker (worker)

`apps/api/src/workers/recipe-image.worker.ts`. Background generator for recipe photos via Pollinations.ai:

- Claims up to **5 PENDING recipes at a time** (atomic per-row claim, horizontal-scale safe) and generates them in parallel, draining the queue until empty; 5 s poll interval is only a discovery fallback.
- `wake()` — called by MealPlanService right after persisting, so generation starts with zero poll delay.
- Queue is ordered by `imagePriority` asc (today's meals first), then `createdAt`.
- Image URLs are deterministic: Pollinations seed + prompt derive from _normalised recipe name + cuisine_ (never the LLM description), so the same dish always maps to the same CDN-cached URL across regenerations. Images render at 512×384.

### PantryService (application layer) — F3 Zero-Waste Kitchen

`apps/api/src/application/pantry/pantry.service.ts`. The user's kitchen inventory over `IPantryItemRepository` (+ `IMealPlanRepository`, both constructor-injected). Methods: `list` (oldest `updatedAt` first — the use-first order), `seedFromPurchases` (called by ShoppingListService on check-off: upserts PURCHASE rows, normalized names, **staples denylist** in `application/pantry/staples.ts` — salt/pepper/oil/vinegar/water/sugar/dried-spice families are never tracked), `addManual` (premium; rejects staples), `removeItem`, `markOutOfStock` (the list's one-tap re-add: deletes every row for the ingredient), `confirmWeekly` (v1 depletion: tapped ids deleted, kept rows older than 7 days decay to the "some" state — quantity 0 — with `updatedAt` preserved), `whatCanIMake` (chat tool: ranks active-plan + curated recipes by pantry coverage via the pure `application/pantry/pantry-match.ts`; free tier gets a teaser), and `computeWeekPantrySavings(userId, weekStart)` (Σ estimated EUR of pantry-covered plan lines — the coach writes it into `ChefReview.savedEur` at review time).

**Pantry generation seam** — `apps/api/src/application/pantry/pantry-context.ts` (the provider the household-owned meal-plan loader calls, premium_plan.md §5): `getUseFirstIngredients(userId, limit=5)` returns the top-N OLDEST pantry items in the `MealPlanInput.useFirstIngredients` shape with human `reason` strings; `computeUsedPantryItemsForUser(userId, days)` computes the response `personalisation.usedPantryItems`. `application/pantry/leftovers.ts#pairLeftovers` is the pure "cook once, eat twice" post-processor (pairs 2–3 dinner→next-day-lunch slots, doubled servings, `leftoverOf` labels on the MealSlot Json — no schema change).

### Gym services (application layer) — gym_plan.md §4 (G1-B)

`apps/api/src/application/gym/`. Class services with constructor-injected repositories
(`@chefer/database`: `IExerciseRepository`, `IGymProfileRepository`, `IRoutineRepository`,
`IWorkoutSessionRepository`, `IExerciseProgressionRepository`, `ITrainingPauseRepository`, plus
`IWeightEntryRepository.findInRange` and `IChefProfileRepository.findByUserId` for age). All
progression/weeks/PR/volume logic is the pure engine in `@chefer/utils` (gym) — the services only
load, group, call the engine and persist. `gym-context.ts` loads the per-request context
(equipment inventory, experience, `ageYears` from `ChefProfile.age`, offer state, active
routine); `mappers.ts` owns row ↔ DTO mapping (all dates ISO strings).

- **ExerciseLibraryService** — curated + own custom exercises (archived included, flagged), delta
  by `updatedSince`; custom create/update/archive (owner-only; max 200). Calls
  `ensureExerciseLibrary()` lazily.
- **GymProfileService** — `get`/`save` (partial; a weekly-goal change appends to `goalHistory`
  from the current week; a unit switch with the stock inventory swaps in the new unit's stock
  plates/dumbbells, and any unit or inventory change re-folds every progression via
  `ProgressionService.recompute` so targets are loads the user can make — audit F-GYM-11-2; a
  unit change — and the unit picked in `completeSetup` — is also written to
  `ChefProfile.preferredUnits`, while `syncFromPreferredUnits` applies a global unit change back
  through `save` with `syncPreferences: false`, so Food and Gym share one unit without ping-pong,
  P2-6), `recommend` (pure engine, no DB: `recommendTemplate`,
  `instantiateTemplate`, `estimateDurationMin`, `volumeByGroup`, `validateRoutine`),
  `completeSetup` (ONE transaction via `gymProfileRepository.completeSetup`: profile with
  unit-appropriate default plates/dumbbells — LB users get native lb plates stored as kg —,
  `goalHistory`, the template routine with `plannedWeekdays` applied as the active routine with the
  pointer on day 1, and an engine `initialState` per (exercise, rep bucket) honouring
  `knownWeightsKg`, which is also kept in `offerState` for recomputes; returns a fresh bootstrap).
- **RoutineService** — list/get/templates, `createFromTemplate`, `createBlank`, `duplicate`,
  `archive`, `setActive` (deactivates the others), `save` (full-document replace in one transaction
  with a `version` check; keeps day/slot ids the client sends back; stale version → `CONFLICT` with
  `error.data.conflict = { kind: 'routine', current: RoutineDto }` via `lib/conflict.ts` +
  the tRPC error formatter), `setNextDay`.
- **WorkoutSessionService** — `upsertMany` (the offline sync endpoint, idempotent; per doc:
  foreign id → `rejected: forbidden`; unknown exercise → `rejected: unknown_exercise:<id>`;
  duplicate ids / bad ranges → `rejected`; older `clientUpdatedAt` → `stale`; same
  `clientUpdatedAt` → `applied` with no write; otherwise upsert row + delete/recreate children; a
  COMPLETED routine session moves `Routine.nextDayId` to engine `nextDayIdAfter` **once**,
  claimed atomically through `rotationAppliedAt`; batch processed oldest-first; afterwards ONE
  progression recompute for every exercise touched, whose failure is logged, not thrown), `get`,
  `list` (cursor `"<startedAt ISO>|<id>"`), `discard`, `delete` (both recompute if the session was
  COMPLETED).
- **ProgressionService** — `recompute(userId, exerciseIds)` (engine `exposuresFromSession` over all
  completed sessions → group by rep bucket → `foldHistory` → persist; buckets that lost their
  exposures fold back to the start; overrides consumed by a newer exposure are cleared),
  `forExercises` (engine `prescribe` for today; exercises without a row get an unpersisted start),
  `setOverride`/`clearOverride`, `startDeload` (7-day window in `offerState`), `dismissOffer`.
- **GymBootstrapService** — the one offline read model: profile, active routine, `nextWorkout`
  (engine `buildNextWorkout` for the pointer's day), library (delta + `libraryCursor`),
  progressions with prescriptions, last 12 weeks of completed sessions (engine
  `toSessionSummary`, newest first), `olderBests` (per-exercise max weight / e1RM / Pareto
  frontier of everything before that window, engine `summarizeBests` — live PR badges and the
  summary's PR count seed from it, so a best older than 12 weeks no longer yields false PRs,
  F-GYM-6-1; additive), weeks + streak (engine `summarizeWeeks`), offers (deload via
  `shouldOfferDeload`, stall on `STALL_SUGGEST_SWAP`, comeback after > 8 days, monthly recap on
  days 1–7; dismissals by key), latest bodyweight. `today` is the device-local date from the
  client (server UTC date fallback).
- **GymStatsService** — e1RM series (engine `bestE1rm`; PR flags over all history; 3-session
  rolling-max trend), rep-PR table, weekly muscle volume (`completedSetsByWeek`), consistency, PR
  timeline (`collectPrs`, newest first), monthly recap, bodyweight from `WeightEntry`.
- **TrainingPauseService** — create (≤ 35 days, no overlaps), end (ends today; removes a future one).

### ensureExerciseLibrary (lib)

`apps/api/src/lib/exercise-library/ensure.ts`. Upserts every `EXERCISE_CATALOG` entry by slug,
once per process (shared promise; a failed pass is retried by the next caller). Called at API boot
(`index.ts`, after `listen`) and lazily by the library/routine/profile/bootstrap services. Photo
keys `<slug>-0.webp` / `<slug>-1.webp` are set only for entries with a `freeExerciseDbId` whose file
exists under `apps/api/static/exercises/`, served by Express at `/static/exercises` (7-day cache)
and proxied by Caddy. `ExerciseDto.images` are API-relative paths; clients prefix the API origin.

### FeedbackService (application layer)

`apps/api/src/application/feedback/feedback.service.ts`. Beta feedback channel (ux-fixes-plan.md 1.6) over `IFeedbackRepository` (constructor-injected). One method: `submit(userId, message, path?)` — trims, rejects empty, caps at 2000 chars and stores the row. Write-only from the app; read via Prisma Studio/psql.

### ShoppingListService (application layer)

`apps/api/src/application/shopping-list/shopping-list.service.ts`. Methods: `getForWeek`, `toggleItems`, `addCustomItems`, `removeCustomItem`, `regenerate`, `searchStores`. `getForWeek`/`regenerate` take the full `UserProfile` — the F3 pantry subtraction is entitlement-shaped.

- **Household scaling (P2-3, F-PM-5):** for premium households (`householdService.scalingPortions`) every recipe's ingredients are multiplied by `portions / recipe.servings` (`shared/household-scale.ts`) before aggregation, ON TOP of the P1-1 slot portion (qty = recipe qty × `slotPortion(slot.portion)` × portions/servings) — a single-portion curated recipe ×portions, a recipe already generated for the table ×1 — and the response carries `portions` (additive). Free households keep recipes as written and get no `portions`; clients never divide a single-portion total by the head count. `MealPlanService` sizes `estimatedCost` the same way (`estimatePlanCostEur(days, { portions })`, which then echoes `portions`), so the plan chip equals the list total.
- `getForWeek` — serves the persisted AI list for the plan when one exists; otherwise builds the categorised ingredient list with the pure `aggregate.ts` (`aggregateIngredientLines`: canonical names, unit-family conversion, water/"to taste"/salt-and-pepper lines dropped; single-source lines keep the historical `name|unit` key so check-offs survive). Persisted AI lists pass through `tidyListItems` and the local aisle map on read. Every item gets an `imageUrl` (resolveIngredientImage) and an `estimatedPriceEur` from the ingredient price vocabulary; the list carries `estimatedTotalEur`. Unpriced ingredients wake the IngredientPriceWorker. **F3 subtraction:** every response carries `pantry { entitled, itemCount, savedEur }`; for `pantryPlanning` accounts, pantry-covered derived/AI items get `pantryCovered: true` ("Have it" chip; never for a line ticked this week, and not when the pantry row holds a known smaller amount), leave `estimatedTotalEur`, and `savedEur` = Σ their estimated prices ("saved ~€X this week"); free accounts keep untouched numbers and get the ghost figures only (§6.4). Custom items are never subtracted.
- `toggleItems(checked: true)` also **seeds the pantry** (F3): the checked items' name/qty/unit are upserted as PURCHASE rows via `PantryService.seedFromPurchases` after the check-off transaction commits (a pantry failure never breaks the check-off); unchecking calls `PantryService.revertPurchases`, which removes the matching PURCHASE rows (MANUAL rows are never touched).
- `addCustomItems` / `removeCustomItem` — user-added items (the page's add-input and the chat's `addToShoppingList` tool) stored in the `customItems` overlay column, so they never shadow the derived list and survive an AI regenerate. Same-name+unit re-add replaces; removal also clears the item's check-off key. Both use the SERIALIZABLE+retry pattern (JSON read-modify-write hazard).
- `regenerate` (premium) — calls the AI to consolidate ingredients and **persists** the result in the `ShoppingList` table (keyed by planId) so it survives reloads. `customItems` and their keys are untouched. Check-offs carry over by canonical ingredient name (`carryCheckedKeys` — regenerating used to wipe every tick, F-SHOP-1-5).
- `toggleItems` and `searchStores` take the full `UserProfile` and read the plan's list lines exactly as `getForWeek` serves them (`listLinesForPlan`: AI rows, or derived lines with slot portions + premium household scale, plus custom items) — pantry seeding gets the quantity the list shows, and the store search gets the aggregated list, not each recipe's ingredients once.
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

`apps/api/src/application/recipe/recipe.service.ts`. Methods: `list`, `discover`, `isSaved`, `toggleFavourite`, `toggleUseInNextPlan`, `rate`, `getMyRating`.

- `discover` — Cookbook → Discover (P2-8, F-REC-1-4). Upserts the curated pool (`ensureCuratedRecipes`), filters it with `safeCuratedPools` over the owner's safety prefs merged with household members' (`mergeHouseholdSafety`), then applies the pure `selectDiscoverRecipes` (`discover.ts`: meal type, every-word search over name/cuisine/tags/ingredients, prep + cook ceiling, one row per recipe).

- `rate` — upserts a `MealRating` row (1–5 stars + optional notes).
- `getMyRating` — fetches the user's rating for a given recipe.

### DashboardService (application layer)

`apps/api/src/application/dashboard/dashboard.service.ts`. Method: `summary`.
Aggregates active meal plan, today's meals, recent favourites for the Today page (web `/dashboard`, mobile Today tab). The next meal comes from `resolveTodayMeals` in `@chefer/utils`, which skips meals already logged today (F-PM-10); `nextMeal.recipe.cookTimeMins` is additive.
Takes the viewer (`UserProfile`) for the tier-gated training-day bump
(`PLAN_FEATURES.trainingNutrition`, audit P2-4).

### TrainingNutritionService (application layer) — audit P2-4

`apps/api/src/application/training-nutrition/training-nutrition.service.ts`.
Read-only bridge from the gym to the food side; the rules are pure functions in
`@chefer/utils` (`training-nutrition.ts`). Constructor-injected repositories
(`gymProfile`, `weightEntry`, `routine`, `workoutSession`, `trainingPause`).

- `loadLifter(userId, chefProfile)` → `{ lifterBodyweightKg }` — non-null only
  for a set-up gym profile + a goal with a g/kg rule + known bodyweight (latest
  weight log, else the profile). Users without a goal skip the reads. Passed to
  `resolveDailyTargets(profile, lifterBodyweightKg)` (protein by goal: GAIN 1.8,
  LOSE 2.0, MAINTAIN / EAT_HEALTHIER 1.6 g/kg) by the dashboard, tracker, chat
  context, coach review and both meal-plan generation paths.
- `targetsForDay(userId, profile, { localDate, weekday }, premium)` →
  `{ targets, training }` — base targets plus, for GAIN_MUSCLE lifters, the
  training-day payload (applied for premium, previewed for free). Read by
  `dashboard.summary` and `tracker.getDay` so both show the same numbers;
  `trainingDayFields(training)` shapes the additive response fields.
- `trainingSchedule(userId)` → the active routine's `{ plannedWeekday, name }`.
- `trainingDayFor(userId, localDate, weekday)` → completed workout that day,
  else a planned weekday outside a training pause.

### MealPlanAIService (lib layer)

`apps/api/src/lib/ai/`. Implements `IAIService` — the contract used by `MealPlanService` for all LLM calls.

| File                | Purpose                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`          | `IAIService` interface + all shared types (`MealPlanInput`, `WeekPlanResponse`, …)                                                                                                                                                                                                                                                                                            |
| `mock.ts`           | `MockAIService` — deterministic fixture data, used when `AI_MOCK_ENABLED=true`. **Scenario-steerable** (premium_plan.md §4.5) — see the steering table below                                                                                                                                                                                                                  |
| `friendly-error.ts` | `toFriendlyAiError` — maps upstream AI failures (429/5xx/timeouts) to friendly TRPCErrors; used by the recipe-import + scan services (raw error stays in the server log)                                                                                                                                                                                                      |
| `gemini.ts`         | `GeminiAIService` — live implementation using `GEMINI_MODEL` (default `gemini-2.5-flash`; `GEMINI_FAST_MODEL`, default `gemini-2.5-flash-lite`, for shopping-list consolidation) via `@google/genai`. Uses structured output (`responseSchema`) to guarantee valid JSON. Validates response with the shared Zod schemas.                                                      |
| `openai.ts`         | `OpenAICompatibleAIService` — generic client for any OpenAI-compatible `/chat/completions` endpoint (`AI_SECONDARY_BASE_URL`/`AI_SECONDARY_MODEL`/`AI_SECONDARY_API_KEY`; default Groq free tier, `openai/gpt-oss-120b`). JSON mode + shape instruction, same Zod gates, same shared prompts. **No vision** — photo calls throw.                                              |
| `failover.ts`       | `FailoverAIService` (§5.5 W3-A) — composes Gemini (primary) with the secondary: capacity/quota errors (`isCapacityAiError`) fail over; cheap high-volume calls (chat, ingredient prices, shopping list) go **secondary-first** to conserve Gemini's 20 req/day; **vision (meal-photo scan, photo import) is Gemini-only, no failover**. Logs which provider served each call. |
| `usage.ts`          | `logAiUsage` — one `[ai.usage]` JSON log line per model call (provider, model, op, input/output tokens, ms) from both live providers and the Cloudflare image service. Measures real per-feature token volume before the provider swap (P0-5)                                                                                                                                 |
| `schemas.ts`        | Shared Zod validators for all live-provider responses (+ `parseMealPhotoResponse`) — both clients parse through the same gates                                                                                                                                                                                                                                                |
| `chat-tools.ts`     | Shared chat tool definitions (neutral JSON-Schema subset, converted per provider) + `dispatchChatTool` + the word-chunk `streamText` helper                                                                                                                                                                                                                                   |
| `prompts.ts`        | System prompts + user prompt builders for meal plan generation, recipe swap, chat — shared by BOTH live providers                                                                                                                                                                                                                                                             |
| `index.ts`          | Factory — selects provider via `AI_MOCK_ENABLED` + `AI_PROVIDER`; wraps Gemini in `FailoverAIService` when `AI_SECONDARY_API_KEY` is set (unset = failover stays dark)                                                                                                                                                                                                        |
| `fixtures/`         | Hardcoded week plan + swap recipes used by `MockAIService`                                                                                                                                                                                                                                                                                                                    |

**Recipe images** sit behind `IRecipeImageService` (`lib/image-gen/`): `IMAGE_PROVIDER=pollinations` (default, anonymous URL) or `cloudflare` (`CloudflareImageService`: Workers AI `CF_IMAGE_MODEL`, default flux-1-schnell; bytes uploaded to Cloudinary). The recipe-image worker only calls `generateAndUploadRecipeImage`.

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

| Procedure                           | Access    | Type     | Input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `user.me`                           | Protected | Query    | — (additive 2026-09-26: returns `aiDataConsentAt`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `user.exportData`                   | Protected | Query    | — (everything stored about the caller, as JSON: profile, food and gym data, feedback)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `user.grantAiDataConsent`           | Protected | Mutation | — records `aiDataConsentAt = now` (idempotent: keeps the first timestamp); returns `{ aiDataConsentAt }`. Called by the clients' AI consent sheet "Allow" and the Profile "AI & your data" switch (App Store 5.1.2(i))                                                                                                                                                                                                                                                                                                           |
| `user.revokeAiDataConsent`          | Protected | Mutation | — clears `aiDataConsentAt`; the next AI action asks again. Not enforced server-side                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `user.deleteSelf`                   | Protected | Mutation | `{ password, confirm: 'DELETE' }` — deletes the caller's account and ALL their data via `deleteAccount()` (one transaction: shopping lists, own recipes, custom ingredients, reset tokens, workouts/routines, every session, then the cascading user row); clears the session cookie; the last admin is refused                                                                                                                                                                                                                  |
| `user.getById`                      | Admin     | Query    | `{ id: cuid }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `user.list`                         | Admin     | Query    | `{ page, limit, search?, role?, sortBy, sortOrder }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `user.create`                       | Admin     | Mutation | `{ email, name?, password, role? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `user.update`                       | Protected | Mutation | `{ id, name?, email?, role?, image? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `user.delete`                       | Admin     | Mutation | `{ id: cuid }` — same full purge as `deleteSelf` (`deleteAccount()`); cannot delete self                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `user.updateProfile`                | Protected | Mutation | `{ name?, image? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `user.upgradePlan`                  | Protected | Mutation | — soft-paywall upgrade (PW-2): sets `planTier = PREMIUM`; free during the beta, Stripe (P2-1) later replaces only how the flag is set                                                                                                                                                                                                                                                                                                                                                                                            |
| `user.downgradePlan`                | Protected | Mutation | — self-service return to FREE (PW-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `user.setPlanTier`                  | Admin     | Mutation | `{ userId, planTier }` — tier management behind `/admin/users` (PW-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `user.aiCallsToday`                 | Admin     | Query    | `{ userIds[] }` — today's AI call counts per user for the admin page                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `auth.register`                     | Public    | Mutation | `{ email, password, firstName, lastName, region? }` — with `x-chefer-client: mobile` the response also carries `session: { token, expires }` for Bearer auth. `region` (ISO-3166 alpha-2) seeds `ChefProfile.preferredUnits` + `deliveryCurrency` via `defaultsForRegion` (P2-6); older apps omit it and get METRIC + EUR. Emails the address-confirmation link in the background (P2-5)                                                                                                                                         |
| `auth.login`                        | Public    | Mutation | `{ email, password }` — with `x-chefer-client: mobile` the response also carries `session: { token, expires }` for Bearer auth                                                                                                                                                                                                                                                                                                                                                                                                   |
| `auth.logout`                       | Public    | Mutation | — deletes the session resolved from cookie **or** Bearer token                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `auth.requestPasswordReset`         | Public    | Mutation | `{ email }` — enumeration-safe (always succeeds); rate-limited per IP (5/15 min) and per address (3/h)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `auth.resetPassword`                | Public    | Mutation | `{ token, password }` — single-use 1 h token (sha256-stored); invalidates all sessions; also confirms the address (`emailVerified`) if it was not yet (P2-5)                                                                                                                                                                                                                                                                                                                                                                     |
| `notifications.getEmailPreferences` | Protected | Query    | — `{ weekReady, weeklyRecap, emailConfirmed, email }`: the Monday / Sunday email switches and whether weekly emails can be sent (P2-5)                                                                                                                                                                                                                                                                                                                                                                                           |
| `notifications.setEmailPreferences` | Protected | Mutation | `{ weekReady?, weeklyRecap? }` → same shape as `getEmailPreferences`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `notifications.resendConfirmation`  | Protected | Mutation | — emails the signed 7-day confirmation link → `{ alreadyConfirmed }`; 3/h per user                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `notifications.confirmEmail`        | Public    | Mutation | `{ token }` — consumes the confirmation link (web `/verify-email`); BAD_REQUEST when invalid, expired or for a changed address; 20/15 min per IP                                                                                                                                                                                                                                                                                                                                                                                 |
| `notifications.unsubscribe`         | Public    | Mutation | `{ token, resubscribe? }` — the emails' unsubscribe link (web `/unsubscribe`), no login: the signed token names the user and the scope (Monday, Sunday or both). → `{ scope, weekReady, weeklyRecap }`, never the address; 20/15 min per IP                                                                                                                                                                                                                                                                                      |
| `auth.me`                           | Protected | Query    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `preferences.hasProfile`            | Protected | Query    | — true once a ChefProfile with a **goal** exists (a bare row from registration defaults or display toggles does not count, P2-6)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `preferences.get`                   | Protected | Query    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `preferences.setup`                 | Premium   | Mutation | `{ goal, biologicalSex, age, heightCm, weightKg, activityLevel, cuisinePreferences, dietaryRestrictions, allergies, dislikedIngredients, mealsPerDay, servingSize? }` — `servingSize` optional since P2-3 (legacy; a value > 1 becomes household members)                                                                                                                                                                                                                                                                        |
| `preferences.updateSafety`          | Protected | Mutation | `{ dietaryRestrictions, allergies, dislikedIngredients }` — free for every account (P1-2); filters free curated plans and feeds premium AI generation                                                                                                                                                                                                                                                                                                                                                                            |
| `preferences.setAutoPlanWeekly`     | Protected | Mutation | `{ enabled }` — "Plan my week every Sunday" opt-out (F-PLAN-4-3); premium gets an AI week, free a curated one (P2-5)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `preferences.setDisplayPreferences` | Protected | Mutation | `{ preferredUnits?: METRIC\|IMPERIAL, currency?: EUR\|USD\|GBP\|RON }` (at least one; `setDisplayPreferencesInputSchema` in `@chefer/types`) → `{ preferredUnits, currency }`. Free on every tier (P2-6, F-DASH-3-2). A units change moves `GymProfile.unit` (KG↔METRIC, LB↔IMPERIAL) through `gymProfileService.save`, so the stock rack swaps and progressions re-fold                                                                                                                                                         |
| `preferences.updateTargets`         | Premium   | Mutation | Setup fields minus the safety arrays, all optional + `deliveryAddress?`, `weeklyBudgetEur?` (EUR). Still accepts `deliveryCurrency?` / `preferredUnits?` for shipped app builds (a units change also syncs the gym unit); current clients use `setDisplayPreferences`                                                                                                                                                                                                                                                            |
| `preferences.saveProfileBasics`     | Protected | Mutation | `{ goal?, biologicalSex?, age?, heightCm?, weightKg?, activityLevel? }` — goal + body metrics storable on every tier (ux-fixes-plan.md 3.1) so the dashboard target is real; consuming them for AI generation stays premium                                                                                                                                                                                                                                                                                                      |
| `mealPlan.generate`                 | Protected | Mutation | `{ weekOffset?: number }` — 0=current week (default), 1=next week; min 0, max 52. Premium: AI plan learning from pins+ratings, response carries `personalisation` (P1-1); free: safety-filtered curated pool                                                                                                                                                                                                                                                                                                                     |
| `mealPlan.getActive`                | Protected | Query    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mealPlan.getRecipe`                | Protected | Query    | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `mealPlan.swapRecipe`               | Protected | Mutation | `{ planId, dayOfWeek, mealType, slotIndex?, reason? }` — premium: AI alternative (daily swap quota); free: curated alternative. `slotIndex` (optional, additive) is the slot's index in `day.meals`: a curated day can hold two snacks, so web and mobile send it; it must point at a slot of `mealType` (`BAD_REQUEST` otherwise, checked before any AI call). Without it (shipped app builds) the first slot of `mealType` is used. Only that one slot is rewritten                                                            |
| `mealPlan.replaceRecipe`            | Protected | Mutation | `{ planId, dayOfWeek, mealType, slotIndex?, recipeId }` — any tier, no quota: puts a recipe the user may see into one slot (`NOT_FOUND` for another user's private recipe). `slotIndex` as for `swapRecipe`; rebalance undo sends it too                                                                                                                                                                                                                                                                                         |
| `mealPlan.list`                     | Protected | Query    | `{ limit?, offset? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `mealPlan.saveAsTemplate`           | Protected | Mutation | `{ planId, name }` — saves a plan as a named week template (max 4 → CONFLICT)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mealPlan.listTemplates`            | Protected | Query    | — week templates with preview names + `isFollowed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `mealPlan.renameTemplate`           | Protected | Mutation | `{ templateId, name }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `mealPlan.deleteTemplate`           | Protected | Mutation | `{ templateId }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `mealPlan.followTemplate`           | Protected | Mutation | `{ templateId, weekOffset: 0\|1 }` — marks followed (carry-forward clones it) and applies it to that week                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `mealPlan.unfollowTemplate`         | Protected | Mutation | — carry-forward reverts to the latest plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `mealPlan.restore`                  | Protected | Mutation | `{ planId: string }` — re-creates the plan as the newest row for its week (archives only that week), carrying its shopping ticks and custom items                                                                                                                                                                                                                                                                                                                                                                                |
| `mealPlan.getById`                  | Protected | Query    | `{ planId: string }`. Every plan read (`getActive`/`getForWeek`/`getById`/`generate`/`restore`) returns additive P1-1 fields: `days[].meals[].portion?`, `days[].proteinGapG?`, `proteinTarget?`                                                                                                                                                                                                                                                                                                                                 |
| `recipe.aiImageUrl`                 | Protected | Query    | `{ name, cuisineType }` — deterministic Pollinations image URL for the create-recipe form                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ingredients.search`                | Protected | Query    | `{ query }` — catalog search (global vocabulary + own custom ingredients)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ingredients.units`                 | Protected | Query    | — canonical unit list for recipe forms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ingredients.createCustom`          | Protected | Mutation | `{ name, imageUrl?, generateAiImage?, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g?, gramsPerPiece? }`                                                                                                                                                                                                                                                                                                                                                                                                |
| `ingredients.list`                  | Protected | Query    | `{ search?, mineOnly?, limit?, offset? }` — full-detail catalog rows with per-row `canEdit`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ingredients.update`                | Protected | Mutation | Macros/image/prices — own custom rows; global rows only when ADMIN (`source: 'ADMIN'`, exempt from AI refresh)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ingredients.delete`                | Protected | Mutation | `{ name }` — own custom rows; admins may delete global rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ingredients.computeNutrition`      | Protected | Query    | `{ ingredients[], servings }` — per-serving NutritionInfo + unmatched ingredient names                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ingredients.estimateNutrition`     | Protected | Mutation | `{ name }` — per-100g macros + gramsPerPiece + baseline prices for one ingredient; catalog rows answer free, unknown names cost one AI call (logged `INGREDIENT_PRICES`)                                                                                                                                                                                                                                                                                                                                                         |
| `recipe.list`                       | Protected | Query    | `{ search?, savedOnly?, myRecipesOnly?, cursor?, limit? }` — rows carry `isFavourite` for the heart toggle                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `recipe.discover`                   | Protected | Query    | `{ mealType?, search?, maxTotalMins?, limit? }` — Cookbook → Discover (F-REC-1-4): the curated pool filtered by the user's and household's allergies/restrictions, rows carry `mealType` + `isFavourite`; every tier, no AI                                                                                                                                                                                                                                                                                                      |
| `recipe.isSaved`                    | Protected | Query    | `{ recipeId }` — returns `{ isSaved, useInNextPlan }` (pin state powers the recipe-page toggle, P1-1)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `recipe.toggleFavourite`            | Protected | Mutation | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `recipe.toggleUseInNextPlan`        | Protected | Mutation | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `recipe.rate`                       | Protected | Mutation | `{ recipeId: string, rating: 1-5, notes?: string }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `recipe.getMyRating`                | Protected | Query    | `{ recipeId: string }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `recipe.importPreview`              | Protected | Mutation | `{ url? \| text? \| imageBase64?+mimeType? }` (exactly one) — F5 extract + Cheferize preview; metered `recipeImportsPerDay` (FREE 1/day ghost preview); returns `{ via, original, adapted, changes, safety, macroCheck, sourceUrl, ogImageUrl }`                                                                                                                                                                                                                                                                                 |
| `recipe.importSave`                 | Premium   | Mutation | `{ recipe, variant: original\|adapted, sourceUrl?, ogImageUrl? }` — saves as `source: MANUAL` + `sourceUrl`; adapted variant re-validated by the P1-2 matcher (fail closed); og:image HEAD-checked else Pollinations                                                                                                                                                                                                                                                                                                             |
| `shoppingList.getForWeek`           | Protected | Query    | `{ weekOffset?: number }` — items include `estimatedPriceEur` + list-level `estimatedTotalEur`; serves the persisted AI list when one exists; response carries `checkedKeys` (P1-5) + `pantry { entitled, itemCount, savedEur }` and per-item `pantryCovered` (F3 — covered items leave the total for pantryPlanning accounts); `fromDayOfWeek` when the plan was made mid-week (list covers that day on, F-PM-3); `portions` when a premium household's list is scaled to the table (P2-3; composes with the P1-1 slot portion) |
| `shoppingList.toggleItems`          | Protected | Mutation | `{ planId, keys[], checked }` — synced check-off (P1-5): per-key add/remove under a SERIALIZABLE transaction with retry, so rapid/concurrent toggles merge instead of clobbering. `checked: true` also seeds the pantry from the checked items at the quantity the list shows (F3, staples excluded)                                                                                                                                                                                                                             |
| `pantry.list`                       | Protected | Query    | — all PantryItems oldest-first (`quantity: null` in the DTO = the "some" state); free tier reads it for the read-only page (F3)                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pantry.addItem`                    | Premium   | Mutation | `{ name, quantity?, unit }` — manual MANUAL row; staples rejected (F3)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pantry.removeItem`                 | Premium   | Mutation | `{ id }` — deletes one row (F3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pantry.markOutOfStock`             | Premium   | Mutation | `{ ingredientName }` — "I'm out of it": clears every row for the ingredient; the shopping list's one-tap re-add (F3)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pantry.confirmWeekly`              | Premium   | Mutation | `{ clearIds[] }` — weekly "still have these?": tapped rows deleted, kept rows older than 7 days decay to "some" (F3)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `shoppingList.addCustomItems`       | Protected | Mutation | `{ planId, items: [{ name, quantity?, unit? }] }` — user-added items into the customItems overlay (also written by the chat `addToShoppingList` tool)                                                                                                                                                                                                                                                                                                                                                                            |
| `shoppingList.removeCustomItem`     | Protected | Mutation | `{ planId, key }` — removes one user-added item and its check-off state                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `shoppingList.regenerate`           | Premium   | Mutation | `{ weekOffset?: number }` — AI-consolidates the list and persists it (ShoppingList table); customItems survive                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shoppingList.searchStores`         | Protected | Query    | `{ planId, lat?, lng?, deliveryAddress? }` — dormant (no UI); searches stores for the plan's aggregated list lines (portions + household scale)                                                                                                                                                                                                                                                                                                                                                                                  |
| `dashboard.summary`                 | Protected | Query    | `{ localDate?: YYYY-MM-DD, localHour?: 0–23 }` (optional) — the client's day and hour decide "today" and the next meal; server time if omitted. Lifters also get optional `nutrition.trainingDay` and (premium, training day) `nutrition.adjustedTargets` (P2-4); the existing target fields stay the base targets. Planned kcal/macros count slot portions; `nextMeal.portion?` (P1-1)                                                                                                                                          |
| `household.list`                    | Protected | Query    | — all of the user's household members (F2); converts a legacy `servingSize > 1` into placeholder members first (P2-3)                                                                                                                                                                                                                                                                                                                                                                                                            |
| `household.add`                     | Protected | Mutation | `{ name, portionFactor?, isKid?, allergies?, dietaryRestrictions?, dislikedIngredients? }` (`householdMemberFieldsSchema`, `@chefer/types`) — **every tier since P2-3** (member safety is free); capped by `PLAN_FEATURES.householdMembers` (5) race-free                                                                                                                                                                                                                                                                        |
| `household.update`                  | Protected | Mutation | Same fields, all optional + `{ id: cuid }` — ownership-scoped; every tier since P2-3                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `household.remove`                  | Protected | Mutation | `{ id: cuid }` — protected so a downgraded user can still remove members                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `coach.currentReview`               | Protected | Query    | — latest weekly chef review while fresh (≤14 days), shaped by entitlement (F1): `full` for adaptiveCoaching, `teaser` (first line only) for free, `none` + eligibility counts otherwise                                                                                                                                                                                                                                                                                                                                          |
| `tracker.getDay`                    | Protected | Query    | `{ date: YYYY-MM-DD }` — planned meals + the day's log (incl. custom entries) + resolved targets; planned meals carry `portion?` (P1-1, macros stay per serving). GAIN_MUSCLE lifters also get optional `trainingDay` and (premium, training day) `adjustedTargets` — same as `dashboard.summary` (P2-4 follow-up); `targets` stays the base                                                                                                                                                                                     |
| `tracker.upsertDay`                 | Protected | Mutation | `{ date, loggedMeals[] (0–50, bounded macros) }` — entries are `recipeId` XOR `custom { name, estimatedBy }`; MERGES: replaces the planned-recipe entries the client manages, keeps custom and off-plan entries (echoed custom entries are ignored); returns `{ log, rebalance }` (F4 — rebalance non-null only when future meals were swapped)                                                                                                                                                                                  |
| `tracker.logRecipe`                 | Protected | Mutation | `{ date, recipeId, mealType, portionMultiplier? }` — cook-mode "Made it!": atomic, idempotent append of one recipe (macros from the stored recipe; recipe must be visible to the caller); returns `{ log, rebalance }`                                                                                                                                                                                                                                                                                                           |
| `tracker.logCustomMeal`             | Protected | Mutation | `{ date, name, estimatedBy: vision\|manual, mealType, kcal, protein?, carbs?, fat? }` — appends one custom entry (F4; manual quick-adds are free); returns `{ log, rebalance }`                                                                                                                                                                                                                                                                                                                                                  |
| `tracker.deleteCustomMeal`          | Protected | Mutation | `{ date, entryIndex }` — removes one custom entry by its index in the day's `loggedMeals` (F4)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tracker.weeklySummary`             | Protected | Query    | — trailing 7 days of totals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tracker.monthlySummary`            | Protected | Query    | — trailing 28 days of totals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tracker.logWeight`                 | Protected | Mutation | `{ weightKg (20–400), date? (not in the future) }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tracker.weightHistory`             | Protected | Query    | `{ days? }` (default 90)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `tracker.updateWeight`              | Protected | Mutation | `{ id, weightKg (20–400), date? }` — owner-scoped, NOT_FOUND otherwise                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tracker.deleteWeight`              | Protected | Mutation | `{ id }` — owner-scoped, NOT_FOUND otherwise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `feedback.submit`                   | Protected | Mutation | `{ message: 1-2000 chars, path? }` — beta feedback channel; stores a Feedback row (ux-fixes-plan.md 1.6)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `gym.bootstrap`                     | Protected | Query    | `{ librarySince?, today? }` → `GymBootstrap`: the phone's persisted offline read model (profile, routine, next workout, library delta + `libraryCursor`, progressions, 12 weeks of sessions, weeks/streak, offers, `activePause`). `today` = device date. All `gym.*` are free (D9). `activePause` (G4-A, additive) is `{ id, startDate, endDate, reason }                                                                                                                                                                       | null`— the pause covering`today`, so a client can call `gym.pause.end` on it without browser-local bookkeeping |
| `gym.library.list`                  | Protected | Query    | `{ updatedSince? }` — curated + own custom exercises (archived included, flagged); `images` are API-relative `/static/exercises/…` paths                                                                                                                                                                                                                                                                                                                                                                                         |
| `gym.library.get`                   | Protected | Query    | `{ id }` — curated or own custom, else NOT_FOUND                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `gym.library.createCustom`          | Protected | Mutation | `customExerciseInputSchema` — max 200 per user; rate-limited 30/h per user                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `gym.library.updateCustom`          | Protected | Mutation | `{ id, exercise }` — owner-only (NOT_FOUND otherwise)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `gym.library.archiveCustom`         | Protected | Mutation | `{ id }` — owner-only; archived, never deleted (history references it)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `gym.profile.get`                   | Protected | Query    | — → `GymProfileDto \| null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `gym.profile.save`                  | Protected | Mutation | `saveGymProfileInputSchema` (partial; PRECONDITION_FAILED before setup; goal change → `goalHistory`)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `gym.profile.recommend`             | Protected | Query    | `{ days, experience, equipmentAccess }` → template key, reason, alternatives, preview, volume, hints (pure engine, no DB)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gym.profile.completeSetup`         | Protected | Mutation | `completeSetupInputSchema` → `GymBootstrap`; ONE transaction: profile + active routine + initial progressions; 20/h per user                                                                                                                                                                                                                                                                                                                                                                                                     |
| `gym.routine.list`                  | Protected | Query    | — → `RoutineListItemDto[]` (active first)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gym.routine.get`                   | Protected | Query    | `{ id }` → `RoutineDto` (own only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `gym.routine.templates`             | Protected | Query    | — → `TemplateSummaryDto[]` (static program templates)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `gym.routine.create*`               | Protected | Mutation | `createFromTemplate { templateKey, setActive }` (engine `instantiateTemplate` with the profile's equipment) / `createBlank { name, days }` — max 30 unarchived routines                                                                                                                                                                                                                                                                                                                                                          |
| `gym.routine.duplicate`             | Protected | Mutation | `{ id }` → the copy (inactive)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `gym.routine.archive`               | Protected | Mutation | `{ id }` — also deactivates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `gym.routine.setActive`             | Protected | Mutation | `{ id }` — deactivates the others (and unarchives)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `gym.routine.save`                  | Protected | Mutation | `{ routine: RoutineDoc, expectedVersion }` — full-document replace; stale version → `CONFLICT` with `error.data.conflict = { kind: 'routine', current: RoutineDto }`                                                                                                                                                                                                                                                                                                                                                             |
| `gym.routine.setNextDay`            | Protected | Mutation | `{ routineId, dayId }` — rotation pointer ("do another day" / "skip"); never bumps `version`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `gym.session.upsertMany`            | Protected | Mutation | `{ docs: WorkoutSessionDoc[1..20] }` → `{ results: { id, status: applied \| stale \| rejected, reason? }[] }` — idempotent offline sync; 60/min per user                                                                                                                                                                                                                                                                                                                                                                         |
| `gym.session.get`                   | Protected | Query    | `{ id }` → `WorkoutSessionDoc` (own only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gym.session.list`                  | Protected | Query    | `{ cursor?, limit }` → `{ items: SessionSummaryDto[], nextCursor }` (newest first, DISCARDED excluded)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `gym.session.discard`               | Protected | Mutation | `{ id }` — re-folds progressions if it was COMPLETED; rotation never rewound                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `gym.session.delete`                | Protected | Mutation | `{ id }` — re-folds the session's exercises if it was COMPLETED                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `gym.progression.forExercises`      | Protected | Query    | `{ exerciseIds[≤60] }` → `ProgressionDto[]` (state + override + prescription for today)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `gym.progression.setOverride`       | Protected | Mutation | `{ exerciseId, repBucket, weightKg, reps[] }` → `ProgressionDto` (D5c; applies once)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `gym.progression.clearOverride`     | Protected | Mutation | `{ exerciseId, repBucket }` → `ProgressionDto`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `gym.progression.startDeload`       | Protected | Mutation | — next 7 days of prescriptions are deloads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `gym.progression.dismissOffer`      | Protected | Mutation | `{ kind, key }` — remembered by offer key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gym.stats.*`                       | Protected | Query    | `e1rm { exerciseId, range }` / `repPrs { exerciseId }` / `muscleVolume { weeks }` / `consistency { weeks }` / `prs { exerciseId?, limit }` / `monthlyRecap { month }` / `bodyweight { range, today? }` — from COMPLETED sessions via the engine                                                                                                                                                                                                                                                                                  |
| `gym.pause.create`                  | Protected | Mutation | `{ startDate, endDate, reason }` — ≤ 35 days; overlap → CONFLICT                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `gym.pause.end`                     | Protected | Mutation | `{ id }` — ends today (a future pause is removed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `gym.export.csv`                    | Protected | Query    | — → `{ filename, csv }`; one row per set from COMPLETED sessions, oldest first, capped at 50k rows; 5/min per user (research §5.2 #5, "offer CSV export of the full history from day one")                                                                                                                                                                                                                                                                                                                                       |
| `preferences.setIntent`             | Protected | Mutation | `{ intent: EAT_BETTER\|HOUSEHOLD\|TRAIN }` (`setOnboardingIntentInputSchema` in `@chefer/types`) → `{ intent }`. Onboarding step 0 (P2-3, F-PM-6), every tier; stored on `ChefProfile.onboardingIntent`, never counts as a profile                                                                                                                                                                                                                                                                                               |

### Middleware Stack

```
publicProcedure     → timingMiddleware
protectedProcedure  → timingMiddleware → isAuthenticated
premiumProcedure    → timingMiddleware → isPremium   (PREMIUM tier or ADMIN role)
adminProcedure      → timingMiddleware → isAuthenticated → isAdmin
```

---

## 9. Authentication & Authorization

**Current state:** DB-backed session authentication, presented over two transports that
carry the **same** `Session.sessionToken`:

| Client                 | Credential transport                                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (`apps/web`)       | HttpOnly cookie `chefer_session` (set by `auth.login/register`)                                                                                                                                                |
| Mobile (`apps/mobile`) | `Authorization: Bearer <sessionToken>` — the token is returned in the `auth.login`/`auth.register` response body **only** when the request carries `x-chefer-client: mobile`; the app stores it in SecureStore |

All resolution goes through `resolveRequestAuth()` in `apps/api/src/lib/session-auth.ts`
(cookie first, Bearer fallback), shared by the tRPC `createContext`, `requireAuth`, and
the four non-tRPC Express routers (`/api/chat`, `/api/scan-meal`, `/api/uploads`,
`/api/recipe-images`) — so every endpoint accepts both transports. The token in bodies is
never sent to browsers; CORS `allowedHeaders` includes `x-chefer-client`.

The `createContext` function in `apps/api/src/interfaces/http/middleware/auth.middleware.ts`:

1. Resolves the user via `resolveRequestAuth()` (session cookie, then Bearer token)
2. Hydrates `ctx.user` (null if unauthenticated) and `ctx.isMobileClient`

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

**Resource visibility** (ownership checks inside services, per Architecture Rule 5):

- **Recipes** — `apps/api/src/application/recipe/recipe-access.ts`. `MANUAL` recipes (written or imported by a user) are private to their creator; `AI` and `CURATED` recipes are open. A recipe already in one of the caller's own plans stays visible whoever made it (`mealPlanRepository.isRecipeInUserPlans`). `mealPlan.getRecipe`, `mealPlan.replaceRecipe`, `recipe.toggleFavourite` (on save), `recipe.toggleUseInNextPlan` (on pin), `recipe.rate` and pinned-favourite placement in `generate` all apply it and answer `NOT_FOUND` for someone else's private recipe; the Saved list never returns one (audit 2026-09-25, F-REC-2-1/F-REC-2-2).
- **AI recipe ids are server-minted** — `application/meal-plan/recipe-ids.ts` replaces LLM slug ids with UUIDs before persisting, so a generated recipe can never land on (and inherit the ingredients of) an existing row (F-PLAN-1-1).
- **Users** — `user.getById` is `adminProcedure`; users read themselves via `user.me` (F-ADM-1-1).
- **Self-serve account deletion (App Store 5.1.1(v))** — `user.deleteSelf` re-verifies the password (`UserService.verifyPassword`, same bcrypt check as login) and runs `application/user/account-data.service.ts` `deleteAccount()`: every row that does not cascade (shopping lists keyed by planId, own MANUAL recipes, private custom ingredients, `reset:<email>` tokens) plus workouts/routines (RESTRICT exercise FKs) go first, then the user row, whose cascade removes every `Session` — signed out on all devices. AI-generated recipe rows are shared content and stay (owner nulled). Household members are per-account extra eaters, so they cascade — there is no multi-account household to hand over. The admin `user.delete` uses the same purge.
- **AI data consent (App Store 5.1.2(i))** — `User.aiDataConsentAt`; both clients gate every AI action through a consent guard (web `features/ai-consent/AiConsentProvider.tsx` in the dashboard layout; mobile `src/features/ai-consent/ai-consent-provider.tsx` in the root layout + an `AiConsentHost` nested in each Sheet that can start an AI action, because iOS can't present a Modal from a controller already presenting one). Copy and when-to-ask logic are shared: `AI_CONSENT_COPY` / `AI_CONSENT_FEATURE_DATA` (`@chefer/types`), `needsAiDataConsent` / `aiConsentRequiredFor` (`@chefer/utils`; free curated generation/swaps never ask). Deliberately **not** enforced server-side: the weekly auto-plan and coach-review workers keep running.
- **Hardening (audit P0-10, 2026-09-25)** — per-IP auth limits key on `req.ip` (`trust proxy` = 1 hop; prod only exposes Caddy, which sets `X-Forwarded-For` itself); login always runs one bcrypt compare (no account-existence timing oracle); changing your own email via `user.update` requires `currentPassword`; `image` must be `https://`; admins can't change their own role or demote the last admin; `user.create` stores the password hash; unexpected `INTERNAL_SERVER_ERROR`s are masked by the tRPC `errorFormatter` (raw error stays in logs/Sentry); `/api/uploads/image` checks the file signature against the declared type and caps 60 uploads per user per day. Web responses add HSTS and a minimal CSP (`frame-ancestors`, `object-src`, `base-uri`, `form-action`) and drop `X-Powered-By`. Known gap: server-rendered tRPC calls from the web container still share one per-IP bucket (F-X-4-9).

**Notes:**

- The database schema is **NextAuth.js compatible** (Account, Session, VerificationToken models exist)
- Password hashing in the seed uses SHA-256 — replace with **bcrypt or argon2** before production
- JWT infrastructure (secret + refresh secret) is wired in env but full JWT flow is not yet implemented

---

## 10. Environment Variables

### `apps/api/.env`

| Variable                   | Required | Default                              | Description                                                                                                                                                              |
| -------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                 | No       | development                          | Runtime environment                                                                                                                                                      |
| `PORT`                     | No       | 3001                                 | HTTP listen port                                                                                                                                                         |
| `HOST`                     | No       | 0.0.0.0                              | HTTP listen host                                                                                                                                                         |
| `DATABASE_URL`             | **Yes**  | —                                    | PostgreSQL connection string                                                                                                                                             |
| `JWT_SECRET`               | **Yes**  | —                                    | Min 32 chars                                                                                                                                                             |
| `JWT_EXPIRES_IN`           | No       | 15m                                  | Access token TTL                                                                                                                                                         |
| `REFRESH_TOKEN_SECRET`     | **Yes**  | —                                    | Min 32 chars                                                                                                                                                             |
| `REFRESH_TOKEN_EXPIRES_IN` | No       | 30d                                  | Refresh token TTL                                                                                                                                                        |
| `CORS_ORIGINS`             | No       | http://localhost:3000                | Comma-separated allowed origins                                                                                                                                          |
| `REDIS_URL`                | No       | —                                    | Redis connection string                                                                                                                                                  |
| `RATE_LIMIT_MAX`           | No       | 100                                  | Max requests per window                                                                                                                                                  |
| `RATE_LIMIT_WINDOW_MS`     | No       | 60000                                | Rate limit window (ms)                                                                                                                                                   |
| `AI_MOCK_ENABLED`          | No       | true                                 | `true` = fixture data; `false` = real AI provider                                                                                                                        |
| `AI_PROVIDER`              | No       | gemini                               | Active provider: `gemini` (primary, optional failover) \| `openai` (OpenAI-compatible client standalone)                                                                 |
| `GEMINI_API_KEY`           | No       | —                                    | Required when `AI_PROVIDER=gemini` + mock disabled                                                                                                                       |
| `GEMINI_MODEL`             | No       | gemini-2.5-flash                     | Main Gemini model id (generation, swaps, chat, review)                                                                                                                   |
| `GEMINI_FAST_MODEL`        | No       | gemini-2.5-flash-lite                | Cheaper Gemini model for mechanical calls (shopping-list consolidation)                                                                                                  |
| `AI_SECONDARY_API_KEY`     | No       | —                                    | Enables the OpenAI-compatible failover secondary (§5.5 W3-A) when set with `AI_PROVIDER=gemini`; required for `AI_PROVIDER=openai`. Unset = Gemini alone (failover dark) |
| `AI_SECONDARY_BASE_URL`    | No       | https://api.groq.com/openai/v1       | OpenAI-compatible endpoint of the secondary (no trailing slash)                                                                                                          |
| `AI_SECONDARY_MODEL`       | No       | openai/gpt-oss-120b                  | Model id at the secondary endpoint. The default has **no vision** — photo calls stay Gemini-only                                                                         |
| `GROCERY_AI_MOCK_ENABLED`  | No       | true                                 | Use fixture grocery store data (no Claude call)                                                                                                                          |
| `UNSPLASH_ACCESS_KEY`      | No       | —                                    | Unsplash API key for ingredient images; falls back to category images without it. Get a free key at https://unsplash.com/developers                                      |
| `IMAGE_PROVIDER`           | No       | pollinations                         | Recipe image provider: `pollinations` or `cloudflare` (needs `CF_ACCOUNT_ID` + `CF_API_TOKEN`; uploads to Cloudinary)                                                    |
| `CF_ACCOUNT_ID`            | No       | —                                    | Cloudflare account id (Workers AI), required when `IMAGE_PROVIDER=cloudflare`                                                                                            |
| `CF_API_TOKEN`             | No       | —                                    | Cloudflare API token with the Workers AI permission                                                                                                                      |
| `CF_IMAGE_MODEL`           | No       | @cf/black-forest-labs/flux-1-schnell | Workers AI text-to-image model id                                                                                                                                        |
| `EMAIL_MOCK_ENABLED`       | No       | true                                 | Mock logs emails (incl. reset links) to the console instead of sending                                                                                                   |
| `RESEND_API_KEY`           | No       | —                                    | Required when `EMAIL_MOCK_ENABLED=false`                                                                                                                                 |
| `EMAIL_FROM`               | No       | Chefer <onboarding@resend.dev>       | Sender address; shared Resend sender only delivers to the account owner — use a verified domain for real users                                                           |
| `APP_URL`                  | No       | http://localhost:3000                | Base URL used in emailed links (password reset, weekly emails, unsubscribe, email confirmation)                                                                          |
| `EMAIL_TOKEN_SECRET`       | No       | from `JWT_SECRET`                    | ≥ 32 chars; signs unsubscribe + confirmation links (P2-5). Set in prod so a `JWT_SECRET` rotation keeps old links                                                        |

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

### `apps/mobile/.env`

Validated by Zod in `apps/mobile/src/lib/env.ts`. `EXPO_PUBLIC_*` vars are
inlined at bundle time by Expo.

| Variable                 | Required | Default                                                            | Description                                                                                                                                                         |
| ------------------------ | -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`    | No       | iOS sim: http://localhost:3001 · Android emu: http://10.0.2.2:3001 | API base URL. **Physical devices must set this** to the host's LAN address                                                                                          |
| `EXPO_PUBLIC_SENTRY_DSN` | No       | —                                                                  | Sentry error reporting (disabled when unset; wiring lands with plan task M1-6)                                                                                      |
| `EXPO_APPLE_TEAM_ID`     | No       | —                                                                  | Apple team for signing local device builds (`expo run:ios --device`); read by `app.config.js`, not the app — simulator and EAS builds don't need it                 |
| `APP_VARIANT`            | No       | `development`                                                      | Build-time only, set by the scripts, not in `.env`: `development` \| `production` (§4.3). `production` refuses to build unless `EXPO_PUBLIC_API_URL` is `https://…` |

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

### Mobile production builds & OTA updates (M4-4)

Laptop-independent phone builds: standalone binaries pointed at
`https://chefer.duckdns.org`, updated over the air through **EAS Update**
(free tier) on channel `production`. No Play Console / Apple Developer
account needed. All scripts live in `apps/mobile/scripts/`, export
`apps/mobile/.env`, and hard-set `APP_VARIANT=production` +
`EXPO_PUBLIC_API_URL=https://chefer.duckdns.org`.

| Command (repo root)           | What it does                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm mobile:release:android` | clean prebuild → `gradlew assembleRelease` (arm64) → `adb install -r` on `ANDROID_SERIAL` (default the Pixel 8 Pro). `NO_INSTALL=1` = build only. APK is signed with the template debug keystore (fine for sideloading; a store build needs a real upload key).                                                                                                              |
| `pnpm mobile:release:ios`     | clean prebuild → `xcodebuild -configuration Release -allowProvisioningUpdates …` signed with the free team `EXPO_APPLE_TEAM_ID` → `devicectl` install on `IOS_DEVICE_UDID` (default the iPhone 17). **Free certs expire after 7 days — re-running this is the re-sign.** Phone must be unlocked.                                                                             |
| `pnpm mobile:update "msg"`    | `eas update --channel production` — publishes the current JS. Installed production apps fetch it on launch and run it on the next launch. **Normally automatic:** `deploy.yml`'s `mobile-update` job runs this after every verified deploy of master (§13). Aborts locally when the runtime doesn't match the last `release:*` build (`ALLOW_RUNTIME_MISMATCH=1` overrides). |

- **Runtime version = native fingerprint** (`runtimeVersion.policy:
'fingerprint'`). An update only reaches binaries with identical native code,
  so publishing after adding a native module is harmless (no binary matches)
  — but the phones need `release:*` over the cable before they see new JS.
  The fingerprint includes the app config, so builds and updates must run
  through the scripts (same `.env`, same variant).
- **API compatibility:** web/API deploy on push to master; an OTA update
  goes live when published. Publish only after the API it depends on is
  deployed, and keep API changes additive (CLAUDE.md — installed binaries and
  their embedded bundles keep calling the old contract).
- **Dev builds stay as they were:** `pnpm mobile:ios -- --device <udid>` /
  `pnpm mobile:android` build the `Chefer Dev` variant, which needs Metro
  (:8083, `EXPO_PUBLIC_API_URL=http://<Mac LAN IP>:3001`) and the local API.
  The dev variant's bundle id is new (`dev.chefer.app.dev`), so its **first**
  iPhone install needs the free profile minted once: `cd apps/mobile/ios &&
xcodebuild -workspace CheferDev.xcworkspace -scheme CheferDev -destination
id=<udid> -allowProvisioningUpdates -allowProvisioningDeviceRegistration build`
  (phone unlocked), then `pnpm mobile:ios -- --device <udid> --port 8083` as
  before. Free Apple IDs allow 3 sideloaded apps per device — Chefer + Chefer
  Dev use two. Installing an already-built production APK without rebuilding:
  `adb -s <serial> install -r apps/mobile/release-builds/chefer-production.apk`.
- The More tab's footer shows the running build: `Chefer 0.0.1 · production ·
built-in bundle` or `… · update <id>` once an OTA update is running.

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

### External binaries (video recipe import)

`VideoRecipeService` shells out to two binaries that are **not** currently installed in any image:

| Binary   | Needed by                     | Used for                                 |
| -------- | ----------------------------- | ---------------------------------------- |
| `yt-dlp` | metadata (stage 1) + download | caption fetch, clip download             |
| `ffmpeg` | download path only            | re-encode clips over 12 MB before upload |

Today this runs only from `pnpm recipes:from-video` on a developer machine (`brew install yt-dlp ffmpeg`), so no image change is required. **Wiring the extractor to a tRPC procedure means adding both to `Dockerfile.api`** — until then the admin path must stay a local batch job. Both are behind `IMediaFetcher`, so nothing else in the API depends on them.

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
  `/api/recipe-images/*`, `/api/chat`, `/api/health`, `/uploads/*`, `/static/exercises/*` (gym
  exercise photos, gym_plan.md §5.5) → API; rest → web).
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
workspaces), `Build`, `Mobile Bundle` (headless `expo export` of `apps/mobile` —
catches Metro/monorepo-resolution breakage without a simulator; Maestro E2E is
local-only, see `mobile_native_plan.md` M4-2), and `E2E Tests` (PRs only — the
unauthenticated `public` Playwright project; the authenticated `mobile`/`desktop`
projects need a seeded fixture dataset, planned with roadmap P0-8). The
`Lint`/`Type Check`/`Unit Tests`/`Build` job names are polled by name from
`deploy.yml`'s gate — rename them in both files together.

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
        └─ mobile-update (M4-4)                  `pnpm mobile:update "<sha> <subject>"` →
              EAS Update channel "production": installed production apps fetch the new
              JS on their next launch and run it on the one after. Runs only after verify
              (the API the JS talks to is live first); skipped with a warning while the
              EXPO_TOKEN secret is unset; skipped on rollbacks
```

**Mobile OTA from CI:** the job publishes with `ALLOW_RUNTIME_MISMATCH=1` (CI has no
record of what's installed). If the native fingerprint changed (new native module,
`app.config.js`/icon/`apps/mobile/.gitignore` edit), the update targets a runtime no
phone has — harmless, but the phones get nothing until `pnpm mobile:release:*` over
USB; the job log prints the runtimes. `EXPO_APPLE_TEAM_ID` must be set as a repo
**variable**: it is part of the iOS fingerprint (verified: without it iOS resolves to a
different runtime and updates would never arrive). Rolling mobile JS back:
`npx eas-cli update:republish --group <previous group id>` (or publish from an older
commit).

**Branch protection (manual, repo Settings → Branches → `master`):** require the
`Lint`, `Type Check`, `Unit Tests`, and `Build` status checks. This is the second
half of the gate — the deploy gate stops red code _shipping_; protection stops it
_merging_.

**Why images are built in CI:** the production VM is 1 OCPU / 1 GB, where `next build` takes
15–40 minutes. A runner does it in ~4–6 min cold, ~1–3 min with the layer cache, and the VM only
pulls. `infrastructure/scripts/deploy-local-build.sh` keeps the build-on-VM path as a fallback.

**Rollback:** Run workflow with `tag = sha-<short>` of a previous build (skips the build jobs).

**Required repo configuration**

| Kind     | Name                                          | Value                                                                                                                  |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Secret   | `DEPLOY_HOST`                                 | VM public IP                                                                                                           |
| Secret   | `DEPLOY_USER`                                 | `ubuntu`                                                                                                               |
| Secret   | `DEPLOY_SSH_KEY`                              | private half of a **dedicated** deploy keypair                                                                         |
| Variable | `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` | `https://chefer.duckdns.org`                                                                                           |
| Variable | `NEXT_PUBLIC_APP_NAME`                        | `Chefer`                                                                                                               |
| Variable | `DEPLOYMENT_URL`                              | `https://chefer.duckdns.org`                                                                                           |
| Secret   | `EXPO_TOKEN`                                  | expo.dev → Account settings → Access tokens (robot/personal token with access to `@cheferoni/chefer`) — mobile OTA job |
| Variable | `EXPO_APPLE_TEAM_ID`                          | `45P674Q3CW` (free Apple ID team; same as `apps/mobile/.env`) — mobile OTA job                                         |

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
