# 🍽️ Chefer — Product Requirements Document

| Field                 | Value                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| **Version**           | 1.6.0                                                                             |
| **Status**            | In Progress – Phase 2 Complete, Phase 3 Partially Done (T-021/T-022/T-023/T-025)  |
| **Author**            | Staff Product Management                                                          |
| **Stack**             | Next.js · Prisma · PostgreSQL · React                                             |
| **Total Tasks**       | 41 tasks across 6 phases (24/41 complete)                                         |
| **Est. Total Effort** | ~145–210 engineering hours                                                        |
| **Design Source**     | Stitch project `14879881194424758396` — "Chefer" (7 screens, reviewed 2026-03-22) |

---

## Table of Contents

0. [Existing Codebase State](#0-existing-codebase-state)
1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase Overview](#3-phase-overview)
4. [Detailed Task Breakdown](#4-detailed-task-breakdown)
   - [Phase 0 — Foundation](#phase-0--foundation-t-001-to-t-006)
   - [Phase 1 — User Preferences](#phase-1--user-preferences-t-007-to-t-013)
   - [Phase 2 — Core AI Feature](#phase-2--core-ai-feature-t-014-to-t-020)
   - [Phase 3 — Power Features](#phase-3--power-features-t-021-to-t-026)
   - [Phase 4 — Tracking & Engagement](#phase-4--tracking--engagement-t-027-to-t-032)
   - [Phase 5 — Production Hardening](#phase-5--production-hardening-t-033-to-t-040)
5. [AI Agent Execution Guidelines](#5-ai-agent-execution-guidelines)
6. [Key User Stories](#6-key-user-stories)
7. [Out of Scope (v1 MVP)](#7-out-of-scope-v1-mvp)

---

## 0. Existing Codebase State

> **Read this section before touching any task.** It describes what is already in the repo so that implementation does not duplicate or conflict with existing work.

### 0.1 What Already Exists

| Area                              | Status                 | Notes                                                                                                                                                                                                                                                                       |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo structure**            | ✅ Done                | `apps/api`, `apps/web`, `packages/database`, `packages/types`, `packages/utils`, `packages/ui`, `packages/config/*`                                                                                                                                                         |
| **tRPC setup**                    | ✅ Done                | `apps/api/src/lib/trpc.ts` — `publicProcedure`, `protectedProcedure`, `adminProcedure` already exported. `apps/web/src/lib/trpc.ts` + `trpc-server.ts` already wired.                                                                                                       |
| **Auth (custom cookie sessions)** | ✅ Done                | **Not NextAuth.** Custom `chefer_session` cookie. `auth.register`, `auth.login`, `auth.logout`, `auth.me` tRPC procedures in `apps/api/src/routers/auth.router.ts`. Cookie resolved to `ctx.user` in `apps/api/src/interfaces/http/middleware/auth.middleware.ts`.          |
| **User model**                    | ✅ Done                | Has `id`, `email`, `passwordHash`, `name`, `firstName`, `lastName`, `image`, `role` (`USER`/`MODERATOR`/`ADMIN`), `createdAt`, `updatedAt`, `accounts`, `sessions`, `posts`, `profile`.                                                                                     |
| **UserProfile model**             | ⚠️ Exists, wrong shape | Currently has social-media fields (`bio`, `website`, `location`, `twitter`, `github`). **Do NOT alter this model.** All PersonalChef health data goes into `ChefProfile` (T-002 complete).                                                                                  |
| **ChefProfile model**             | ✅ Done                | `chef_profiles` table: `biologicalSex` (enum: `MALE`/`FEMALE`), `age`, `heightCm`, `weightKg`, `activityLevel` (enum), `goal` (enum), `dailyCalorieTarget`, `displayName`. `ChefProfileRepository` exported from `@chefer/database`.                                        |
| **DietaryPreferences model**      | ✅ Done                | `dietary_preferences` table: `cuisinePreferences`, `dietaryRestrictions`, `allergies`, `dislikedIngredients` (all `String[]`), `mealsPerDay`, `servingSize`. `DietaryPreferencesRepository` exported from `@chefer/database`.                                               |
| **Preferences tRPC router**       | ✅ Done                | `apps/api/src/routers/preferences.router.ts` — `preferences.hasProfile`, `preferences.setup`, `preferences.get`, `preferences.update`. Service at `apps/api/src/application/preferences/preferences.service.ts`. Calorie target computed with sex-specific Mifflin-St Jeor. |
| **Onboarding wizard**             | ✅ Done                | `apps/web/src/app/(dashboard)/onboarding/page.tsx` — 4-step wizard (Goal → Body Metrics → Diet → Cuisine). Redirects returning users to `/dashboard`. Calls `preferences.setup` on Finish.                                                                                  |
| **Preferences settings page**     | ✅ Done                | `apps/web/src/app/(dashboard)/preferences/page.tsx` — loads current data via `preferences.get` (server component), editable form calls `preferences.update`, success/error toast from `packages/ui`.                                                                        |
| **Toast UI component**            | ✅ Done                | `packages/ui/src/components/toast.tsx` — `success`/`error` variants, auto-dismiss, manual dismiss.                                                                                                                                                                          |
| **Health check route**            | ✅ Done                | `GET /api/health` at `http://localhost:3001/api/health` — returns `{ ok: true, timestamp }`, `503` on DB failure.                                                                                                                                                           |
| **Landing page**                  | ✅ Done                | `apps/web/src/app/page.tsx` — hero, 3-column features (Weekly AI Meal Plans, Personalized Goals, Smart Shopping Lists), footer. Redirects authenticated users to `/dashboard`.                                                                                              |
| **Login page**                    | ✅ Done                | `apps/web/src/app/(auth)/login/page.tsx` — calls `auth.login`, inline errors, redirects authenticated users to `/dashboard`.                                                                                                                                                |
| **Register page**                 | ✅ Done                | `apps/web/src/app/(auth)/register/page.tsx` — calls `auth.register`, inline validation, redirects on success to `/onboarding`, redirects authenticated users to `/dashboard`.                                                                                               |
| **Navigation shell**              | ⚠️ Superseded          | `apps/web/src/features/nav/components/nav-bar.tsx` — current horizontal top nav (T-004). **T-016A replaces this with a left sidebar.** Do not build new Phase 2 UI until T-016A is complete.                                                                                |
| **Route protection middleware**   | ✅ Done                | `apps/web/src/middleware.ts` — checks `chefer_session` cookie; redirects unauthenticated requests to `/login` for all protected routes.                                                                                                                                     |
| **Dashboard page**                | 🔶 Stub                | `apps/web/src/app/(dashboard)/dashboard/page.tsx` exists with placeholder stats cards. Real data fetching comes in Phase 3.                                                                                                                                                 |
| **User router (tRPC)**            | ✅ Done                | `apps/api/src/routers/user.router.ts` + `index.ts` — `user.*` namespace exists                                                                                                                                                                                              |
| **User repository**               | ✅ Done                | `packages/database/src/repositories/user.repository.ts`                                                                                                                                                                                                                     |
| **UI components**                 | 🔶 Partial             | `packages/ui`: Button, Card, Input, Badge, Toast. Add more as later phases require.                                                                                                                                                                                         |

### 0.2 Critical Architecture Rules for Implementation

1. **All API calls go through tRPC — no Next.js API routes.** When this PRD says `POST /api/meal-plans/generate`, that means a tRPC procedure `mealPlan.generate` in `apps/api/src/routers/meal-plan.router.ts`, called from the web via the tRPC client. The only exception is streaming (T-032 chat), which may use a Next.js Route Handler at `apps/web/src/app/api/chat/route.ts` because tRPC does not natively stream.

2. **Auth is custom cookie-based, not NextAuth.** The PRD references `next-auth` throughout — ignore that. Use the existing `chefer_session` cookie mechanism. Sign-in/sign-up = tRPC mutations that set/clear the cookie. `protectedProcedure` on the API enforces auth.

3. **ChefProfile, not UserProfile.** The existing `UserProfile` model is for social data and must not be modified. All PersonalChef health data (age, height, weight, goal, activity level) goes into a new `ChefProfile` model.

4. **Never import `@prisma/client` directly in apps.** All DB access goes through `@chefer/database`.

5. **Layer order:** tRPC Router (`apps/api/src/routers/`) → Service (`apps/api/src/application/`) → Repository (`packages/database/src/repositories/`) → Prisma. No skipping layers.

6. **`currentImplementation.md` update is mandatory on every task.** See §5.7 for format.

### 0.3 File Naming Conventions (Quick Reference)

| Artifact                | Location                                      | Pattern                   |
| ----------------------- | --------------------------------------------- | ------------------------- |
| tRPC router             | `apps/api/src/routers/`                       | `[feature].router.ts`     |
| Service                 | `apps/api/src/application/[feature]/`         | `[feature].service.ts`    |
| Repository              | `packages/database/src/repositories/`         | `[feature].repository.ts` |
| Web page                | `apps/web/src/app/[route]/`                   | `page.tsx`                |
| Web component (feature) | `apps/web/src/features/[feature]/components/` | `PascalCase.tsx`          |
| Web component (shared)  | `packages/ui/src/components/`                 | `kebab-case.tsx`          |
| AI fixtures             | `apps/api/src/lib/ai/fixtures/`               | `[feature].fixture.ts`    |
| AI prompts              | `apps/api/src/lib/ai/prompts.ts`              | named exports             |

---

## 1. Executive Summary

Chefer is a web application that acts as an intelligent personal chef for individual users. Its primary function is to generate fully personalized, 7-day meal plans tailored to each user's health goals, dietary restrictions, food preferences, and nutritional targets — powered by a large language model.

The product lives within an existing Next.js / Prisma / PostgreSQL monorepo. This PRD describes every task required to build the product from zero to a production-ready MVP, broken into six incremental phases so that an AI coding agent can execute them sequentially and demonstrate visible, testable progress after each phase.

### 1.1 Problem Statement

Planning healthy, varied, goal-aligned meals for an entire week is cognitively expensive. Most people default to repetitive meals or make poor nutritional choices not from lack of motivation, but from lack of time and knowledge. Existing meal-planning apps are either too generic, too rigid, or require a nutritionist. Chefer removes this friction entirely.

### 1.2 Target Users

- Health-conscious individuals who want to lose weight, maintain, or build muscle.
- Busy professionals who want to eat well without spending hours planning.
- People with dietary restrictions (allergies, intolerances, lifestyle diets).
- Home cooks who want variety without the mental overhead of recipe discovery.

### 1.3 Success Metrics (MVP)

- Time to first meal plan generated < 5 minutes from registration.
- User retains an active plan for 3+ consecutive weeks.
- AI-generated meal plan passes nutrition validation (within ±10% of user calorie target).
- Shopping list covers 100% of recipe ingredients with no duplicates.
- Lighthouse performance score > 85 on desktop and > 75 on mobile.

---

## 2. Architecture Overview

### 2.1 Tech Stack (Existing Monorepo)

| Layer            | Technology                                           | Notes                                                                                                          |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Frontend**     | Next.js 15 App Router (React Server Components)      | `apps/web`, port 3000                                                                                          |
| **Backend**      | Express + tRPC v11                                   | `apps/api`, port 3001                                                                                          |
| **ORM**          | Prisma 5 + PostgreSQL 16                             | `packages/database`                                                                                            |
| **Auth**         | Custom cookie sessions (`chefer_session`)            | **Not NextAuth.** `apps/web/src/features/auth/` + `apps/api/src/interfaces/http/middleware/auth.middleware.ts` |
| **API contract** | tRPC (superjson transformer)                         | `publicProcedure` / `protectedProcedure` / `adminProcedure` already set up                                     |
| **AI Provider**  | OpenAI GPT-4o or Anthropic Claude (env-configurable) | Gated by `AI_MOCK_ENABLED`; mock used locally                                                                  |
| **Styling**      | Tailwind CSS 3 + `packages/ui` component library     | Use `cn()` from `@chefer/utils`                                                                                |
| **Email**        | Resend (React Email templates)                       | Phase 4                                                                                                        |
| **Payments**     | Stripe                                               | Phase 5 stub only                                                                                              |
| **Deployment**   | Vercel (preview + production)                        | Phase 5                                                                                                        |
| **Testing**      | Vitest (unit) + Playwright (E2E)                     | `tests/` at repo root                                                                                          |
| **Monitoring**   | Sentry + Vercel Analytics                            | Phase 5                                                                                                        |

### 2.2 High-Level Data Model

The following entities are introduced across the six phases:

- **User** — authentication identity, plan tier (FREE/PRO).
- **UserProfile** — physical metrics (age, height, weight), activity level, goal.
- **DietaryPreferences** — diet type, restrictions, allergies, dislikes, cuisine prefs, meal cadence.
- **Recipe** — AI-generated or user-saved recipe with full nutrition data.
- **MealPlan** — one week of meals associated to a user, with status lifecycle.
- **MealPlanDay** — per-day breakdown of meals within a plan (stored as structured JSON).
- **FavouriteRecipe** — many-to-many join between User and Recipe.
- **MealRating** — per-user rating and feedback per Recipe.
- **DailyLog** — user-confirmed daily food intake for tracking.
- **WeightEntry** — time-series weight log for progress tracking.

### 2.3 AI Provider Strategy — Mock vs. Live

To protect development velocity and prevent accidental token spend, all AI calls are gated by an environment flag:

| Environment       | `AI_MOCK_ENABLED` | Behaviour                                                        |
| ----------------- | ----------------- | ---------------------------------------------------------------- |
| Local development | `true` (default)  | Returns hardcoded fixture data instantly — no API calls, no cost |
| CI / preview      | `true` (default)  | Same fixtures; E2E tests are deterministic                       |
| Production        | `false`           | Calls the real LLM provider                                      |

The mock and live implementations share an identical TypeScript interface (`IAIService`). Swapping providers requires only changing the env flag — no code changes. All fixture responses must be realistic (correct JSON shape, plausible recipes, reasonable macro values) so that UI development and E2E tests behave exactly as they would with real AI output.

> **Why this matters:** A single developer running `pnpm dev` all day and clicking "Generate Plan" a few times should not incur $5–$20 in API costs. The mock also makes local testing reproducible and fast (< 100ms vs. 10–30s for a real LLM call).

---

### 2.4 AI Meal Plan Generation Flow

1. User triggers "Generate My Week" from the dashboard or meal plan page.
2. `POST /api/meal-plans/generate` validates auth and rate limit.
3. Server fetches `UserProfile` and `DietaryPreferences` from DB.
4. Builds a structured system prompt encoding: goal, calorie target, macros split, cuisine prefs, restrictions, allergies, dislikes, favourite recipe hints.
5. Calls LLM with JSON mode; validates response schema with Zod.
6. Persists `MealPlan` + 7x `MealPlanDay` + `Recipe` rows inside a single DB transaction.
7. Returns full plan JSON to the client; UI animates the week grid filling in.

---

## 3. Phase Overview

| Phase | Name                  | Goal                                                               | Tasks              | Est. | Status                                        |
| ----- | --------------------- | ------------------------------------------------------------------ | ------------------ | ---- | --------------------------------------------- |
| **0** | Foundation            | Project setup, DB schema, auth, navigation shell                   | T-001–006          | ~20h | ✅ Complete                                   |
| **1** | User Preferences      | Onboarding wizard, dietary preferences CRUD                        | T-007–013          | ~28h | ✅ Complete                                   |
| **2** | Core AI Feature       | Nav redesign, AI meal plan generation, week grid UI, recipe detail | T-014–020 + T-016A | ~42h | ✅ Complete                                   |
| **3** | Power Features        | Dashboard, recipe swap, shopping list, history, favourites         | T-021–026          | ~28h | 🔶 In Progress (T-021/T-022/T-023/T-025 done) |
| **4** | Tracking & Engagement | Calorie tracker, progress charts, email, chat                      | T-027–032          | ~36h | ⏳ Pending                                    |
| **5** | Production Hardening  | Mobile, a11y, perf, E2E tests, deployment, analytics               | T-033–040          | ~36h | ⏳ Pending                                    |

---

## 4. Detailed Task Breakdown

> **Effort legend:** S = 1–2h · M = 3–4h · L = 5–8h · XL = 8–12h  
> **Priority legend:** P0 = must-have blocker · P1 = should-have · P2 = nice-to-have

---

### Phase 0 — Foundation (T-001 to T-006) ✅ COMPLETE

> **Goal:** Establish a runnable Next.js app with authentication, a database connection, and a basic navigation shell. At the end of this phase you should be able to register, log in, and see a protected dashboard page.

#### T-001 · Project Scaffolding & Health Check `S` `P0` ✅ DONE

The monorepo structure already exists. This task is scoped to:

- Add `GET /api/health` on the Express server (`apps/api`) that returns `{ ok: true, timestamp }` and checks DB connectivity (returns `503` on failure).
- Verify `pnpm dev` starts both `apps/web` (port 3000) and `apps/api` (port 3001) without errors.
- Ensure `.env.example` at repo root documents all required variables.

> **Browser Test:** Navigate to `http://localhost:3001/api/health` — expect `{"ok":true}` with a timestamp. Confirm `http://localhost:3000` loads without console errors.

#### T-002 · Database Schema – Chef Profile `S` `P0` ✅ DONE

The `User` model already exists with the required fields. The existing `UserProfile` must **not** be modified (it holds social data). Instead:

Create a new `ChefProfile` Prisma model in `packages/database/prisma/schema.prisma`:

- `id`, `userId` FK (unique, cascade delete), `displayName` `String?`
- `age` `Int?`, `heightCm` `Float?`, `weightKg` `Float?`
- `activityLevel` enum: `SEDENTARY`, `LIGHTLY_ACTIVE`, `MODERATELY_ACTIVE`, `VERY_ACTIVE`, `ATHLETE`
- `goal` enum: `LOSE_WEIGHT`, `MAINTAIN`, `GAIN_MUSCLE`, `EAT_HEALTHIER`
- `dailyCalorieTarget` `Int?` (calculated on save, stored for quick reads)
- `updatedAt` `DateTime @updatedAt`

Add a `chefProfile ChefProfile?` relation to the existing `User` model.

Run `pnpm db:migrate`.

> **Browser Test:** No direct browser test. Verify via `pnpm db:studio` — confirm `chef_profiles` table exists with all columns. Confirm the `users` table is unchanged.

#### T-003 · Authentication – Sign-Up tRPC Procedure & Register Page `M` `P0` ✅ DONE

**Do not install NextAuth.** Auth is already custom cookie-based. This task adds:

1. `auth.register` tRPC mutation in a new `apps/api/src/routers/auth.router.ts`:
   - Input: `{ email, password, firstName?, lastName? }` (Zod schema)
   - Validates email uniqueness, hashes password with `bcrypt`, creates `User` row
   - Creates a session and sets the `chefer_session` cookie in the response
   - Returns the sanitized `UserProfile`

2. `auth.logout` tRPC mutation: clears the session cookie.

3. Add `authRouter` to the root `appRouter` in `apps/api/src/routers/index.ts`.

4. Wire login form (`apps/web/src/app/(auth)/login/page.tsx`) to call `auth.login` via tRPC if it isn't already connected end-to-end.

> **Browser Test:** Navigate to `http://localhost:3000/register`. Submit mismatched passwords — expect inline validation error. Register with a fresh email — expect redirect to `/dashboard` and a `chefer_session` cookie visible in DevTools → Application → Cookies. Navigate to `/login`, log out, log back in with the new credentials.

#### T-004 · Core Layout & Navigation Shell `M` `P0` ✅ DONE

Update `apps/web/src/app/layout.tsx` with a persistent top navigation bar: logo, links to Dashboard, Meal Plan, Preferences, and a Sign Out / Avatar dropdown (reads display name from session). Use Tailwind CSS — no `SessionProvider` (custom auth, not NextAuth). Add Next.js `middleware.ts` at `apps/web/src/` that redirects unauthenticated users to `/login` for protected routes (`/dashboard`, `/meal-plan`, `/preferences`, `/onboarding`, `/tracker`, `/history`, `/cookbook`, `/progress`, `/shopping-list`).

> **Browser Test:** Open an incognito window and navigate to `http://localhost:3000/dashboard` — expect redirect to `/login`. Log in, then verify: top nav is visible on all pages, each nav link routes correctly, and clicking Sign Out clears the session and redirects to `/login`.

#### T-005 · Landing Page (Unauthenticated) `M` `P1` ✅ DONE

Build `apps/web/src/app/page.tsx` as a marketing landing page: hero section (headline, sub-headline, CTA button to `/register`), 3-column features section (Weekly AI Meal Plans, Personalized Goals, Smart Shopping Lists), and a footer. Static copy is fine — no backend calls needed. Redirect already-authenticated users to `/dashboard`.

> **Browser Test:** Open incognito, navigate to `http://localhost:3000` — confirm hero, 3-column features, and footer render correctly. Click the CTA — confirm navigation to `/register`. Log in then navigate to `http://localhost:3000` — confirm redirect to `/dashboard`.

#### T-006 · Sign Up & Login Pages `M` `P0` ✅ DONE

The login page already exists at `apps/web/src/app/(auth)/login/page.tsx`. This task:

- Builds `apps/web/src/app/(auth)/register/page.tsx`: email, password, confirm-password fields; calls `trpc.auth.register` mutation; on success sets session and redirects to `/onboarding` (new user) or `/dashboard` (returning user with ChefProfile already complete).
- Ensures the login page calls `trpc.auth.login` and handles errors (wrong password, unverified, etc.) with inline messages.
- Both pages redirect already-authenticated users to `/dashboard`.

> **Browser Test:** Navigate to `/register`. Submit with mismatched passwords — expect inline error. Register a new user — expect redirect to `/onboarding`. Navigate to `/login`, sign out, then sign back in — expect redirect to `/dashboard`. Attempt to visit `/register` while logged in — expect redirect to `/dashboard`.

---

### Phase 1 — User Preferences (T-007 to T-013) ✅ COMPLETE

> **Goal:** Collect all data the AI needs to generate a personalized meal plan. A new user should be able to complete the onboarding wizard in under 3 minutes and return to update their preferences later.

#### T-007 · Database Schema – Dietary Preferences `S` `P0` ✅ DONE

Add Prisma model `DietaryPreferences` to `packages/database/prisma/schema.prisma`:

- `id`, `userId` FK (unique, cascade delete)
- `cuisinePreferences` `String[]`, `dietaryRestrictions` `String[]`, `allergies` `String[]`, `dislikedIngredients` `String[]`
- `mealsPerDay` `Int` default `3`, `servingSize` `Int` default `1`
- `updatedAt` `DateTime @updatedAt`

Add `dietaryPreferences DietaryPreferences?` relation to `User`.

Run `pnpm db:migrate`. Update repository exports in `packages/database/src/repositories/index.ts`.

> **Browser Test:** No direct browser test. Verify via `pnpm db:studio` — confirm `dietary_preferences` table exists with all columns and the FK to `users`.

#### T-008 · Onboarding Wizard – Step 1: Goals `M` `P0` ✅ DONE

Build multi-step onboarding flow at `apps/web/src/app/(dashboard)/onboarding/page.tsx`. This is a client component wizard — state is held in React state, not URL params. Step 1: goal selector card UI (Lose Weight, Maintain Weight, Gain Muscle, Eat Healthier) with an icon per option. Show progress indicator "Step 1 of 4". Disable Continue until a selection is made.

> **Browser Test:** Register a new user — expect redirect to `/onboarding`. Confirm Step 1 renders 4 goal cards with icons. Click a card — confirm it highlights. Click Continue without selecting — confirm it's disabled. Select a goal and click Continue — confirm Step 2 renders with Step 1 answer preserved.

#### T-009 · Onboarding Wizard – Step 2: Body Metrics `M` `P0` ✅ DONE

Step 2 form: biological sex (Male / Female pill toggle, **required**), age (number input), height (cm or ft/in toggle), weight (kg or lbs toggle), activity level radio group (Sedentary, Lightly Active, Moderately Active, Very Active, Athlete). Calculate and display estimated daily calorie target using the Mifflin-St Jeor formula (sex-specific constants: male +5, female −161) as a live preview that updates on every keystroke. Store in React state; clicking Back returns to Step 1 with Step 1 selection intact. Continue button is disabled until all fields including biological sex are filled.

> **Browser Test:** On Step 2, select Male then Female and confirm the calorie estimate changes. Type an age and watch the calorie estimate appear. Toggle between cm and ft/in — confirm the height value converts. Toggle kg/lbs — confirm weight converts. Select each activity level — confirm the calorie target changes. Click Back — confirm Step 1 goal selection is preserved.

#### T-010 · Onboarding Wizard – Step 3: Diet & Restrictions `M` `P0` ✅ DONE

Step 3: multi-select toggle buttons for diet type (Omnivore, Vegetarian, Vegan, Pescatarian, Keto, Paleo, Gluten-Free, Dairy-Free). Freeform text input for allergies — pressing Enter or comma tokenizes the input into a dismissible chip. Multi-select for disliked ingredients from a preset list (onions, mushrooms, cilantro, etc.) plus a free-text add option. All selections stored in React state.

> **Browser Test:** On Step 3, click multiple diet type toggles — confirm multi-select works. Type "peanuts" in the allergy field and press Enter — confirm it appears as a chip. Click the chip's × — confirm it's removed. Select a disliked ingredient from the list and type a custom one. Click Back — confirm Steps 1 and 2 selections are still intact.

#### T-011 · Onboarding Wizard – Step 4: Cuisine & Meal Cadence `M` `P0` ✅ DONE

Step 4: multi-select cuisine preferences (Italian, Mexican, Asian, Mediterranean, American, Indian, Middle Eastern, etc.). Choose meals per day (2–5 toggle). Choose serving size (1–6 people). On Finish, call `trpc.preferences.setup` mutation which upserts both `ChefProfile` and `DietaryPreferences` in a single DB transaction. Redirect to `/dashboard` on success.

Implement the `preferences.setup` tRPC mutation in `apps/api/src/routers/preferences.router.ts`. Add `preferencesRouter` to the root `appRouter`.

> **Browser Test:** Complete all 4 onboarding steps and click Finish. Confirm a spinner appears and then a redirect to `/dashboard`. Open `pnpm db:studio` — confirm both `chef_profiles` and `dietary_preferences` rows exist for your user. Navigate to `/onboarding` again — confirm it redirects to `/dashboard` (user already has a profile).

#### T-012 · tRPC – Preferences CRUD Procedures `M` `P1` ✅ DONE

Add to `preferences.router.ts`:

- `preferences.get` — `protectedProcedure` query: returns `ChefProfile` + `DietaryPreferences` for the session user.
- `preferences.update` — `protectedProcedure` mutation: partial update (Zod `.partial()`) of both models in a transaction.

Create `apps/api/src/application/preferences/preferences.service.ts` and `packages/database/src/repositories/chef-profile.repository.ts` + `dietary-preferences.repository.ts` following the existing repository pattern.

Write at least 3 Vitest unit tests for the service layer (mock the repositories).

> **Browser Test:** Navigate to `/preferences` (built in T-013). While building, verify via DevTools Network tab that `trpc.preferences.get` returns 200 with your data. Test `trpc.preferences.update` from the browser console. Hit a protected procedure without a session cookie (use DevTools to delete the cookie) — confirm a `UNAUTHORIZED` tRPC error is returned.

#### T-013 · Preferences Settings Page `M` `P1` ✅ DONE

Build `apps/web/src/app/(dashboard)/preferences/page.tsx`. Load user's `ChefProfile` + `DietaryPreferences` via `trpc.preferences.get` (server component). Render an editable form mirroring the onboarding wizard (goal, biological sex, metrics, diet restrictions, cuisines) as a `"use client"` component. Save is disabled until goal, biological sex, age, height, weight, and activity level are all filled. On Save, call `trpc.preferences.update` mutation and show a success toast from `packages/ui`. Protected by middleware (T-004).

> **Browser Test:** Navigate to `/preferences`. Confirm all onboarding data is pre-populated. Change a value (e.g. swap a cuisine or update weight). Click Save — confirm a success toast appears. Refresh the page — confirm the updated value persists. Navigate away and back — confirm no data loss.

---

### Phase 2 — Core AI Feature (T-014 to T-020 + T-016A)

> **Goal:** The main value proposition. An authenticated user with preferences set can click one button and receive a full 7-day meal plan generated by AI, displayed in the new "Your Weekly Palette" meal planner UI with recipe details on demand.
>
> **⚠️ Design revision applied (v1.4.0):** The Stitch redesign replaces the top horizontal navigation bar with a persistent **left sidebar**. T-016A introduces this change before any Phase 2 pages are built. All subsequent screen specs in this phase reflect the sidebar shell. The nutrition summary moves from the Meal Planner page to the Dashboard (see T-020 and T-021).

#### T-014 · Database Schema – Meal Plans & Recipes `M` `P0` ✅ DONE

Add to `packages/database/prisma/schema.prisma`:

```prisma
enum RecipeSource { AI MANUAL }
enum MealPlanStatus { DRAFT ACTIVE ARCHIVED }

model Recipe {
  id            String        @id @default(cuid())
  name          String
  description   String
  ingredients   Json          // { name, quantity, unit }[]
  instructions  String[]
  nutritionInfo Json          // { calories, protein, carbs, fat, fiber }
  cuisineType   String
  dietaryTags   String[]
  prepTimeMins  Int
  cookTimeMins  Int
  servings      Int
  imageUrl      String?
  source        RecipeSource  @default(AI)
  createdAt     DateTime      @default(now())
  mealPlanDays  MealPlanDay[] @relation("MealPlanDayRecipes")
  @@map("recipes")
}

model MealPlan {
  id            String         @id @default(cuid())
  userId        String
  weekStartDate DateTime
  status        MealPlanStatus @default(DRAFT)
  createdAt     DateTime       @default(now())
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  days          MealPlanDay[]
  @@index([userId])
  @@map("meal_plans")
}

model MealPlanDay {
  id          String   @id @default(cuid())
  mealPlanId  String
  dayOfWeek   Int      // 0 = Monday … 6 = Sunday
  meals       Json     // { type: "breakfast"|"lunch"|"dinner"|"snack", recipeId }[]
  mealPlan    MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  @@index([mealPlanId])
  @@map("meal_plan_days")
}
```

Add `mealPlans MealPlan[]` relation to `User`. Run `pnpm db:migrate`.

> **Browser Test:** No direct browser test. Verify via `pnpm db:studio` — confirm `recipes`, `meal_plans`, and `meal_plan_days` tables exist with all columns.

#### T-015 · AI Service Layer — Interface, Mock, and Live Implementation `L` `P0` ✅ DONE

Create the AI service abstraction in `lib/ai/`:

**`lib/ai/types.ts`** — define the shared `IAIService` interface:

```ts
interface IAIService {
  generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse>;
  generateRecipeSwap(input: SwapInput): Promise<RecipeResponse>;
  chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream>;
}
```

**`lib/ai/mock.ts`** — implement `MockAIService` that returns hardcoded fixture data:

- `generateMealPlan` returns a fully populated 7-day fixture (`lib/ai/fixtures/week-plan.fixture.ts`) with realistic recipes, plausible macro values (within ±5% of a 2,000 kcal target), and varied cuisine types. Response is instant (no artificial delay unless `AI_MOCK_DELAY_MS` env var is set for UX testing).
- `generateRecipeSwap` returns a single replacement recipe from a small fixture pool (`lib/ai/fixtures/swap-recipes.fixture.ts`), cycling deterministically so repeated swaps still change the displayed recipe.
- `chat` returns a pre-written set of streaming text fixtures (`lib/ai/fixtures/chat-responses.fixture.ts`) based on simple keyword matching on the last user message.

**`lib/ai/openai.ts`** (or `lib/ai/anthropic.ts`) — implement the real `LiveAIService`:

- Accept `UserProfile` + `DietaryPreferences`, build a structured system prompt, call the provider with JSON mode / structured output.
- Validate response with Zod against the `WeekPlanResponse` schema. Throw `AIValidationError` on schema mismatch.
- Store API key in env; never hard-code it.

**`lib/ai/index.ts`** — factory that reads `AI_MOCK_ENABLED`:

```ts
export const aiService: IAIService =
  process.env.AI_MOCK_ENABLED === 'true' ? new MockAIService() : new LiveAIService();
```

All fixture files must be co-located in `lib/ai/fixtures/` and exported as typed constants. Do not inline fixture data in the service files.

All LLM prompts for the live service must live in `lib/ai/prompts.ts` as named exported constants — never inline strings in service methods.

#### T-016 · Generate Meal Plan tRPC Procedure `L` `P0` ✅ DONE

Implement `mealPlan.generate` — `protectedProcedure` mutation in `apps/api/src/routers/meal-plan.router.ts`:

- Fetch `ChefProfile` + `DietaryPreferences` for the session user.
- Call `aiService.generateMealPlan(...)` from T-015 (mock or live, transparent to this procedure).
- Persist `MealPlan` + 7 `MealPlanDay` rows + `Recipe` rows inside a single Prisma transaction.
- Return the full plan.
- On AI provider error, throw `TRPCError` with `INTERNAL_SERVER_ERROR` and a user-facing message.
- Rate-limit: throw `TOO_MANY_REQUESTS` if the user has already generated 3 plans today (check `MealPlan.createdAt`). Rate limit applies in both mock and live modes.

Add `mealPlanRouter` to the root `appRouter`. Create `apps/api/src/application/meal-plan/meal-plan.service.ts` and `packages/database/src/repositories/meal-plan.repository.ts`.

> **Browser Test:** With `AI_MOCK_ENABLED=true`, use the UI button (T-017) to trigger generation. Check DevTools Network tab — confirm the tRPC mutation returns a full plan object. Open `pnpm db:studio` — confirm `meal_plans`, `meal_plan_days`, and `recipes` rows were created. Trigger 4 times in one day — confirm the 4th call returns a rate-limit error shown to the user.

#### T-016A · Global Navigation Redesign — Left Sidebar Shell `M` `P0` ✅ DONE

> **Pre-requisite for T-017 through T-021.** The current navigation (T-004) is a horizontal top bar (`nav-bar.tsx`). The Stitch redesign replaces it with a persistent **left sidebar**. Complete this task before building any Phase 2 page so the shared layout is correct.

**What changes vs. T-004:**

| Before (T-004)                             | After (T-016A)                                          |
| ------------------------------------------ | ------------------------------------------------------- |
| Horizontal top bar, logo + links           | Left sidebar, 220 px wide, always visible ≥ 1024 px     |
| Avatar dropdown in top-right               | Avatar + search bar in a slim top header above `<main>` |
| Links: Dashboard / Meal Plan / Preferences | Sidebar items: 9 items — see table below                |

**Sidebar spec (`apps/web/src/features/nav/components/side-bar.tsx` — new file):**

- **Brand block** (top): "Chefer" wordmark in bold + "The Digital Sous-Chef" tagline in small caps (`text-xs tracking-widest text-muted`). No emoji. Typography uses the Noto Serif / Inter combination from the design system.
- **Nav items** (top-to-bottom, each is an icon + label row):

  | #   | Label         | Icon (`lucide-react`) | Route            | Phase built |
  | --- | ------------- | --------------------- | ---------------- | ----------- |
  | 1   | Dashboard     | `LayoutDashboard`     | `/dashboard`     | Phase 0 ✅  |
  | 2   | Meal Planner  | `CalendarDays`        | `/meal-plan`     | Phase 2     |
  | 3   | Recipes       | `BookOpen`            | `/recipes`       | Phase 3     |
  | 4   | Shopping List | `ShoppingCart`        | `/shopping-list` | Phase 3     |
  | 5   | Tracker       | `ClipboardList`       | `/tracker`       | Phase 4     |
  | 6   | Progress      | `TrendingUp`          | `/progress`      | Phase 4     |
  | 7   | History       | `Clock`               | `/history`       | Phase 3     |
  | 8   | Profile       | `User`                | `/profile`       | Phase 3     |
  | 9   | Preferences   | `Settings`            | `/preferences`   | Phase 1 ✅  |

  Add all 9 items now. Routes that do not have a built page yet will simply 404 — this is intentional and keeps the sidebar stable across all phases. Use `next/link` with `usePathname()` for active detection. All items are clickable from day one; do not disable or grey-out unbuilt routes.

  Use icons from `lucide-react` (already a likely transitive dependency; add if missing).

- **Active state**: Orange filled pill (`bg-primary text-white`) behind the active item + white icon. Detect active route with `pathname.startsWith(route)` so nested routes like `/recipes/[id]` also highlight "Recipes". Inactive items: `text-neutral-600` + `hover:bg-neutral-100`.
- **"Add New" button** (bottom of sidebar, above any bottom padding): Full-width orange button with a `+` icon. Label: "Add New". **Inert for MVP** — renders but does not navigate. Add a `// TODO T-025` comment linking to the recipe-create flow.
- Sidebar width is fixed at `w-56` (224 px). Do not collapse to icon-only yet — that is deferred to T-033 (mobile/responsive polish).
- **Middleware**: Ensure `apps/web/src/middleware.ts` protects all 9 routes: `/dashboard`, `/meal-plan`, `/recipes`, `/shopping-list`, `/tracker`, `/progress`, `/history`, `/profile`, `/preferences` (prefix match on `/recipes` covers both `/recipes` index and `/recipes/[id]` detail pages). Remove any existing `/cookbook` reference from the middleware matcher — `/recipes` now owns that prefix.

**Top header bar (above `<main>`, full width minus sidebar):**

- Global search input: `placeholder="Search for recipes, chefs or ingredients…"`. **Inert for MVP** — UI only, no backend wiring. Add a `// TODO T-025` comment.
- Notification bell icon (no-op, MVP placeholder).
- Cart icon (links to `/shopping-list`).
- User avatar (opens sign-out dropdown — reuse existing `AuthDropdown` logic from T-004; just relocate it here).

**Layout change (`apps/web/src/app/(dashboard)/layout.tsx`):**

```tsx
// Before
<TopNavBar />
<main>{children}</main>

// After
<div className="flex h-screen overflow-hidden">
  <SideBar />
  <div className="flex flex-1 flex-col overflow-hidden">
    <TopHeader />           {/* search + bell + cart + avatar */}
    <main className="flex-1 overflow-y-auto p-6">
      {children}
    </main>
  </div>
</div>
```

**Files to create / modify:**

| Action       | File                                                     |
| ------------ | -------------------------------------------------------- |
| Create       | `apps/web/src/features/nav/components/side-bar.tsx`      |
| Create       | `apps/web/src/features/nav/components/top-header.tsx`    |
| Delete       | `apps/web/src/features/nav/components/nav-bar.tsx`       |
| Modify       | `apps/web/src/app/(dashboard)/layout.tsx`                |
| Possibly add | `lucide-react` to `apps/web/package.json` if not present |

> **Browser Test:**
>
> 1. Log in — confirm the left sidebar renders with all 9 items in order (Dashboard → Meal Planner → Recipes → Shopping List → Tracker → Progress → History → Profile → Preferences) and the "Chefer" brand block at the top.
> 2. Click Dashboard — confirm orange active pill. Click Preferences — confirm orange moves to Preferences. Click Meal Planner — confirm routing to `/meal-plan` (404 is fine at this stage) and "Meal Planner" is highlighted.
> 3. Navigate to a sub-route like `/recipes/some-id` — confirm "Recipes" item remains highlighted (startsWith match).
> 4. Confirm the "Add New" button renders at the bottom of the sidebar and does nothing on click.
> 5. Confirm the top header shows the search bar (inert), bell (inert), cart (links to `/shopping-list`), and avatar in a horizontal row.
> 6. Click the avatar — confirm the sign-out dropdown still appears and sign-out still works (redirects to `/login`).
> 7. In incognito, navigate to each of `/dashboard`, `/tracker`, `/progress`, `/history`, `/recipes` — confirm middleware redirects all of them to `/login`.
> 8. Verify `/dashboard` and `/preferences` (already built) render correctly within the new sidebar layout with no visual regressions.

---

#### T-017 · Meal Planner Page — "Your Weekly Palette" `L` `P0` ✅ DONE

> **⚠️ Design revision (v1.4.0):** This page is now called "Meal Planner" in the sidebar and uses the "Your Weekly Palette" branding. The layout, card design, and bottom recap bar are all new. The nutrition summary panel previously described for this page has moved to the Dashboard (see T-020).

Build `apps/web/src/app/(dashboard)/meal-plan/page.tsx`. This is the primary AI feature screen. It lives within the left-sidebar shell (T-016A).

**Page header area:**

- Eyebrow label: `"YOUR WEEKLY PALETTE"` (`text-xs font-semibold tracking-widest text-muted uppercase`).
- Page title: `"Meal Planner"` (H1, large, bold).
- **Goal selector tabs** (pill tabs, right of title row): `Weight Loss` | `Muscle Gain` | `Maintenance`. Reads from `ChefProfile.goal` on load and pre-selects the matching tab. For MVP, switching tabs is visual-only (no data re-fetch). Orange fill on active tab.
- **"Regenerate Weekly Plan"** button (orange, far right): Triggers the T-018 generation flow. Disabled + spinner if generation is in-flight.

**Week grid (main content):**

- 7 columns (Mon–Sun). Column header: abbreviated day name + date (e.g. `Mon / Oct 23`). Today's column header is orange-tinted.
- 4 rows per column: Breakfast · Lunch · Dinner · Snack (row labels on the left edge).
- **`MealCard` component** (`apps/web/src/features/meal-plan/components/MealCard.tsx`):
  - Food photo (`next/image`, `object-cover`, fallback to a branded placeholder SVG if `recipe.imageUrl` is null).
  - Meal type badge pill: `BREAKFAST` (green) / `LUNCH` (orange) / `DINNER` (indigo) / `SNACK` (purple). Each is a distinct `bg-*` colour using Tailwind.
  - Recipe name: `font-semibold`, 2-line clamp, `text-sm`.
  - Macro summary: `{kcal} kcal · {protein}g P · {carbs}g C` in `text-xs text-muted`.
  - Entire card is a `<Link>` navigating to `/recipes/{recipe.id}?planId={planId}&day={dayOfWeek}&meal={mealType}` (T-019). Use `aria-label="View recipe: {recipeName}"`.
- **Empty cell** (meal slot with no recipe assigned): Dashed border, centred `+` icon. For MVP, clicking does nothing (add `// TODO T-022 swap flow`).

**Day Recap bar (sticky bottom of `<main>`):**

- Visually pinned to the bottom of the main content area (`sticky bottom-0 bg-white border-t`).
- Reflects the **currently focused day** (default: today; clicking a column header selects that day).
- Format: `{DayName} Recap · CALORIES {x}/{target} PROTEIN {x}g/{target}g CARBS {x}g/{target}g FATS {x}g/{target}g`
- All values are derived from the already-fetched plan data — no additional API call.
- A chevron icon on the right is rendered but is inert for MVP (add `// TODO T-027 tracker integration`).

**Empty state (no active plan):**

Centred on page: a food-bowl illustration (SVG, inline or from `packages/ui`), headline `"Your weekly menu awaits"`, sub-copy `"Let AI craft a personalised 7-day plan for you."`, and a full-width orange `"Generate My Week"` CTA button.

**tRPC procedure (new):**

`mealPlan.getActive` — `protectedProcedure` query: returns the most recent `ACTIVE` plan for the session user, joined with all `MealPlanDay` rows and each day's associated `Recipe` rows (id, name, imageUrl, nutritionInfo, prepTimeMins, cuisineType, dietaryTags).

**`loading.tsx` skeleton:** 7 column stubs, each containing 4 grey rounded rectangles (one per meal row). Same grid proportions as the real grid so there is no layout shift on hydration.

> **Browser Test:**
>
> 1. Log in as a user with no plan — confirm the empty state renders with illustration and "Generate My Week" button (no grid visible).
> 2. Generate a plan (T-018), then navigate to `/meal-plan` — confirm 7 columns appear with Mon–Sun headers including date numbers.
> 3. Confirm each filled cell shows: a food photo (or placeholder), the correct meal type badge colour, the recipe name, and the macro line.
> 4. Confirm the Day Recap bar is pinned to the bottom and shows correct Monday totals (cross-check against the fixture in `lib/ai/fixtures/week-plan.fixture.ts`).
> 5. Click a different column header — confirm the Recap bar updates to that day's totals.
> 6. Click a meal card — confirm navigation to `/recipes/[id]` (T-019) with the correct recipe name on the page.
> 7. Throttle the network (DevTools → Slow 3G) — confirm the skeleton loader appears before content, then disappears without layout shift.

#### T-018 · Generate Plan UX & Loading State `M` `P0` ✅ DONE

Wire both entry points for plan generation:

1. **Empty state CTA** ("Generate My Week" button — shown when no active plan exists, T-017).
2. **Page header button** ("Regenerate Weekly Plan" — shown when a plan already exists, T-017).

Both buttons call `trpc.mealPlan.generate`.

**While mutation is in-flight:**

- Disable and show a spinner inside the triggering button.
- Show a full-viewport overlay (z-index above sidebar + header). The overlay contains: the "Chefer" brand mark centred, and a cycling progress message that advances every ~2 seconds:
  `"Analysing your preferences…"` → `"Crafting your menu…"` → `"Balancing nutrition…"` → `"Finalising your week…"`
- The overlay **cannot be dismissed** by clicking outside (pointer-events: none on the backdrop for the close action; the overlay itself absorbs all clicks).

**On success:**

- Dismiss overlay.
- Invalidate `mealPlan.getActive` query (TanStack Query refetches automatically).
- Grid cells animate in with a staggered CSS transition: each column enters 80 ms after the previous one (`animation-delay: {colIndex * 80}ms`, `fade-in + slide-up`).

**On error:**

- Dismiss overlay.
- Show an inline banner directly below the page header: `"Something went wrong generating your plan."` + an orange `[Retry]` text link that re-triggers the mutation. Banner is dismissible via an `×` icon.

**Rate limit (enforced by T-016):**

When the user has already generated 3 plans today, the "Regenerate Weekly Plan" button is disabled (greyed out) and a `title` tooltip reads `"Daily limit reached — try again tomorrow"`. Do not show this for the empty-state "Generate My Week" button (it should only appear in the header when a plan exists).

> **Browser Test:**
>
> 1. Click "Generate My Week" from the empty state — confirm overlay appears with the brand mark and cycling messages; confirm it cannot be dismissed mid-generation.
> 2. Wait for mock completion — confirm overlay closes and grid columns animate in with visible stagger.
> 3. Click "Regenerate Weekly Plan" from the page header — same overlay flow.
> 4. Simulate network error (disable API) — confirm the inline error banner appears with a Retry link, and clicking Retry re-triggers the mutation.
> 5. Generate 3 plans in one session (or temporarily lower the rate limit in code) — confirm the Regenerate button is disabled with a tooltip on the 4th attempt.

#### T-019 · Recipe Detail Page `M` `P1` ✅ DONE

> **⚠️ Design revision (v1.5.0):** Recipe detail is a **dedicated full page**, not a slide-over drawer. The Stitch screen "Chefer: Recipe Detail (Updated Nav)" shows this page within the left-sidebar shell at route `/recipes/[id]`.

**Route:** `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx` — server component.

**Data fetching:** `mealPlan.getRecipe` — new `protectedProcedure` query. Input: `{ recipeId: string }`. Returns a single `Recipe` row by id. Add to `meal-plan.router.ts` (the recipe belongs to the meal plan domain for now; move to the dedicated `recipe.router.ts` built in T-025).

**Page layout (within left-sidebar shell):**

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Meal Planner          [Swap Recipe] [♡ Save]       │
├──────────────────────────────────────────────────────────────┤
│ [HERO IMAGE — full width, h-64, object-cover, rounded-xl]    │
│                                                              │
│ [BREAKFAST badge] [ITALIAN badge]   25 min prep · 4 servings │
│ Recipe Name (H1, Noto Serif, large)                          │
│ Short description (text-muted, 2–3 lines)                    │
├───────────────────────────┬──────────────────────────────────┤
│  Ingredients              │  Nutrition Facts                 │
│  Servings adjuster (1–8)  │  Calories · Protein · Carbs · Fat│
│  • Item · qty · unit      │  (4 rows, labelled)              │
│  • Item · qty · unit      │                                  │
├───────────────────────────┴──────────────────────────────────┤
│  Instructions                                                │
│  1. Step one text…                                           │
│  2. Step two text…                                           │
└──────────────────────────────────────────────────────────────┘
```

**Sections:**

- **Back link**: `← Back to Meal Planner` — uses `next/link` to `/meal-plan`. Positioned at the top-left (`text-sm text-muted hover:text-primary`).
- **Hero image**: `next/image` with `priority`, `object-cover`, rounded corners. Fall back to a branded food-bowl SVG placeholder if `recipe.imageUrl` is null.
- **Badge row**: Meal type badge (colour from T-017 spec: green/orange/indigo/purple) + cuisine type badge (secondary styling). Right-side inline: prep time + cook time + serving count.
- **H1**: Recipe name using Noto Serif, large. Below: short description, 3-line clamp.
- **Action bar** (below H1, before two-column split):
  - `"Swap Recipe"` — orange outlined button. Calls `trpc.mealPlan.swapRecipe` (T-022). **Inert until T-022** — add `disabled` + `title="Coming in a future update"` + `// TODO T-022`.
  - `"Save to Recipes"` — heart icon button. Calls `trpc.recipe.toggleFavourite` (T-025). **Inert until T-025** — same pattern.
  - Pass `planId`, `dayOfWeek`, and `mealType` as query params when navigating from `MealCard` (e.g. `/recipes/abc?planId=xyz&day=0&meal=breakfast`) so the Swap action has the context it needs. The page reads these from `searchParams` and passes them to the Swap mutation. If the params are absent (e.g. accessed from the `/recipes` browse page), hide the Swap button entirely.
- **Ingredients section** (left column on ≥ lg screens, stacked on mobile):
  - Servings adjuster: `−` / number / `+` stepper (1–8). Changes the serving count in local state. All ingredient quantities scale proportionally: `displayQty = (baseQty / recipe.servings) * selectedServings`. Round to 1 decimal place.
  - Ingredient list: one row per ingredient — `bullet · name · scaled-qty · unit`. Use `ul` + `li` for semantics.
- **Nutrition Facts section** (right column on ≥ lg screens):
  - 4 rows: Calories · Protein · Carbs · Fat. Each shows the label + value from `nutritionInfo` JSON. Values do **not** scale with serving count — show per-recipe values with a note `"Per ${recipe.servings} servings"`. Scaling nutrition is deferred to T-027.
- **Instructions section** (full width below the two-column split):
  - Ordered list (`ol`). Each `<li>` is one instruction string from `recipe.instructions[]`. Use `counter-reset` / `counter-increment` for custom numbered styling (large orange circle counter per the design system's accent colour).

**Files to create / modify:**

| Action | File                                                                    |
| ------ | ----------------------------------------------------------------------- |
| Create | `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx`                    |
| Create | `apps/web/src/app/(dashboard)/recipes/[id]/loading.tsx` (skeleton)      |
| Modify | `apps/api/src/routers/meal-plan.router.ts` (add `getRecipe` query)      |
| Modify | `apps/web/src/features/meal-plan/components/MealCard.tsx` (Link → page) |

**`MealCard` change:** Replace the `onClick` handler (which previously opened a drawer) with a `next/link` `<Link>` wrapping the card:

```tsx
<Link
  href={`/recipes/${recipe.id}?planId=${planId}&day=${dayOfWeek}&meal=${mealType}`}
  aria-label={`View recipe: ${recipe.name}`}
>
  {/* existing card content */}
</Link>
```

Remove any drawer state (`isOpen`, `setIsOpen`) and the drawer component import from the meal plan page.

> **Browser Test:**
>
> 1. On `/meal-plan`, click any meal card — confirm navigation to `/recipes/[id]` with the correct query params in the URL.
> 2. Confirm the page renders with: hero image (or SVG placeholder), recipe name (Noto Serif H1), description, badge row with correct meal type colour, ingredient list, nutrition panel, and numbered instructions.
> 3. Change servings from 2 to 4 — confirm all ingredient quantities double. Change to 1 — confirm they halve.
> 4. Confirm the "Swap Recipe" button is visible but disabled with a tooltip. Confirm the "Save to Cookbook" button is visible but disabled.
> 5. Click "← Back to Meal Planner" — confirm navigation to `/meal-plan`.
> 6. Access `/recipes/[id]` without query params (e.g. paste URL directly) — confirm the page still renders correctly and the Swap button is hidden (no context).
> 7. Throttle network (Slow 3G) — confirm `loading.tsx` skeleton renders before content, with correct proportions matching the final layout.

#### T-020 · Nutrition Panel — Dashboard Right Column `M` `P1` ✅ DONE

> **⚠️ Design revision (v1.4.0):** The nutrition summary has moved from the Meal Planner page to the **Dashboard** (`/dashboard`) right column. The Meal Planner has its own lighter "Day Recap" bar at the bottom (built in T-017). This task builds the Dashboard nutrition panel only. **Do not add a nutrition widget to `/meal-plan`.**

Build the right-column nutrition panel as a server-rendered sub-component of the Dashboard page (T-021). It is isolated here so T-020 and T-021 can be reviewed/tested separately.

**Panel anatomy (`apps/web/src/features/dashboard/components/NutritionPanel.tsx`):**

- **Header row**: "Nutrition" label + status badge:
  - `"ON TRACK"` (green pill) — planned kcal for today ≤ `dailyCalorieTarget`.
  - `"OVER TARGET"` (red pill) — planned kcal for today > `dailyCalorieTarget`.
- **Calorie ring** (SVG doughnut, no Recharts — keep it lightweight): Centre shows consumed/planned kcal in large bold text. Below the ring, a smaller line shows the remaining kcal: `{remaining} remaining`.
  - Ring arc fill colour: orange. Background arc: `#F3F4F6`.
  - Do **not** import Recharts for this widget; a raw SVG `<circle>` with `stroke-dasharray`/`stroke-dashoffset` is sufficient.
- **Macro progress bars** (3 rows):
  Each row: macro name + `{consumed}g / {target}g` label (right-aligned) + full-width orange filled bar.
  - Protein (target from `ChefProfile` — use `dailyCalorieTarget * 0.30 / 4` as a rough target if no separate macro targets are stored; note this as a simplification in a code comment).
  - Carbs (`dailyCalorieTarget * 0.45 / 4`).
  - Fat (`dailyCalorieTarget * 0.25 / 9`).
  - Bar fill %: `Math.min((consumed / target) * 100, 100)` (capped at 100%).
- **AI hint pill** (bottom of panel, orange-tinted background): `"Your upcoming {nextRecipeName} is high in protein, which will help you reach your daily goal of {target}g."` Derives `nextRecipeName` from the first unstarted meal in today's plan. If no plan or no next meal, omit the hint entirely.

**Data source:**

All values for MVP use **planned** intake (meals assigned to today in the active plan), not actual logged intake (that's T-027). Show the panel header as `"Planned Today"` to set the right expectation. Numbers come from the `dashboard.summary` tRPC query (built in T-021) — no separate API call from this component.

> **Browser Test:**
>
> 1. Navigate to `/dashboard` with an active plan — confirm the Nutrition panel renders in the right column with the calorie ring, 3 macro bars, and the AI hint.
> 2. Verify the calorie ring number matches the sum of today's planned meal kcal from the fixture.
> 3. Edit `week-plan.fixture.ts` temporarily to set today's total well above `dailyCalorieTarget` — confirm the badge switches to "OVER TARGET" (red). Revert.
> 4. Verify the AI hint references a real recipe name from the plan.
> 5. Navigate to `/meal-plan` — confirm there is **no** nutrition ring/panel there (only the Day Recap bar at the bottom of the page).
> 6. Log in as a user with **no active plan** — confirm the Nutrition panel shows `"—"` placeholders and no AI hint.

---

### Phase 3 — Power Features (T-021 to T-026)

> **Goal:** Make the product sticky. Users can swap individual meals, get a smart shopping list, browse past plans, and save their favourite recipes to influence future AI generations.

#### T-021 · Dashboard — "Your Daily Overview" `L` `P0` ✅ DONE

> **⚠️ Design revision (v1.4.0):** Full redesign. Replace the stub entirely with the new "Your Daily Overview" layout.
> **Design source:** Stitch screens "Chefer: Restructured Dashboard Overview" (`2e70ce178f97482fb4143cf931790b7b`) and "Chefer: Interactive Daily Dashboard" (`071613c65e0943d8999e943a676c32ce`). Key elements implemented: greeting header with date badge, 7-day weekly outlook strip, Next Meal spotlight card with Start Cooking CTA, Rest of Today meal list, Recent Favourites horizontal scroll, right-column Nutrition Panel with SVG calorie ring + macro bars + AI hint pill. The previous stub's quick-action buttons and plan-status card are removed. The nutrition ring (built in T-020) occupies the right column. This task wires the left column and the tRPC backend query.

**File:** `apps/web/src/app/(dashboard)/dashboard/page.tsx` — server component that calls `dashboard.summary` and passes data to client sub-components.

---

**Page layout (within left-sidebar shell from T-016A):**

```
┌─────────────────────────────────────────────────────────┐
│ WELCOME BACK, CHEF                    Monday, October 23 │
│ Your Daily Overview           [SUSTAINABLE CHOICE badge] │
├──────────────────────────────────┬──────────────────────┤
│ Weekly Outlook card              │                       │
│ [Mon][Tue][Wed][Thu][Fri][Sat][Sun]│  Nutrition Panel     │
├──────────────────────────────────│  (T-020)             │
│ Next Meal spotlight card         │                       │
│  [photo] Recipe Name             │  Calorie ring         │
│          Description snippet     │  Protein bar          │
│          kcal · servings · ★★★★☆ │  Carbs bar            │
│          [Start Cooking →]       │  Fat bar              │
├──────────────────────────────────│                       │
│ Rest of Today                    │  AI hint pill         │
│  1:00 PM · SNACK · Greek Yogurt  │                       │
│  7:00 PM · DINNER · Salmon       │                       │
├──────────────────────────────────┴──────────────────────┤
│ Recent Favorites (horizontal scroll)                     │
│  [card] [card] [card] [card]          [View All →]       │
└─────────────────────────────────────────────────────────┘
```

Left column is `flex-1`; right column (Nutrition Panel) is `w-72` (`~288px`), `self-start sticky top-6`.

---

**Page header:**

- Eyebrow label: `"WELCOME BACK, CHEF"` — small-caps, muted colour, `text-xs tracking-widest`.
- H1: `"Your Daily Overview"` — large, bold.
- Right-aligned: current date string (e.g. `"Monday, October 23"` — formatted server-side from `new Date()`) + `"SUSTAINABLE CHOICE"` green badge. For MVP, show the badge whenever an active plan exists. (A future iteration can gate it on actual nutritional criteria.)

---

**Left column — Weekly Outlook card:**

- Card header: `"WEEKLY OUTLOOK"` label (small caps, left) + `"FULL SCHEDULE →"` link to `/meal-plan` (right, orange text).
- Horizontal row of 7 pill buttons (Mon–Sun). Each shows abbreviated day name + date number.
  - **Today's pill**: orange fill, white text.
  - **Day with a plan entry** (has at least one recipe): small orange dot below the date number.
  - **Day with no plan entry**: no dot.
- Clicking a day pill is **inert for MVP** (add `// TODO T-022 — jump to day on Meal Planner`).
- Data: derive day labels + dots from the `weekPlan` array in `dashboard.summary`.

---

**Left column — Next Meal spotlight card:**

- Derives from the first meal in today's plan that is scheduled **after the current server time** (use `dayOfWeek` + wall-clock heuristic: Breakfast < 11 AM, Lunch < 3 PM, Dinner < 9 PM, Snack = any remaining).
- Layout: two-column inside the card. Left ~45%: `<Image>` with `object-cover`, rounded corners. Right ~55%:
  - Badge row: `"NEXT MEAL"` (orange) + meal type badge (colour per T-017 spec).
  - Recipe name: H2, bold.
  - Short description: 2 lines, `line-clamp-2`, `text-sm text-muted`.
  - Icon row: `{servings} servings` · `{kcal} kcal` · star rating (from fixture `rating` field, render as filled/outline stars).
  - CTA: `"Start Cooking →"` — orange filled button. Navigates to `/recipes/{recipe.id}` (the recipe detail page, T-019).
- If there is no "next meal" (all meals for today are in the past, or no plan): render a card with an empty-food-bowl illustration, copy `"You're all caught up for today 🎉"`, and a `"View full plan →"` link.

---

**Left column — Rest of Today list:**

- Section header: `"Rest of Today"`.
- One row per remaining meal today, excluding the Next Meal spotlight. Each row:
  - Time string (e.g. `"7:00 PM"`, derived from the wall-clock heuristic above).
  - Meal type badge (same colour system as T-017).
  - Recipe name (`font-medium`).
  - kcal (right-aligned, `text-sm text-muted`).
- If no remaining meals (or no plan): hide the section entirely.

---

**Left column — Recent Favorites:**

- Section header: `"Recent Favorites"` + `"View All →"` link to `/recipes?filter=saved`.
- Horizontally scrollable row (`overflow-x-auto`, `flex gap-4`, hide scrollbar with `scrollbar-hide` utility class or Tailwind plugin).
- Up to 4 `RecipeFavoriteCard` components:
  - Food photo (`next/image`, `w-36 h-36 object-cover rounded-xl`).
  - Recipe name (`text-sm font-semibold`, 1-line clamp).
  - Category tag (e.g. `"ITALIAN"`, small caps, muted).
  - Prep time (e.g. `"15 MINS"`).
- `"View All →"` link on the right (only shown if `recentFavourites.length === 4` — i.e. there may be more).
- Empty state (no favourites yet): muted copy `"Save a recipe to your favourites to see it here."` + link to `/meal-plan`.

---

**tRPC — `dashboard.summary` query:**

Create `apps/api/src/routers/dashboard.router.ts` and `apps/api/src/application/dashboard/dashboard.service.ts`:

```ts
// Return type
type DashboardSummary = {
  user: { firstName: string; displayName: string | null };
  today: { date: string; dayOfWeek: number }; // ISO date string + 0=Mon index
  weekPlan: {
    dayOfWeek: number;
    meals: { mealType: string; recipeId: string; recipeName: string }[];
  }[];
  nextMeal: {
    mealType: string;
    recipe: {
      id: string;
      name: string;
      description: string;
      imageUrl: string | null;
      nutritionInfo: Json;
      servings: number;
      rating?: number;
    };
  } | null;
  restOfToday: {
    mealType: string;
    scheduledLabel: string; // e.g. "7:00 PM"
    recipeName: string;
    kcal: number;
  }[];
  recentFavourites: {
    id: string;
    name: string;
    imageUrl: string | null;
    cuisineType: string;
    prepTimeMins: number;
  }[];
  nutrition: {
    dailyCalorieTarget: number;
    plannedKcal: number;
    protein: { planned: number; targetG: number };
    carbs: { planned: number; targetG: number };
    fat: { planned: number; targetG: number };
  };
};
```

The service fetches: `ChefProfile`, active `MealPlan` with today's `MealPlanDay` and recipes, and up to 4 `FavouriteRecipe` rows. Returns `null` for `nextMeal` and empty arrays for `weekPlan` / `restOfToday` / `recentFavourites` if the user has no active plan — **no 500 error**.

Add `dashboardRouter` to the root `appRouter` in `apps/api/src/routers/index.ts`.

**Seeding:** Ensure `pnpm db:seed` creates at least 2 `FavouriteRecipe` rows for `alice@chefer.dev` (linked to recipe rows created during seeding) so the Recent Favorites section is non-empty during development and testing.

> **Browser Test:**
>
> 1. Navigate to `/dashboard` as `alice@chefer.dev` — confirm the greeting shows "Alice" (or her display name).
> 2. Confirm the Weekly Outlook shows all 7 days, today highlighted orange, and dots only on days with plan data.
> 3. Confirm the Next Meal card shows a photo, the correct recipe name, kcal, and "Start Cooking" button.
> 4. Confirm "Rest of Today" lists subsequent meals with time labels and kcal values.
> 5. Confirm Recent Favorites shows at least 2 recipe cards in a horizontally scrollable row.
> 6. Confirm the Nutrition Panel (right column) from T-020 renders alongside the left column with correct values.
> 7. Log in as a brand-new user (no active plan, no favourites) — confirm: Next Meal shows "You're all caught up" empty state, Rest of Today is hidden, Recent Favorites shows the empty-state copy, and the Nutrition Panel shows `"—"` placeholders.
> 8. Click "Start Cooking" — confirm navigation to `/recipes/[id]` (T-019) for the correct recipe.

#### T-022 · Swap Individual Recipe (AI-Powered) `L` `P1` ✅ DONE

> **Design source:** Stitch screen "Chefer: Recipe Detail" (`3026367cb60140dbb887e329f42985c6`). The "Swap Recipe" outlined orange button in the action bar is now wired. On click, a `RefreshCw` spinning icon is shown while the mutation is in flight. On success, the page navigates to the new recipe's detail page (preserving `planId`/`day`/`meal` query params). On error, a red dismissible error banner appears below the nutrition panel.

Add `mealPlan.swapRecipe` — `protectedProcedure` mutation. Input: `{ planId, dayOfWeek, mealType, reason? }`. Call `aiService.generateRecipeSwap(...)` — in mock mode returns a deterministic replacement from `apps/api/src/lib/ai/fixtures/swap-recipes.fixture.ts`, cycling through fixtures so repeated swaps change the displayed recipe; in live mode calls the LLM with user preferences and original recipe as context. Update the `MealPlanDay.meals` JSON and create/reuse a `Recipe` row atomically. Return the new recipe.

Frontend: wire the "Swap Recipe" button on the T-019 recipe detail page. On success, navigate back to `/meal-plan` and the grid cell updates. Optimistic update is not required for this page-navigation flow — show a loading spinner on the button, navigate on success, or show an inline error on failure.

> **Browser Test:** Navigate to a recipe detail page from the meal plan grid and click "Swap Recipe". Confirm a spinner appears on the button. On success, confirm navigation to `/meal-plan` with the swapped cell showing a new recipe name. Navigate back to `/recipes/[newId]` — confirm the new recipe details are displayed. Click Swap again — confirm it swaps to a different fixture recipe. Confirm the nutrition Day Recap bar on `/meal-plan` reflects the updated totals.

#### T-023 · Shopping List Generation `L` `P1` ✅ DONE

> **Design source:** Stitch screen "Chefer: Shopping List" (`3026367cb60140dbb887e329f42985c6`). Key elements: category group headers, checklist rows with checkbox + ingredient name + quantity/unit, progress bar (checked/total), print button, Chef's Tip callout, empty state for no active plan.

Add `mealPlan.getShoppingList` — `protectedProcedure` query. Input: `{ planId }`. Aggregate all `ingredients` JSON arrays from the plan's recipes, merge duplicates (same ingredient name), sum quantities (unit-aware: "1 cup" + "2 cups" = "3 cups"), group by category (Produce, Proteins, Dairy, Grains & Pantry, Frozen). Return sorted JSON. Implement in a `ShoppingListService`.

Build `apps/web/src/app/(dashboard)/shopping-list/page.tsx` — server-fetches the list for the active plan and renders a grouped checklist. Checkbox checked state is stored in `localStorage` (keyed by `planId + ingredientName`) via the `useLocalStorage` hook already at `apps/web/src/hooks/use-local-storage.ts`.

> **Browser Test:** Navigate to `/shopping-list`. Confirm items are grouped by category with correct headings. Check off an item — confirm its checkbox stays checked after a page refresh. Verify that an ingredient appearing in multiple days has its quantities summed (check the fixture data). Confirm the page shows a helpful empty state for a user with no active plan.

#### T-024 · Meal Plan History & Archives `M` `P1`

Add `mealPlan.list` — `protectedProcedure` query: returns paginated list of user's meal plans (newest first, 10 per page). Add `mealPlan.restore` — `protectedProcedure` mutation: sets a plan's status to `ACTIVE` and the previous active plan to `ARCHIVED`.

Build `apps/web/src/app/(dashboard)/history/page.tsx` — a card per past week showing: date range, 3 recipe names preview, macro summary, "View" (read-only plan) and "Restore" buttons. The read-only view reuses the `/meal-plan` grid component but with all interactive controls (swap, generate) hidden.

> **Browser Test:** Generate 2+ plans (archive the first by generating the second). Navigate to `/history` — confirm both plans appear as cards with date ranges and recipe previews. Click View on an old plan — confirm the grid renders in read-only mode (no Swap or Generate buttons). Click Restore — confirm the plan becomes active and is visible on `/meal-plan`.

#### T-025 · Recipes Browse Page & Favourites `L` `P2` ✅ DONE

> **Design source:** Stitch screen "Chefer: Favorite Recipes" (`13d56458203c4f7aa631eb2d8ddb0600`). Key elements: tab bar (All Recipes / ♥ Saved), search input with debounce, 3-column recipe grid with heart overlay, cuisine tag + macro chips on each card, recipe detail page Save/Swap action bar, servings adjuster, nutrition facts panel.
> **Design note (v1.5.0):** The sidebar "Recipes" item routes to `/recipes` — a **new general-purpose recipe browser page**, not a personal cookbook. Favourites ("Saved") become a filter tab within this page. There is no separate `/cookbook` route.

**Database:**

Add `FavouriteRecipe` Prisma model: `userId` FK, `recipeId` FK, `savedAt`, unique constraint on `[userId, recipeId]`, `useInNextPlan` `Boolean` default `false`. Run `pnpm db:migrate`.

**tRPC procedures** (new router `apps/api/src/routers/recipe.router.ts`):

- `recipe.list` — `protectedProcedure` query. Input: `{ search?: string, dietaryTags?: string[], cuisineType?: string, savedOnly?: boolean, cursor?: string }`. Returns paginated `Recipe[]` from the user's meal plan history. When `savedOnly=true`, filters to `FavouriteRecipe` rows only. Supports cursor-based pagination (10 per page).
- `recipe.toggleFavourite` — `protectedProcedure` mutation. Input: `{ recipeId: string }`. Upserts/deletes a `FavouriteRecipe` row. Returns `{ isSaved: boolean }`.
- `recipe.toggleUseInNextPlan` — `protectedProcedure` mutation. Input: `{ recipeId: string, useInNextPlan: boolean }`. When `AI_MOCK_ENABLED=false`, the AI prompt builder reads `useInNextPlan=true` favourites and includes their names in the system prompt as hints.

Add `recipeRouter` to root `appRouter`.

**`/recipes` index page (`apps/web/src/app/(dashboard)/recipes/page.tsx`):**

- **Page header**: eyebrow `"YOUR COLLECTION"`, H1 `"Recipes"`.
- **Tab bar** (just below the header, orange underline on active):
  - `All Recipes` — shows every recipe generated across all the user's meal plans (deduplicated by recipe id).
  - `Saved` — shows only `FavouriteRecipe` rows (`savedOnly=true`).
- **Filter row** (below tab bar):
  - Search input (wired to `recipe.list` with debounce 300 ms).
  - Cuisine filter dropdown (multi-select, options derived from distinct `cuisineType` values already in the DB).
  - Dietary tags filter (multi-select chips from `dietaryTags` values).
- **Recipe grid**: 3-column masonry-style card grid on desktop (2-col on tablet). Each card:
  - Food photo (`next/image`, `object-cover`, `rounded-xl`).
  - Heart icon overlay (top-right corner of the photo): filled orange when saved, outline when not. Clicking calls `recipe.toggleFavourite` without navigating away (optimistic update).
  - Recipe name (`font-semibold`, 1-line clamp).
  - Cuisine tag + dietary tags chips (first 2 visible, `+N more` if overflow).
  - Prep time + kcal.
  - Clicking the card body (not the heart) navigates to `/recipes/[id]` (T-019).
- **Infinite scroll / Load more**: A `"Load more"` button at the bottom of the grid triggers the next cursor page. Do not use intersection-observer for MVP — a manual button is sufficient.
- **Empty states**:
  - "All Recipes" with no plans yet: illustration + copy `"Generate your first meal plan to start building your recipe collection."` + orange `"Go to Meal Planner"` button → `/meal-plan`.
  - "Saved" with no favourites: copy `"Save a recipe to your collection by tapping the ♡ on any recipe."` + link to "All Recipes" tab.

**Wire-up from T-019:**

The "Save to Cookbook" button on the recipe detail page (rendered disabled in T-019) is now wired to `recipe.toggleFavourite`. Update the button label to "Save to Recipes" and toggle between filled/outline heart icon based on the `isSaved` state (fetch via `recipe.list` with `savedOnly=false` and check the current recipe's saved status, or add a lightweight `recipe.isSaved` query if preferred).

**Wire-up from `MealCard`:**

The small heart overlay in `MealCard` (mentioned in the T-025 original spec) calls `recipe.toggleFavourite` without navigating away. Use optimistic update: toggle the icon immediately, revert on error.

**AI prompt hint:**

When `AI_MOCK_ENABLED=false`, the AI prompt builder in `lib/ai/prompts.ts` fetches `useInNextPlan=true` favourites for the session user and appends them to the system prompt: `"The user has flagged these recipes to include in their next plan: {names}"`.

**Files to create / modify:**

| Action | File                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Create | `apps/web/src/app/(dashboard)/recipes/page.tsx`                           |
| Create | `apps/web/src/app/(dashboard)/recipes/loading.tsx` (grid skeleton)        |
| Create | `apps/api/src/routers/recipe.router.ts`                                   |
| Create | `apps/api/src/application/recipe/recipe.service.ts`                       |
| Modify | `apps/api/src/routers/index.ts` (add `recipeRouter`)                      |
| Modify | `apps/web/src/features/meal-plan/components/MealCard.tsx` (heart overlay) |
| Modify | `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx` (wire Save button)   |

> **Browser Test:**
>
> 1. Navigate to `/recipes` — confirm "All Recipes" tab is active and the grid shows all recipes from Alice's active plan (seeded data).
> 2. Click the "Saved" tab — confirm an empty state renders (no favourites yet).
> 3. Click the heart on a recipe card — confirm it fills orange optimistically. Switch to "Saved" tab — confirm that recipe appears.
> 4. Click the heart again on the saved recipe card — confirm it empties. Switch to "Saved" tab — confirm it is gone.
> 5. Type a recipe name fragment in the search box — confirm the grid filters in real time (debounced).
> 6. Navigate to `/recipes/[id]` — confirm "Save to Recipes" button is now clickable. Click it — confirm heart fills and navigating back to `/recipes?filter=saved` shows the recipe.
> 7. Toggle "Use in Next Plan" on a saved recipe — confirm state persists across refresh.
> 8. Navigate to `/recipes` as a brand-new user (no plans) — confirm the "All Recipes" empty state with the "Go to Meal Planner" CTA renders correctly.

#### T-026 · Meal Ratings & Feedback Loop `M` `P2`

Add `MealRating` Prisma model: `userId` FK, `recipeId` FK, unique on `[userId, recipeId]`, `rating` `Int` (1–5), `notes` `String?`, `ratedAt`. Run `pnpm db:migrate`.

Add `recipe.rate` — `protectedProcedure` mutation. On the T-019 recipe detail page, show a star rating widget in the bottom section only when `dayOfWeek` of the meal has already passed relative to `MealPlan.weekStartDate` (derive this from the `day` query param on the URL; if absent, hide the widget). When `AI_MOCK_ENABLED=false`, the AI prompt builder fetches the user's top-rated (≥4 stars) and low-rated (≤2 stars) recipe names and includes them in the system prompt.

> **Browser Test:** Navigate to `/recipes/[id]?day=0` where day 0 is in the past — confirm the star rating widget is visible at the bottom of the page. Click 4 stars — confirm the rating saves and is pre-selected on revisiting the page. Navigate to `/recipes/[id]?day=6` (future day) — confirm the rating widget is hidden. Navigate to `/recipes` — confirm highly-rated recipes have a star badge overlaid on their card.

---

### Phase 4 — Tracking & Engagement (T-027 to T-032)

> **Goal:** Close the feedback loop. Users track daily intake, see progress charts, receive email notifications, rate meals, and can chat with an AI chef for ad-hoc advice.

#### T-027 · Calorie & Macro Tracking – Daily Log `L` `P1`

Add `DailyLog` Prisma model: `userId` FK, `date` `DateTime` (date only, use `@db.Date`), unique on `[userId, date]`, `loggedMeals` `Json`, `totalKcal` `Int`, `totalProtein` `Float`, `totalCarbs` `Float`, `totalFat` `Float`. Run `pnpm db:migrate`.

Add `tracker.getDay` — `protectedProcedure` query (input: `{ date }`). Add `tracker.upsertDay` — `protectedProcedure` mutation (input: `{ date, loggedMeals }`; derives totals server-side from recipe nutrition data). Add `trackerRouter` to root `appRouter`.

Build `apps/web/src/app/(dashboard)/tracker/page.tsx`. Pre-populate today's meals from the active plan. Allow checking off meals and adjusting portion size (0.5× / 1× / 1.5× / 2× multiplier). Show day-level macros progress bars below the list.

> **Browser Test:** Navigate to `/tracker`. Confirm today's meals from the active plan are pre-populated. Check off a meal — confirm it gets a strike-through style and the macros bar updates. Adjust portion size to 2× — confirm kcal doubles in the totals. Navigate to tomorrow (if that day has plan data) — confirm its meals pre-populate. Refresh — confirm checked state is preserved.

#### T-028 · Progress Charts `M` `P1`

Add `tracker.weeklySummary` — `protectedProcedure` query: returns last 7 days of `DailyLog` data + the user's `dailyCalorieTarget`. Add `tracker.monthlySummary` — same for 28 days.

On `/dashboard`, add a weekly progress section with two charts using **Recharts**:

1. Daily calorie intake vs. target line chart (past 7 days).
2. Weekly macros stacked bar chart (protein / carbs / fat).

Build `apps/web/src/app/(dashboard)/progress/page.tsx` with the same charts extended to 28 days.

> **Browser Test:** Log tracker data for 3+ days (via T-027). Navigate to `/dashboard` — confirm the line chart shows actual vs. target with correct values and the macros bar chart is populated. Navigate to `/progress` — confirm the charts extend further back. Hover chart data points — confirm tooltips show the correct kcal/macro values.

#### T-029 · Weight Tracking & Goal Progress `M` `P2`

Add `WeightEntry` Prisma model: `userId` FK, `weightKg` `Float`, `recordedAt` `DateTime`. Run `pnpm db:migrate`.

Add `tracker.logWeight` — `protectedProcedure` mutation. Add `tracker.weightHistory` — `protectedProcedure` query.

Add a weight log widget to `/progress`: input for today's weight (kg or lbs based on `ChefProfile` unit preference), Recharts line chart of weight over time with a goal target line derived from `ChefProfile.goal` and starting weight. Show summary stats: starting weight, current weight, goal weight (estimated from goal type), total change, estimated weeks to goal (based on average weekly deficit from `DailyLog`).

> **Browser Test:** Navigate to `/progress`. Enter today's weight and click Log — confirm the data point appears on the chart immediately. Enter a second entry for a different date — confirm the chart shows a trend line. Confirm the summary stats panel shows non-zero, sensible values. Change units in preferences to lbs — confirm the weight input and chart labels reflect the change.

#### T-030 · Email Notifications – Weekly Plan Ready `M` `P2`

Integrate Resend (`RESEND_API_KEY` in env, omit locally — email silently skipped when key is absent). After `mealPlan.generate` commits to DB, fire-and-forget an email to the user's address.

Create `apps/api/src/lib/email/templates/plan-ready.tsx` using **React Email**: a styled 7-day plan summary table (day + meal names). Create `apps/api/src/lib/email/email.service.ts` wrapping the Resend SDK.

Add `emailNotifications` `Boolean` default `true` to `ChefProfile`. Add a notification toggle in the `/preferences` settings page. Skip sending if the user has opted out.

> **Browser Test:** Locally with no `RESEND_API_KEY` set: generate a plan and confirm no errors are thrown (email silently skipped). To test with a real send: temporarily set `RESEND_API_KEY` to a test key, generate a plan, check the email at the seed user's address. Confirm the toggle in `/preferences` saves and that a second generation with the toggle off does not attempt to send.

#### T-031 · Shopping List Export (PDF & Share Link) `M` `P2`

Add a "Download PDF" button on `/shopping-list` using `@react-pdf/renderer` (runs in the browser, no server-side Puppeteer). The PDF is a clean 1-page layout with the grouped shopping list.

Add `mealPlan.createShoppingListShareToken` — `protectedProcedure` mutation: generates a JWT (24h expiry, signed with `NEXTAUTH_SECRET`; the variable name is reused for JWT signing even without NextAuth) encoding `{ planId, userId }`. Returns the token.

Build `apps/web/src/app/share/shopping-list/[token]/page.tsx` — a public page (no auth required) that verifies the JWT server-side, fetches the shopping list, and renders it read-only with checkboxes.

> **Browser Test:** On `/shopping-list`, click "Download PDF" — confirm a PDF downloads and opens correctly in a PDF viewer. Click "Share" — confirm a URL is copied to clipboard. Open that URL in an incognito window — confirm the list renders without requiring login. After 24 hours (or by expiring the JWT manually), confirm the share link returns a "Link expired" message.

#### T-032 · AI Chat – Ask Your Chef `XL` `P2`

**Exception to the tRPC rule:** streaming responses require a Next.js Route Handler. Build `apps/web/src/app/api/chat/route.ts` (POST). This is the **only** Next.js API route in the app.

The route handler:

- Verifies auth via the `chefer_session` cookie (call the same session-resolution logic used by the API middleware).
- Accepts `{ messages: ChatMessage[], context: { activePlanId? } }`.
- Calls `aiService.chat(...)` from the AI service factory — in mock mode, streams word-by-word from `apps/api/src/lib/ai/fixtures/chat-responses.fixture.ts` with a ~30ms inter-word delay; in live mode, calls the LLM with a system prompt that includes user preferences and active meal plan as context.
- Streams the response using the Vercel AI SDK `StreamingTextResponse`.

Build a floating chat widget in `apps/web/src/features/chat/components/ChatWidget.tsx` — bottom-right FAB, slide-up panel, `useChat` hook from `ai/react`. Suggested prompts: "What can I substitute for chicken?", "Make me a high-protein breakfast". Store last 20 messages in `sessionStorage`.

> **Browser Test:** Confirm the chat FAB is visible on `/dashboard` and `/meal-plan`. Click the FAB — confirm the chat panel opens. Type "what can I substitute for chicken" — confirm a response streams in word by word (even in mock mode). Click a suggested prompt — confirm it auto-sends. Navigate to another page — confirm chat history persists (sessionStorage). Close and reopen — confirm history is retained. Unauthenticated requests to `/api/chat` should return 401.

---

### Phase 5 — Production Hardening (T-033 to T-040)

> **Goal:** Ship with confidence. Comprehensive mobile responsiveness, accessibility compliance, performance optimisation, E2E test coverage, production deployment, monitoring, and a future-ready subscription paywall stub.

#### T-033 · Responsive Design Audit & Mobile Polish `L` `P1`

Audit all pages at 375px, 768px, 1280px, 1440px breakpoints. Fix:

- Meal plan grid collapses to 1-day-at-a-time swipeable carousel on mobile.
- Navigation becomes a bottom tab bar on mobile.
- Recipe detail page (`/recipes/[id]`) has a mobile-optimised single-column layout; hero image is full-width, ingredients and nutrition stack vertically below.
- All touch targets >= 44px.
- All text is legible (min 14px on mobile).

Test on iOS Safari and Android Chrome.

> **Browser Test:** Open Chrome DevTools → Device Mode → iPhone 14 Pro (390px). Navigate to `/meal-plan` — confirm the grid is a single-day swipeable carousel. Swipe left/right — confirm day changes. Open a recipe — confirm it opens as a full-screen bottom sheet. Check the nav — confirm it is a bottom tab bar. Tab through `/preferences` — confirm no horizontal scroll. Check all touch targets with the CSS outline trick: `* { outline: 1px solid red; }` — confirm all interactive elements are at least 44px tall.

#### T-034 · Error Handling & Empty States `M` `P1`

The stub `apps/web/src/app/error.tsx` and `not-found.tsx` already exist — flesh them out. Add `loading.tsx` skeletons for every page route that fetches data (meal-plan, dashboard, preferences, tracker, history, recipes, progress, shopping-list). Define empty states for: no meal plan, no favourites, no history, tracker with no logs — each with a placeholder illustration (SVG inline or from `packages/ui`) and a clear CTA.

> **Browser Test:** Navigate to `/this-page-does-not-exist` — confirm the `not-found.tsx` renders a clean 404 page with a nav link home. Throttle the network to Slow 3G in DevTools and navigate to `/meal-plan` — confirm the skeleton loader appears before content. Temporarily break the tRPC URL in env and reload — confirm the error boundary renders with a retry button. Restore the URL and confirm retry works.

#### T-035 · Accessibility (a11y) Baseline `M` `P1`

Run axe-core audit on all pages. Fix:

- All interactive elements have `aria-label` or visible label.
- Focus ring visible on keyboard navigation.
- Colour contrast >= 4.5:1 for normal text.
- Recipe detail page uses browser-native back navigation; "← Back to Meal Planner" link is keyboard-accessible and visible on focus.
- Skeleton loaders have `aria-busy="true"`.
- Meal plan grid cells have `role="gridcell"` and descriptive `aria-label` (e.g. "Monday Breakfast: Avocado Toast, 420 kcal").

Target 0 critical violations.

> **Browser Test:** Install the axe DevTools browser extension (free tier). Run it on `/meal-plan`, `/dashboard`, `/recipes/[id]`, `/onboarding`, and `/preferences` — confirm zero critical violations. Manually keyboard-navigate the meal plan grid and Tab to a meal card link — confirm Enter navigates to the recipe detail page. On `/recipes/[id]`, Tab through all controls (servings adjuster, Swap, Save, instruction list). Confirm focus rings are always visible.

#### T-036 · Performance – Core Web Vitals `L` `P1`

Run Lighthouse on `/meal-plan`. Optimise:

- Convert recipe placeholder images to `next/image` with proper `sizes` prop.
- Lazy-load the meal plan grid rows below the fold.
- Move AI generation to a background queue (BullMQ or Vercel Queue) to avoid the tRPC request timing out on slow LLM calls in production; the `mealPlan.generate` mutation returns a `jobId` immediately and polling `mealPlan.getGenerationStatus` is used by the loading overlay in T-018.
- The tRPC client in `apps/web/src/lib/trpc.ts` should use TanStack Query's built-in caching — verify cache-control headers on `getActive` and `preferences.get` are configured for stale-while-revalidate.

Target Lighthouse Performance > 85 desktop, LCP < 2.5s, CLS < 0.1.

> **Browser Test:** Run Lighthouse in Chrome DevTools → Lighthouse tab → Desktop → Performance. Confirm the score is above 85. Review the "Opportunities" section and fix any items blocking the target. Run a second audit to confirm improvement. Check the Network tab for unnecessary waterfall fetches — confirm preferences and plan data load in parallel, not sequentially.

#### T-037 · End-to-End Tests with Playwright `L` `P2`

The Playwright config already exists at `tests/playwright.config.ts`. Add test files under `tests/e2e/`:

1. `onboarding.spec.ts` — Register new user → complete 4-step onboarding → assert redirect to `/dashboard`.
2. `meal-plan.spec.ts` — Generate meal plan (mock) → confirm 7×4 grid → click a meal card → assert navigation to `/recipes/[id]` → assert recipe name, ingredients, and instructions are present on the page.
3. `swap.spec.ts` — Swap a recipe → assert grid cell updates.
4. `shopping-list.spec.ts` — Navigate to `/shopping-list` → assert grouped items → check off an item → reload → assert checked state persists.
5. `preferences.spec.ts` — Update goal in preferences → save → reload → assert updated value.

All E2E tests must run with `AI_MOCK_ENABLED=true`. Add a `test:e2e` script to `package.json`. Set up GitHub Actions workflow `.github/workflows/e2e.yml` to run on push to `main`. Add Playwright HTML report as a workflow artifact.

> **Browser Test:** Run `pnpm test:e2e` locally. Confirm all 5 test files pass. Open `playwright-report/index.html` — confirm all steps are green with screenshots at key assertions.

#### T-038 · Environment Config & Deployment (Vercel) `M` `P1`

Add all required env vars to Vercel project settings: `DATABASE_URL`, `SESSION_SECRET` (replaces `NEXTAUTH_SECRET` — rename if needed for JWT signing in T-031), `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`), `AI_PROVIDER`, `RESEND_API_KEY`. **Explicitly set `AI_MOCK_ENABLED=false` in the Vercel production environment** — this is the critical flag that enables real AI calls. Leave preview deployments on `AI_MOCK_ENABLED=true`. Configure Vercel Postgres or a managed Neon PostgreSQL as `DATABASE_URL`. Update the Vercel build command to `prisma generate && <existing build command>`. Set up preview deployments for PRs. The health check at `GET /api/health` (T-001) should check DB connectivity.

> **Browser Test:** Visit the Vercel preview URL for your PR. Navigate to `/api/health` — confirm `{"ok":true}`. Log in with a seed account — confirm the full app loads. Confirm `AI_MOCK_ENABLED` is `true` in preview (check via a debug endpoint or Vercel dashboard). Visit the production URL — confirm `AI_MOCK_ENABLED=false` by attempting to generate a plan (it should call the real LLM or fail with a key error if the key isn't set).

#### T-039 · Analytics & Usage Monitoring `M` `P2`

Integrate Vercel Analytics (or PostHog free tier). Track custom events from the web client: `plan_generated`, `recipe_swapped`, `shopping_list_opened`, `recipe_favourited`, `chat_message_sent`. Add Sentry for error monitoring — `SENTRY_DSN` env var; init in both `apps/api` and `apps/web`.

Add `admin.stats` — `adminProcedure` query (the `adminProcedure` middleware already exists in `apps/api/src/lib/trpc.ts`): returns total users, plans generated today/week/all-time, avg recipes per plan. Accessible only to `ADMIN` role users.

> **Browser Test:** Generate a plan — open the PostHog or Vercel Analytics dashboard and confirm `plan_generated` event appears within a few seconds. Log in as `admin@chefer.dev` (seed account with ADMIN role) and call `trpc.admin.stats` from the browser console — confirm it returns stats. Log in as a regular user and call the same — confirm `FORBIDDEN` error. Trigger a deliberate JS error and confirm it appears in the Sentry dashboard.

#### T-040 · Subscription & Paywall (Future-Ready Stub) `XL` `P2`

Add `subscriptionPlan` enum `FREE | PRO` and `subscriptionPlan` field (default `FREE`) to the `User` model. Run `pnpm db:migrate`.

Create `apps/api/src/lib/subscription/subscription.guard.ts` — a helper used inside tRPC procedures to check `ctx.user.subscriptionPlan`. Add plan checks to:

- `mealPlan.generate` — throw `FORBIDDEN` with upgrade prompt if FREE user has already generated 1 plan this week.
- `mealPlan.list` — truncate history to 4 weeks for FREE users.
- `/api/chat` route — return 403 with upgrade prompt for FREE users.

Build `apps/web/src/features/subscription/components/UpgradeModal.tsx` — shows feature comparison table and a "Upgrade to PRO" CTA.

Wire Stripe Checkout: `subscription.createCheckoutSession` — `protectedProcedure` mutation returns a Stripe Checkout URL. Build `apps/web/src/app/api/stripe-webhook/route.ts` (second and final Next.js Route Handler) — handles `checkout.session.completed` to update `User.subscriptionPlan` to `PRO`.

> **Browser Test:** Log in as `alice@chefer.dev` (FREE user). Generate 1 plan — confirm success. Try to generate a second plan in the same week — confirm the upgrade modal appears with the feature comparison. Navigate to `/history` with 5+ weeks of data — confirm week 5+ is hidden with an upgrade prompt. Click "Upgrade to PRO" — confirm Stripe Checkout opens in test mode. Use Stripe test card `4242 4242 4242 4242` to complete checkout — confirm the user is upgraded to PRO and all restrictions are lifted.

---

## 5. AI Agent Execution Guidelines

Each task in this PRD is designed to be handed to an AI coding agent (e.g. Claude Code, Cursor Agent, Copilot Workspace) as a self-contained unit of work. Follow these conventions:

### 5.1 Task Execution Order

Tasks must be executed in ID order within each phase. Do not skip tasks. A task may depend on schema changes from the previous task being migrated.

### 5.2 Definition of Done per Task

- All Prisma migrations applied successfully (`pnpm db:migrate`).
- TypeScript compiles with zero errors (`pnpm typecheck`).
- ESLint passes with zero errors (`pnpm lint`).
- The feature is reachable via the browser and passes all steps listed in the task's **Browser Test** block.
- All tRPC procedures return correct responses for success and error cases.
- Unit tests pass where specified (`pnpm test`).
- **`currentImplementation.md` is created or updated** (see §5.7) — this is a hard requirement, not optional.

### 5.3 Coding Conventions

- Use TypeScript strict mode throughout (`no any`, `no @ts-ignore` without explanation).
- All tRPC procedure inputs must be validated with Zod schemas before touching the DB.
- Never expose Prisma or the tRPC API client directly to the browser — use tRPC from `apps/web/src/lib/trpc.ts` only.
- Tailwind CSS only — no inline styles, no CSS modules.
- Prefer React Server Components; add `"use client"` only when interactivity requires it.
- Keep components under 200 lines; extract sub-components and hooks freely.
- Layer order is mandatory: Router → Service → Repository → Prisma. No skipping.
- All LLM prompts must be in `apps/api/src/lib/ai/prompts.ts` as named exported constants.
- **Never call an AI provider directly from a route or component.** Always go through the `aiService` factory from `apps/api/src/lib/ai/index.ts`.
- **Fixture files are production-quality data.** Mock recipes must have complete `ingredients`, `instructions`, and `nutritionInfo` fields — no placeholder strings.
- `AI_MOCK_ENABLED` defaults to `true` in `.env.local`. Must be `false` in production. The app must warn (log) on startup if `OPENAI_API_KEY` is set but `AI_MOCK_ENABLED` is also `true`.
- **tRPC is the only API mechanism**, except for two Route Handlers: `/api/chat` (streaming) and `/api/stripe-webhook` (Stripe signature verification). Document any deviation from this rule in a code comment.

### 5.4 Environment Variables Required

| Variable                | Dev default             | Purpose                                                                                                                 |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | (required)              | PostgreSQL connection string (Neon or local)                                                                            |
| `NEXTAUTH_SECRET`       | (required)              | Random 32-byte hex string                                                                                               |
| `NEXTAUTH_URL`          | `http://localhost:3000` | App base URL                                                                                                            |
| `AI_MOCK_ENABLED`       | `true`                  | **Set to `true` locally to skip real AI calls and use fixture data. Set to `false` in production only.**                |
| `AI_MOCK_DELAY_MS`      | `0`                     | Optional artificial delay (ms) on mock responses — useful for testing loading states locally without hitting a real API |
| `OPENAI_API_KEY`        | (omit locally)          | OpenAI API key — only required when `AI_MOCK_ENABLED=false`                                                             |
| `ANTHROPIC_API_KEY`     | (omit locally)          | Anthropic API key — alternative to OpenAI; only required when `AI_MOCK_ENABLED=false`                                   |
| `AI_PROVIDER`           | `openai`                | Which live provider to use (`openai` or `anthropic`) — ignored when `AI_MOCK_ENABLED=true`                              |
| `RESEND_API_KEY`        | (omit locally)          | Resend API key for transactional email (Phase 4)                                                                        |
| `STRIPE_SECRET_KEY`     | (omit locally)          | Stripe secret key (Phase 5)                                                                                             |
| `STRIPE_WEBHOOK_SECRET` | (omit locally)          | Stripe webhook signing secret (Phase 5)                                                                                 |

> **Local setup note:** The project setup script (`./infrastructure/scripts/setup.sh`) should auto-generate `.env.local` with `AI_MOCK_ENABLED=true`. Developers should never need to supply an API key to run the app locally.

### 5.5 Effort Legend

| Code   | Range      | Description                                                 |
| ------ | ---------- | ----------------------------------------------------------- |
| **S**  | 1–2 hours  | Schema change, single API route, simple UI component        |
| **M**  | 3–4 hours  | Multi-step form, new page with data fetching, API + UI pair |
| **L**  | 5–8 hours  | Complex feature spanning API + DB + UI + basic tests        |
| **XL** | 8–12 hours | Cross-cutting feature (AI integration, real-time, Stripe)   |

### 5.6 Priority Legend

| Code   | Name         | Description                                                  |
| ------ | ------------ | ------------------------------------------------------------ |
| **P0** | Must Have    | MVP is broken without this. Block everything else.           |
| **P1** | Should Have  | Core to the experience; ship before any P2.                  |
| **P2** | Nice to Have | Improves retention / monetisation. Can be deferred post-MVP. |

---

## 6. Key User Stories

### US-01 — First-Time User Onboarding

> _As a new visitor, I want to register, set my dietary goals and restrictions in a guided wizard, so that my first meal plan feels genuinely personalised to me._

**Acceptance Criteria:**

- Registration completes in < 60 seconds.
- Onboarding wizard has 4 clear steps with a progress indicator.
- I can navigate back and change answers before finishing.
- After finishing I am redirected to the dashboard with a prompt to generate my first plan.

---

### US-02 — Generate My Week

> _As an authenticated user with preferences set, I want to click one button and receive a complete 7-day meal plan, so that I never have to think about what to cook this week._

**Acceptance Criteria:**

- Plan is generated in < 30 seconds (or a loading state keeps me informed).
- Every day has breakfast, lunch, dinner, and an optional snack.
- Total daily calories are within ±10% of my calculated target.
- No recipe appears more than once in the week.
- I can view the full recipe (ingredients + instructions) by clicking any meal.

---

### US-03 — Swap a Meal

> _As a user viewing my meal plan, I want to replace a specific meal with an AI-generated alternative that still matches my preferences, so that I have variety without starting over._

**Acceptance Criteria:**

- I can initiate a swap from any meal card with one click.
- I can optionally provide a reason (e.g. "I'm not in the mood for fish").
- The replacement appears in the grid within 10 seconds.
- The weekly nutrition summary updates to reflect the swap.

---

### US-04 — Shopping List

> _As a user with an active meal plan, I want to get a consolidated, categorised shopping list for the entire week, so that I can do a single grocery run._

**Acceptance Criteria:**

- Duplicate ingredients are merged with summed quantities.
- Items are grouped by: Produce, Proteins, Dairy, Grains & Pantry, Frozen.
- I can check off items as I shop (persisted locally).
- I can download the list as a PDF or share a link.

---

## 7. Out of Scope (v1 MVP)

- Native mobile app (iOS / Android) — web-first only; PWA support considered Phase 5+.
- Social features (sharing plans publicly, following other users).
- Restaurant / delivery integration (ordering ingredients online).
- Barcode scanning for ingredient logging.
- Third-party OAuth login (Google, Apple) — can be added to the custom auth system later.
- Dietitian / nutritionist review marketplace.
- Meal prep video guides or multimedia recipe content.
- Multi-language / i18n — English only for MVP.

---

### 5.7 `currentImplementation.md` — Format & Update Rules

After completing **every task**, create or update `currentImplementation.md` at the repo root. This file is the source of truth for what has been built and how to test it. It is written for a developer who has just cloned the repo and wants to verify the current state.

#### Required Format

````markdown
# Chefer — Current Implementation

**Last updated:** [task ID] · [task name]
**Phase:** [0–5]

---

## What's Been Built

| Task  | Name                | Status  | Notes                          |
| ----- | ------------------- | ------- | ------------------------------ |
| T-001 | Health Check        | ✅ Done | `GET /api/health` on port 3001 |
| T-002 | Chef Profile Schema | ✅ Done | `chef_profiles` table created  |
| ...   | ...                 | ...     | ...                            |

---

## How to Run

```bash
pnpm install
cp .env.example .env.local  # fill in DATABASE_URL
pnpm db:migrate
pnpm db:seed
pnpm dev
```
````

## How to Test the Latest Feature

### [Task ID] — [Task Name]

**Pre-condition:** [what must be true before testing, e.g. "logged in as alice@chefer.dev"]

**Steps:**

1. [Specific browser step]
2. [Specific browser step]
3. ...

**Expected result:** [What the user should see]

**Seed accounts:**
| Email | Password | Role |
|---|---|---|
| admin@chefer.dev | Admin@123! | ADMIN |
| alice@chefer.dev | User@123! | USER |
| bob@chefer.dev | User@123! | MODERATOR |

---

## Known Limitations (current phase)

- [Anything intentionally not implemented yet that a tester might expect]

```

#### Update Rules

- The "What's Been Built" table is append-only — do not remove rows.
- "How to Test the Latest Feature" describes only the most recently completed task. Replace it entirely each time.
- "Known Limitations" lists things that are intentionally incomplete in the current phase (e.g. "Chat is not yet implemented", "Email sending is skipped locally"). Remove items as they are completed.
- Never write future tense in this file — only describe what exists right now.

---

## 6. Key User Stories
```
