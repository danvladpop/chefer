# Chefer — Product & Technical Roadmap

> **Author:** Product review, 2026-08-21 (rev. 2 — incorporates [`mobile_followups.md`](./mobile_followups.md))
> **Scope:** Full-application audit of `master` @ `9678baa`, plus a prioritised, executable plan.
> **Companion:** [`mobile_followups.md`](./mobile_followups.md) owns the mobile/responsive
> workstream detail; this document absorbs its items as tickets (P0-0, P0-10, P1-6, P1-7, and the
> P2 polish backlog) so there is one prioritised queue.
> **Status of this document:** living. Update the "Progress" checkboxes as tickets land.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Exists Today](#2-what-exists-today)
3. [Findings — Bugs & Risks](#3-findings--bugs--risks)
4. [Product Analysis](#4-product-analysis)
5. [Technical Analysis](#5-technical-analysis)
6. [The Plan](#6-the-plan)
   - [P0 — Stop the Bleeding](#p0--stop-the-bleeding-week-1)
   - [P1 — Make the Core Loop Actually Work](#p1--make-the-core-loop-actually-work-weeks-2-3)
   - [P2 — Make It a Business](#p2--make-it-a-business-weeks-4-6)
   - [P3 — Differentiation](#p3--differentiation-weeks-7-10)
7. [Metrics & Instrumentation](#7-metrics--instrumentation)
8. [Explicitly Out of Scope](#8-explicitly-out-of-scope)
9. [Ticket Index](#9-ticket-index)

---

## 1. Executive Summary

Chefer is **substantially further along than a prototype** — ~26k lines of TypeScript across a
clean monorepo, 55 tRPC procedures, 19 pages, a real AI integration (Gemini), background image
generation with SSE streaming, live price scraping, and a mobile-responsive shell shipped last
week. The architecture is genuinely good: layered API, interface-driven repositories, end-to-end
type safety, Zod-validated env.

The problem is not "what's missing", it's **"what's half-connected."** The app has accumulated a
set of features that are _built but not wired to anything_:

| Built                                   | But…                                                              |
| --------------------------------------- | ----------------------------------------------------------------- |
| "Use in next plan" toggle on favourites | Generation never reads the flag                                   |
| 1–5 star meal ratings                   | Nothing consumes ratings — no feedback loop                       |
| AI chef chat widget                     | Hardcoded mock responses; no access to the user's plan            |
| Premium tier + gating                   | `user.upgradePlan` is a free self-serve click — zero revenue      |
| Calorie target recomputation            | Only meal-plan uses it; dashboard & tracker show a stale snapshot |
| Shopping list check-off                 | `localStorage` only — resets on every new device                  |

Alongside that, there are **three defects that hit real users today** and **two operational risks**
that should be fixed before anything else ships. And the mobile audit
([`mobile_followups.md`](./mobile_followups.md)) surfaced something worse than either: **three of
the four quality gates `CLAUDE.md` tells contributors to run are broken** — `pnpm lint` fails
(no ESLint config in `apps/web`, so the entire frontend has never been linted), `pnpm test` fails
(`@chefer/utils` has a test script and zero tests), and `pnpm typecheck` has 23 pre-existing
errors that the web build papers over with `ignoreBuildErrors: true`. Wiring up CI (F-3) is
pointless until these pass — CI that lands red on day one gets ignored, which is worse than no CI.

**The recommendation:** spend one week on P0 (repair the gates, then correctness + safety), two
weeks on P1 (close the feedback loop that makes a meal planner _feel_ personal), then P2
(payments, retention). Do not start new feature surfaces until P1 is done — the app already has
more surface than it has depth.

---

## 2. What Exists Today

### 2.1 Shipped and working

**Auth & accounts**

- Self-serve register + login, bcrypt (cost 12), DB-backed sessions (30-day cookie).
- `middleware.ts` route guard + client-side 401 → `/login` redirect (`apps/web/src/lib/trpc.ts:38`).
- Roles: `USER` / `MODERATOR` / `ADMIN`; tiers: `FREE` / `PREMIUM`.
- Procedure guards: `publicProcedure` (5), `protectedProcedure` (44), `premiumProcedure` (3),
  `adminProcedure` (3).

**Meal planning (the core)**

- 7-day plan generation, two paths (`apps/api/src/application/meal-plan/meal-plan.service.ts`):
  - **FREE** → curated pool, shuffled, instant, stock images, no AI cost.
  - **PREMIUM** → Gemini-generated 21 recipes from body metrics + goal + diet prefs, with a
    _live-recomputed_ calorie target (Mifflin-St Jeor + goal adjustment).
- Per-slot meal swap (AI for premium, curated for free).
- Week navigation with URL-persisted offset; plan history + restore.
- Background image worker: 5 parallel Pollinations generations, priority-ordered (today first),
  name-based image reuse, SSE streaming to the client, 429 back-off.

**Shopping & ingredients**

- Deterministic ingredient merge → categorised list, with AI consolidation for premium
  (persisted to the `ShoppingList` table so it survives reloads).
- `IngredientPrice` vocabulary: per-100g/ml/piece prices **and** macros, refreshed on a 12h worker.
- Live Carrefour price scraping with a sanity band.
- Ingredient catalog UI with global/custom scoping and correct permission rules.
- Unit-system preference (metric/imperial) applied consistently to displayed quantities.

**Recipes**

- Full CRUD for user recipes, ingredient picker backed by the catalog, auto-computed nutrition
  from ingredient quantities, device upload **or** deterministic AI image.
- Favourites, star ratings, search + tab filters.

**Tracking**

- Daily meal log with macro totals, weekly/monthly summaries, weight entries, Recharts progress page.

**Infrastructure**

- pnpm + Turborepo, ESLint 9 flat config, Prettier, husky + commitlint.
- Docker Compose deploy to a single VM behind Caddy, one-button GitHub Actions deploy.
- Playwright e2e suite covering mobile nav, overflow (10 routes × 4 widths), touch targets, and
  desktop regression — **61 passing** on the responsive projects. (`home.spec.ts` is separately
  red: 13 of 19 assertions are stale landing-page copy; see P0-0.)
- Excellent documentation discipline (`infrastructure.md`, `business_flow.md`, `docs/plan-*.md`,
  and now `mobile_followups.md` — a measured, honest audit of its own workstream).

### 2.2 Built but inert

| Surface                                          | Evidence                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `FavouriteRecipe.useInNextPlan`                  | Written by `recipe.router.ts:153`, read by nothing                        |
| `MealRating`                                     | Written by `recipe.router.ts:159`, read by nothing                        |
| AI chat                                          | `apps/web/src/app/api/chat/route.ts:6` — mock-by-default, regex responses |
| `mealPlan.getShoppingList`                       | `meal-plan.router.ts:108` — superseded by `shoppingList.*`, still exposed |
| `Post` / `Tag` / `PostTag` models                | `schema.prisma:336-382` — no router, no UI                                |
| `UserProfile` model (bio/website/twitter/github) | `schema.prisma:124` — never read or written                               |
| `/user` page                                     | `apps/web/src/app/user/page.tsx` — dev scaffold, still routable           |
| `JWT_SECRET`, `REFRESH_TOKEN_SECRET`             | Required by env schema, never used                                        |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`         | Configured, no rate limiter installed                                     |

---

## 3. Findings — Bugs & Risks

Ordered by user impact. Each is an actionable ticket in [§6](#6-the-plan).

### 🔴 F-1 — Dashboard shows no "next meal" every evening

`apps/api/src/application/dashboard/dashboard.service.ts:154-190`

`getNextMealIndex()` returns an index into `MEAL_ORDER = [breakfast, lunch, snack, dinner]`, but
the loop compares it against the index of `orderedMeals`, which is **filtered to the meals that
actually exist in the plan**.

Default `mealsPerDay` is `3` (`schema.prisma:168`) and the AI prompt only adds a snack when
`mealsPerDay >= 4` (`apps/api/src/lib/ai/prompts.ts:45`). Free curated plans are _always_
breakfast/lunch/dinner. So for the overwhelming majority of users `orderedMeals.length === 3`:

- `17:00–21:00` → `nextMealIndex = 3`, no element matches → **`nextMeal` is `null` and
  `restOfToday` is empty.** The dashboard's hero card is blank exactly at dinner time.
- `14:00–17:00` → `nextMealIndex = 2` → resolves to **dinner**, labelled as the next meal at 3pm.

This is the single most-visited screen in the product, broken during peak usage hours.

### 🔴 F-2 — `/user` leaks a real user's PII to anonymous visitors

`apps/web/src/app/user/page.tsx:5` calls `prisma.user.findFirst()` and renders the first user's
first name, last name, email, and ID. The route is **not** in `middleware.ts`'s `PROTECTED_ROUTES`,
and `user.getById` is a `publicProcedure` (`apps/api/src/routers/user.router.ts:53`).

Anyone can hit `https://<host>/user` and read an account holder's email address. It is a dev
scaffold that shipped.

### 🔴 F-3 — CI has never run, and would fail if it did

`.github/workflows/ci.yml` triggers on `[main, develop]`. The default branch is **`master`**.
`.github/workflows/deploy.yml` triggers on `master`.

Net effect: **every push to `master` deploys straight to production with no lint, no typecheck,
no unit tests, and no e2e gate.** The e2e job is additionally gated on `pull_request` to
`main`/`develop`, so it has never executed either.

Worse — per F-10, three of the four gates **currently fail**, so merely fixing the branch names
would produce a permanently red CI. F-10 must land first.

### 🔴 F-10 — The quality gates themselves are broken

Measured in [`mobile_followups.md`](./mobile_followups.md) §1 and re-verified during this review:

| Command             | Actual result                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`         | **Fails.** `apps/web` has no `eslint.config.js` and no `.eslintrc.*`. The entire frontend has never been linted.                                                                                                              |
| `pnpm test`         | **Fails.** `@chefer/utils` declares a `test` script with zero test files; `vitest run` exits 1 on "No test files found".                                                                                                      |
| `pnpm typecheck`    | **23 pre-existing errors** in `apps/api` and `packages/database` (`exactOptionalPropertyTypes`). `apps/web/next.config.ts:10` sets `typescript.ignoreBuildErrors: true` — the production build knowingly skips type checking. |
| `pnpm format:check` | Works.                                                                                                                                                                                                                        |

Separately, `tests/e2e/home.spec.ts` fails 13 of 19 assertions against landing-page copy that was
replaced long ago, plus a strict-mode locator violation.

### 🟠 F-4 — Anyone can grant themselves PREMIUM

`apps/api/src/routers/user.router.ts:131` — `upgradePlan` is a `protectedProcedure` with no
payment step. This is a deliberate demo shortcut (documented in `business_flow.md` §9), but it
means the premium gating that took real effort to build produces zero revenue and can be bypassed
with one `curl`.

### 🟠 F-5 — Calorie target is inconsistent across the app

`meal-plan.service.ts:218-228` recomputes the target **live** from body metrics + goal, explicitly
because the stored `dailyCalorieTarget` is "a display snapshot [that] can predate goal-adjustment
logic or metric changes."

But the dashboard (`dashboard.service.ts:92`) and the tracker (`tracker.service.ts:62,143,176`)
both read the stale stored value. A user who changes their goal from _maintain_ to _lose weight_
gets a plan built to 1,800 kcal while the dashboard ring and progress chart target 2,200.

### 🟠 F-6 — No rate limiting on authentication

`apps/api/src/index.ts` installs CORS, JSON parsing, and a request-ID middleware — nothing else.
`auth.login` is a `publicProcedure` doing a bcrypt compare. There is no throttle, no lockout, no
CAPTCHA, and no `helmet`. `RATE_LIMIT_*` env vars exist but are unused.

### 🟡 F-7 — Dead link in the login form

`apps/web/src/features/auth/components/login-form.tsx:104` links to `/forgot-password`. That
route does not exist → 404. There is no password reset flow at all, and `emailVerified` is never
set.

### 🟡 F-8 — `/ingredients` is missing from the route guard

`apps/web/src/middleware.ts:3-14` — `/ingredients` is in `NAV_ITEMS` but not in
`PROTECTED_ROUTES` or the matcher. Data is safe (procedures are protected), but a logged-out
visitor gets a broken shell that flashes and then redirects via the client 401 handler, instead of
a clean server-side redirect.

### 🟡 F-9 — Single unit test in the entire backend

`apps/api/src/application/preferences/preferences.service.test.ts` (167 lines) is the only unit
test. `MealPlanService` (886 lines), `ShoppingListService` (457), `IngredientsService` (385), and
`DashboardService` (261) are untested — including the calorie maths and the plan-assembly logic
that F-1 and F-5 live in.

---

## 4. Product Analysis

### 4.1 The value proposition, honestly stated

> _"Tell us your body and your goals; get a week of food that fits, and a shopping list that
> matches, without thinking about it."_

That promise is **~70% delivered**. Plan generation is good. Shopping lists with real prices are a
genuine differentiator most competitors don't have. What's missing is everything that happens
_after_ the plan is generated.

### 4.2 The funnel, and where it leaks

```
Land → Register → Onboard → Generate plan → Cook → Log → Come back next week
  │        │          │           │            │      │            │
  │        │          │           │            │      │            └─ ✗ nothing brings them back
  │        │          │           │            │      └─ ✗ logging is manual, tedious, unrewarded
  │        │          │           │            └─ ✗ no cook mode, no "I made this"
  │        │          │           └─ ✓ works well (premium) / generic (free)
  │        │          └─ ⚠ premium-gated: free users can't personalise *at all*
  │        └─ ✓ works
  └─ ⚠ marketing page exists but no proof, no social, no SEO surface
```

**The three biggest product problems:**

**(a) Free tier gives a demo, not a taste.** Free users get a random curated week that ignores
their allergies entirely (`meal-plan.service.ts:190-192`: _"dietary preferences intentionally
ignored"_). That is not a weak version of the product — it's a different, worse product. A vegan
or someone with a nut allergy sees a plan they literally cannot eat, and concludes the app doesn't
work. **Allergies and dietary restrictions should be free.** Gate _personalisation depth_
(calorie-matched macros, AI swaps, unlimited regeneration), not _safety_.

**(b) There is no feedback loop.** The app collects ratings and "use in next plan" flags and then
throws them away. Week 2's plan is statistically identical to week 1's. A meal planner that
doesn't learn is a random recipe generator with extra steps — and retention will show it.

**(c) The plan ends at the plan.** No cook mode, no step timers, no "mark as cooked," no leftovers
handling, no portion scaling at the point of use. The user leaves the app to actually cook, and
the tracker's manual re-entry of what they just ate is friction with no reward attached.

### 4.3 Competitive position

|                          | Chefer               | Mealime      | Eat This Much   | PlateJoy   |
| ------------------------ | -------------------- | ------------ | --------------- | ---------- |
| AI-generated recipes     | ✅                   | ❌ curated   | ⚠ combinatorial | ❌ curated |
| Macro-targeted plans     | ✅                   | ❌           | ✅              | ✅         |
| **Priced shopping list** | ✅ **live scraping** | ❌           | ❌              | ❌         |
| Store integration        | ⚠ links only         | ✅ Instacart | ✅ Instacart    | ✅         |
| Cook mode                | ❌                   | ✅           | ⚠               | ✅         |
| Learns from feedback     | ❌                   | ⚠            | ✅              | ✅         |

**Priced shopping lists are the wedge.** No mainstream competitor tells you what the week costs
before you shop. That is a headline feature and it's already built — it's just buried on a
secondary page and denominated in EUR against Romanian price assumptions
(`apps/api/src/lib/ai/prompts.ts:134`). Lead with it: _"Your week: €63. Here's the plan."_

---

## 5. Technical Analysis

### 5.1 What's good — keep doing this

- **Layer discipline is real**, not aspirational. Routers are genuinely thin; services hold logic;
  repositories are interface-typed. The `CLAUDE.md` rules are being followed.
- **Comments explain _why_.** `schema.prisma:6-10` on binary targets, `meal-plan.service.ts:213-217`
  on live calorie recomputation, `trpc.ts:33-40` on the 401 redirect. This is unusually good.
- **Failure modes are considered**: 429 back-off, fire-and-forget log inserts that can't crash the
  request, graceful shutdown that drains in-flight image jobs, `aiFailureMessage()` distinguishing
  transient overload from real failure.
- **Docs are maintained.** `infrastructure.md` is 963 lines and current.

### 5.2 Debt worth paying down

| Issue                                                         | Location                                                                                      | Cost of leaving it                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Plan→DTO assembly duplicated 3×                               | `meal-plan.service.ts:415`, `:451`, `:724`                                                    | F-1-class bugs get fixed in one copy       |
| `CATEGORY_MAP` duplicated with divergent values               | `meal-plan.service.ts:36-98` (`'Produce'`) vs `shopping-list.service.ts:47-105` (`'produce'`) | Categories disagree between screens        |
| `weeklySummary` / `monthlySummary` byte-identical but for `N` | `tracker.service.ts:138-199`                                                                  | Pure copy-paste                            |
| `getForWeek` loads 52 plans to find one                       | `meal-plan.service.ts:453`                                                                    | O(n) growth per user, per page load        |
| `restore` loads 100 plans to check ownership                  | `meal-plan.service.ts:712`                                                                    | Same                                       |
| No structured logging, no APM, no error tracking              | —                                                                                             | Production failures are invisible          |
| Ingredient category inference is substring matching           | both `inferCategory()`                                                                        | `"pepperoni"` → Produce (matches `pepper`) |
| `business_flow.md` §2–7 describe auth as unimplemented        | `business_flow.md:37,59,85`                                                                   | Docs actively mislead; §9 is accurate      |

### 5.3 Architectural decisions to revisit

- **`prisma` imported directly in `apps/web`** (`app/user/page.tsx`, `app/api/chat/route.ts`) —
  `CLAUDE.md` Architecture Rule 1 forbids this. Both usages disappear if F-2 and P1-4 land.
- **Session validation hits the DB on every request** (`auth.middleware.ts:45`). Fine now; add a
  short-TTL cache (or move to signed tokens) before ~50 rps.
- **Two AI abstractions** — `lib/ai/` (Gemini/OpenAI/mock) and `lib/grocery-ai/`
  (Claude/mock). Worth converging on one provider-agnostic client.

---

## 6. The Plan

Four phases. **Do not start a phase before the previous one is merged.** Each ticket lists files,
steps, and acceptance criteria so it can be picked up cold.

Estimates assume one engineer. `S` ≤ 2h, `M` ≤ 1 day, `L` ≤ 3 days, `XL` ≤ 1 week.

---

### P0 — Stop the Bleeding (Week 1)

> **Goal:** nothing user-facing is broken, nothing leaks, and CI actually guards `master`.
> **Exit criteria:** all P0 tickets merged; CI green on a PR to `master`; F-1/F-2 verified fixed
> in a running app.

---

#### `P0-1` — Fix the dashboard "next meal" logic · `M` · fixes F-1

**Problem:** index-into-`MEAL_ORDER` compared against index-into-filtered-array
(`dashboard.service.ts:154-190`).

**Files:** `apps/api/src/application/dashboard/dashboard.service.ts`

**Steps:**

1. Replace `getNextMealIndex(hour): number` with `getNextMealType(hour, availableTypes: string[]): string | null`.
   Resolve by **meal type**, not position: walk `MEAL_ORDER` filtered to `availableTypes` and
   return the first type whose window has not yet passed.
2. Define explicit windows so behaviour is inspectable and testable:
   ```ts
   const MEAL_WINDOW_END: Record<string, number> = {
     breakfast: 10,
     lunch: 14,
     snack: 17,
     dinner: 21,
   };
   ```
3. Rewrite the `for` loop (`:162-190`) to compare `slot.type === nextMealType` for `nextMeal`,
   and "appears after `nextMealType` in `MEAL_ORDER`" for `restOfToday`.
4. **Late-evening state:** when every window has passed, return `null` for `nextMeal` but set a new
   `DashboardSummary.tomorrowFirstMeal` from day `todayIndex + 1` (wrapping to 0). Render it as
   _"Tomorrow · Breakfast"_ rather than an empty card.
5. Add `apps/api/src/application/dashboard/dashboard.service.test.ts` covering:
   3-meal plan at 08:00 / 12:00 / 15:00 / 19:00 / 22:00, and 4-meal plan at 15:00.

**Acceptance criteria:**

- 3-meal plan at 19:00 → `nextMeal.mealType === 'dinner'`.
- 3-meal plan at 15:00 → `nextMeal.mealType === 'dinner'`, `restOfToday` empty.
- 3-meal plan at 08:00 → next is breakfast, `restOfToday` is `[lunch, dinner]`.
- 4-meal plan at 15:00 → next is snack, `restOfToday` is `[dinner]`.
- 22:00 → `nextMeal === null`, `tomorrowFirstMeal` populated.
- Dashboard hero card is never blank when an active plan exists.

**Docs:** `business_flow.md` — add a "Dashboard summary" flow section.

---

#### `P0-2` — Delete the `/user` scaffold and close the public read · `S` · fixes F-2

**Files:** `apps/web/src/app/user/page.tsx`, `apps/api/src/routers/user.router.ts`,
`apps/web/src/middleware.ts`

**Steps:**

1. Delete `apps/web/src/app/user/` entirely. It has no inbound links.
2. Change `user.getById` (`user.router.ts:53`) from `publicProcedure` to `protectedProcedure`.
3. Grep for other `getById` callers (`serverClient.user.getById`) — expect zero after step 1.
4. Add `/ingredients` to `PROTECTED_ROUTES` and to `config.matcher` (fixes F-8 in the same pass).
5. Add an e2e assertion in `tests/e2e/` that `GET /user` returns 404.

**Acceptance criteria:**

- `/user` returns 404 for authenticated and anonymous requests alike.
- No `prisma` import remains in `apps/web/src/app/` except `api/chat/route.ts` (removed in P1-4).
- Anonymous `GET /ingredients` server-side redirects to `/login?from=/ingredients`.

**Docs:** `infrastructure.md` §4 (routes) and §8 (procedure map — `user.getById` auth level).

---

#### `P0-3` — Make CI run · `S` · fixes F-3

**Files:** `.github/workflows/ci.yml`

**Steps:**

1. Change both triggers to `branches: [master]`. (Prefer this over renaming the default branch —
   `deploy.yml`, `docs/plan-cicd.md`, and the deploy scripts all assume `master`.)
2. Change the e2e job's `if:` so it runs on PRs to `master`.
3. Add `needs: [lint, typecheck, test]` to the `deploy` job in `deploy.yml`, **or** switch the
   deploy trigger to `workflow_run` on a successful CI run. Production must not deploy on red.
4. Open a throwaway PR and confirm all five jobs execute.
5. Enable branch protection on `master`: require `Lint`, `Type Check`, `Unit Tests`, `Build`.

**Acceptance criteria:**

- A PR to `master` runs lint, typecheck, test, build, e2e.
- A push with a type error does not reach production.

**Docs:** `infrastructure.md` §13.

---

#### `P0-4` — Rate-limit and harden the API · `M` · fixes F-6

**Files:** `apps/api/src/index.ts`, `apps/api/package.json`, new
`apps/api/src/interfaces/http/middleware/rate-limit.middleware.ts`

**Steps:**

1. `pnpm --filter @chefer/api add express-rate-limit helmet`.
2. Add `helmet()` before CORS in `index.ts`. Verify the SSE endpoint
   (`/api/recipe-images`) and static `/uploads` still work — set `crossOriginResourcePolicy: false`
   if images break.
3. Two limiters:
   - **Global:** `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` per IP on `/trpc` (env vars already
     exist at `lib/env.ts:30-32`).
   - **Auth:** 10 requests / 15 min per IP, applied to `auth.login` and `auth.register`. Because
     tRPC batches, key on IP + procedure path rather than raw URL.
4. Add an AI-cost limiter: `mealPlan.generate` and `mealPlan.swapRecipe` capped per **user** per
   day. Read the existing `AiCallLog` table (`schema.prisma:384`) — it already records exactly
   this. Suggested: FREE 3 plans/day, PREMIUM 20 plans/day, 30 swaps/day. Return `TOO_MANY_REQUESTS`
   with a message the UI can show.
5. Set `sameSite: 'strict'` on the session cookie (`auth.service.ts:124`) — the app has no
   cross-site POST flows, so `Lax` is unnecessarily permissive.

**Acceptance criteria:**

- 11 failed logins from one IP inside 15 min → `TOO_MANY_REQUESTS`.
- A FREE user's 4th plan generation in a day is rejected with a clear message.
- SSE image streaming and `/uploads/*` still work with helmet enabled.

**Docs:** `infrastructure.md` §7, §9, §10.

---

#### `P0-5` — Unify the calorie target · `M` · fixes F-5

**Files:** `apps/api/src/application/preferences/preferences.service.ts`,
`dashboard.service.ts`, `tracker.service.ts`, `meal-plan.service.ts`

**Steps:**

1. Export a single `resolveCalorieTarget(userId): Promise<number>` from `preferences.service.ts`.
   It loads the chef profile, returns `computeCalorieTarget(...)` when metrics are complete, else
   the stored `dailyCalorieTarget`, else `2000`.
2. Replace all four call sites: `dashboard.service.ts:92`, `tracker.service.ts:62`, `:143`, `:176`,
   and the inline block at `meal-plan.service.ts:218-228`.
3. Extend it to return macro targets too, so the hardcoded 30/45/25 split
   (`dashboard.service.ts:193-195`, duplicated at `:231-233`) lives in one place.
4. Add a `ChefProfile.macroSplit` JSON column (nullable, defaults to 30/45/25) and surface it on
   the Preferences page — high-protein users currently have no way to express that.
5. Test: changing goal `MAINTAIN` → `LOSE_WEIGHT` changes the dashboard target, the tracker ring,
   and the next generated plan by the same amount.

**Acceptance criteria:**

- Dashboard, tracker, progress chart, and plan generation report the same target for a given user.
- One function computes it; `grep -c "dailyCalorieTarget ?? 2000"` returns 0.

**Docs:** `infrastructure.md` §6 (schema), §7 (service); `business_flow.md` §9.

---

#### `P0-6` — Password reset, or remove the link · `M` · fixes F-7

**Recommendation:** build it. A meal planner people log into weekly _will_ generate reset
requests, and `VerificationToken` already exists in the schema (`schema.prisma:327`).

**Files:** new `apps/api/src/application/auth/password-reset.service.ts`,
`apps/api/src/routers/auth.router.ts`, new `apps/web/src/app/(auth)/forgot-password/page.tsx`,
new `apps/web/src/app/(auth)/reset-password/page.tsx`

**Steps:**

1. `auth.requestPasswordReset({ email })` — `publicProcedure`, rate-limited by P0-4. Creates a
   `VerificationToken` (1h expiry, single-use). **Always returns success**, whether or not the
   email exists, to avoid account enumeration.
2. `auth.resetPassword({ token, password })` — validates, rehashes at cost 12, deletes the token,
   and **invalidates all existing sessions for that user**.
3. Email delivery: add `Resend` (or Postmark) behind an `IEmailService` interface with a mock
   implementation that logs to console when `EMAIL_MOCK_ENABLED=true`, mirroring the existing
   `AI_MOCK_ENABLED` pattern.
4. Build the two pages, matching `login-form.tsx` styling.

**Acceptance criteria:**

- `/forgot-password` resolves. Requesting a reset for an unknown email returns the same response
  as for a known one.
- A used token cannot be reused; an expired token is rejected.
- After reset, previously-issued session cookies are dead.

**Docs:** `business_flow.md` — new §"Password Reset Flow"; `infrastructure.md` §8, §10.

---

#### `P0-7` — Refactor plan assembly, kill the duplication · `M`

**Files:** `apps/api/src/application/meal-plan/meal-plan.service.ts`, `tracker.service.ts`,
new `apps/api/src/application/shared/category-map.ts`

**Steps:**

1. Extract `private async assemblePlanDto(plan): Promise<WeekPlanDto>` and use it from `getActive`
   (`:415`), `getForWeek` (`:451`), and `getById` (`:724`).
2. Collapse `weeklySummary` / `monthlySummary` (`tracker.service.ts:138-199`) into one
   `summary(userId, days)`; keep both procedures as thin wrappers so the client is unaffected.
3. Move `CATEGORY_MAP` + `inferCategory` into `apps/api/src/application/shared/category-map.ts`
   with **one** casing convention. Fix the substring bug: match on word boundaries, and order
   longest-key-first so `"pepperoni"` doesn't resolve to Produce via `"pepper"`.
4. Add repository methods `findByWeekStart(userId, monday)` and `findByIdForUser` (exists) so
   `getForWeek` (`:453`) and `restore` (`:712`) stop loading 52 and 100 plans respectively.
5. Delete `mealPlan.getShoppingList` (`meal-plan.router.ts:108`) and
   `MealPlanService.getShoppingList` (`:756-800`) — superseded by the `shoppingList` router.
   Grep the web app first to confirm zero callers.

**Acceptance criteria:**

- `meal-plan.service.ts` drops below ~600 lines.
- `getForWeek` issues one indexed query, not a 52-row scan.
- Shopping-list categories are identical whichever screen renders them.
- `pnpm typecheck && pnpm test && pnpm lint` clean.

**Docs:** `infrastructure.md` §7, §8.

---

#### `P0-8` — Backend test foundation · `L` · fixes F-9

**Files:** `apps/api/vitest.config.ts`, new `*.test.ts` alongside each service

**Steps:**

1. Add `@vitest/coverage-v8`; set a coverage threshold of **60% on `src/application/`** and wire
   it into the CI `test` job. Ratchet upward, never down.
2. Write unit tests for the pure/near-pure logic first — these need no DB:
   - `computeCalorieTarget` — each activity level × goal × sex.
   - `getNextMealType` (P0-1) — the table in that ticket.
   - `inferCategory` (P0-7) — including `"pepperoni"`, `"bell pepper"`, `"peppercorn"`.
   - `estimateItemPriceEur` — g / ml / piece paths and the unpriced path.
   - Unit conversion in `packages/utils/src/units.ts` — metric ↔ imperial round-trips.
   - `dayImagePriority` — today = 0, week wrap, future weeks sort after.
3. Mock repositories via the existing interfaces (`IMealPlanRepository`, `IUserRepository`) —
   this is exactly what Architecture Rule 3 was built for.
4. Add `MealPlanService.generate` tests for both tiers with a stubbed `IAIService`, asserting:
   free path makes zero AI calls; premium path passes allergies into the AI input.

**Acceptance criteria:**

- `pnpm test` runs ≥ 40 backend assertions.
- Coverage gate enforced in CI; build fails below 60% on `src/application/`.

**Docs:** `infrastructure.md` §13.

---

#### `P0-9` — Correct the stale documentation · `S`

`business_flow.md` §2, §3, §4 state that registration, login, and JWT issuance are _not
implemented_. All three shipped. §5 documents the `/user` page deleted in P0-2. §7 documents a
Post lifecycle that doesn't exist.

**Steps:** rewrite §2–§4 to match `auth.service.ts` and `auth.middleware.ts`; delete §5 and §7;
renumber. Add the flows introduced by P0-1 and P0-6.

---

### P1 — Make the Core Loop Actually Work (Weeks 2–3)

> **Goal:** the app learns from the user, and free users get something safe to eat.
> **Exit criteria:** week-2 plans measurably differ from week-1 plans based on user signals;
> allergy filtering applies on every tier.

---

#### `P1-1` — Close the feedback loop · `L` · **highest product value in this document**

**Problem:** `useInNextPlan` and `MealRating` are written and never read.

**Files:** `meal-plan.service.ts`, `apps/api/src/lib/ai/prompts.ts`,
`packages/database/src/repositories/favourite-recipe.repository.ts`

**Steps:**

1. Add `favouriteRecipeRepository.findPinnedForNextPlan(userId)` returning favourites where
   `useInNextPlan === true`.
2. In `MealPlanService.generate`, **before** calling the AI: load pinned favourites, assign them
   to matching meal slots (respecting meal type), and reduce the AI's ask from 21 recipes to
   `21 - pinnedCount`. Clear the flags after a successful generation so a pin means "next plan",
   not "forever".
3. Add `mealRatingRepository.findSignalsForUser(userId)` returning recent ratings joined to recipe
   names, cuisines, and dietary tags.
4. Feed the signal into the prompt (`prompts.ts`), plainly:
   ```
   Liked recently (4-5★): Thai Green Curry, Shakshuka, Miso Salmon
   Disliked recently (1-2★): Quinoa Buddha Bowl, Lentil Soup
   Favour the cuisines and techniques of the liked dishes. Do not repeat the
   disliked dishes or close variants.
   ```
5. Cap the signal at the 20 most recent ratings so the prompt stays bounded.
6. Surface it in the UI: after generation, show _"Built from 6 dishes you rated and 2 you pinned"_ —
   the learning must be **visible** or users won't believe it's happening.

**Acceptance criteria:**

- Pinning a favourite guarantees it appears in the next generated plan.
- A recipe rated 1★ does not reappear in the next 4 generated plans.
- The AI prompt contains the rating signal (assert in a unit test with a stubbed AI service).
- The generation-complete screen names the signals it used.

**Docs:** `business_flow.md` §9; `infrastructure.md` §7.

---

#### `P1-2` — Make allergies and restrictions free · `M`

**Problem:** free plans ignore dietary preferences entirely (`meal-plan.service.ts:190-192`).
A user with a nut allergy is shown food that could hospitalise them.

**Steps:**

1. Split `preferences.setup` / `preferences.update` (currently `premiumProcedure`,
   `preferences.router.ts:52,57`) into:
   - `preferences.updateSafety` — **`protectedProcedure`** — allergies, dietary restrictions,
     disliked ingredients.
   - `preferences.updateTargets` — stays `premiumProcedure` — body metrics, goal, calorie target,
     meals/day, serving size.
2. In `generateCurated` (`:352`), filter `CURATED_POOL_BY_TYPE` against the user's allergies and
   restrictions using `Recipe.dietaryTags` + ingredient names before shuffling.
3. Handle pool exhaustion: if a meal type has fewer than 3 safe recipes, show _"We don't have
   enough free recipes matching your restrictions — upgrade for AI-generated plans that always
   fit."_ This is a **better** upsell than the current one, because it arrives at a moment of real
   need.
4. Update the onboarding wizard so free users complete the safety step and see the upgrade panel
   only for the metrics/goal steps (`apps/web/src/app/(dashboard)/onboarding/page.tsx:38-47`).
5. Expand the curated pool to ≥ 60 recipes with accurate `dietaryTags` (vegan, vegetarian,
   gluten-free, dairy-free, nut-free) so step 2 has something to filter.

**Acceptance criteria:**

- A free user declaring a peanut allergy never receives a curated recipe containing peanuts.
- Free onboarding completes without an upgrade prompt on the safety step.
- Pool exhaustion produces the contextual upsell, not an error.

**Docs:** `business_flow.md` §9 and "Profile personalisation gating"; `infrastructure.md` §8, §9.

---

#### `P1-3` — Cook mode · `L`

**Problem:** the product stops at the plan. Cook mode is where a meal planner earns daily-active
usage.

**Files:** new `apps/web/src/app/(dashboard)/recipes/[id]/cook/page.tsx`, new
`apps/web/src/features/recipes/components/cook-mode.tsx`

**Steps:**

1. Full-screen, one-instruction-at-a-time stepper. Large type. Swipe or tap to advance.
2. `wakeLock` API so the screen doesn't sleep mid-recipe. Feature-detect; degrade silently.
3. Parse durations out of instruction text (`/(\d+)[-–]?(\d+)?\s*(min|minute|hour|hr)/i`) and offer
   an inline timer for any step that mentions one.
4. Servings scaler at the top; quantities recompute live, respecting the user's unit system
   (reuse `useUnitSystem`).
5. Ingredient checklist pinned to a collapsible drawer so it's reachable from any step.
6. On finish: _"Made it!"_ → writes the meal to today's `DailyLog` **and** opens the star rating.
   This is the single highest-leverage interaction in the app — it closes the tracker loop and
   the personalisation loop in one tap.
7. Entry points: recipe detail page and the dashboard's next-meal hero card.

**Acceptance criteria:**

- Screen stays awake through a 10-step recipe on iOS Safari and Android Chrome.
- Servings scaling updates every quantity, correctly, in both unit systems.
- "Made it!" creates a `DailyLog` entry with the right macros and prompts for a rating.

**Docs:** `infrastructure.md` §4; `business_flow.md` — new §"Cook Mode Flow".

---

#### `P1-4` — Make the AI chef real · `M`

**Problem:** `apps/web/src/app/api/chat/route.ts:6` — regex-matched canned responses, including a
hardcoded claim that the user's plan targets 150g of protein.

**Steps:**

1. Move the chat endpoint from a Next.js route handler to a tRPC procedure (or keep the route but
   proxy through the API) — `CLAUDE.md` Architecture Rule 1 forbids `prisma` in `apps/web`, and
   this file imports it directly at line 4.
2. Build context from real data before each call: active plan, today's meals, calorie target,
   allergies, restrictions, recent ratings.
3. Give it tools rather than just context: `swapMeal`, `addToShoppingList`, `explainNutrition`,
   `scaleRecipe`. A chat that can _do_ things is worth having; one that only talks is not.
4. Keep `MOCK_ENABLED` for local dev, but make the mock echo real context so the mock path
   exercises the same code.
5. Log to `AiCallLog` with a new `CHAT` value on `AiCallType`, and rate-limit per P0-4.
6. Gate live chat to PREMIUM; free users get 5 messages/day.

**Acceptance criteria:**

- Asking _"how much protein am I eating today?"_ returns the number from the user's actual plan.
- _"swap tomorrow's lunch"_ performs the swap and the meal-plan page reflects it.
- No `prisma` import remains anywhere under `apps/web/src`.

**Docs:** `infrastructure.md` §8, §10; `business_flow.md` — new §"AI Chat Flow".

---

#### `P1-5` — Sync shopping-list check-off · `S`

**Problem:** `apps/web/src/app/(dashboard)/shopping-list/page.tsx:62` keeps checked state in
`localStorage`. Check items off on your phone in the shop, and your partner's phone shows nothing.
For a mobile-first grocery flow that's the wrong storage.

**Steps:**

1. Add `checkedKeys String[]` to the `ShoppingList` model (`schema.prisma:434`).
2. `shoppingList.toggleItem({ planId, key, checked })` — `protectedProcedure`, optimistic update
   client-side.
3. Migrate on first load: if `localStorage['shopping-checked']` has keys for the current plan,
   push them up once, then clear the key.
4. Keep the optimistic-UI feel — the shop has bad signal. Queue mutations and reconcile.

**Acceptance criteria:**

- Checking an item on device A shows it checked on device B within one refetch.
- Works offline-optimistically and reconciles on reconnect.

**Docs:** `infrastructure.md` §6, §8.

---

### P2 — Make It a Business (Weeks 4–6)

> **Goal:** revenue, retention, and visibility into what users actually do.
> **Exit criteria:** a real payment can be taken; a production error pages someone; weekly
> retention is measurable.

---

#### `P2-1` — Stripe subscriptions · `L` · fixes F-4

**Files:** new `apps/api/src/application/billing/`, new `apps/api/src/routers/billing.router.ts`,
`apps/web/src/features/premium/`

**Steps:**

1. Stripe Checkout (hosted — do **not** build a card form; PCI scope is not worth it).
2. Schema: `Subscription { userId, stripeCustomerId, stripeSubscriptionId, status,
currentPeriodEnd, cancelAtPeriodEnd }`.
3. Webhook endpoint with **signature verification** and idempotency keys, handling
   `checkout.session.completed`, `customer.subscription.updated`, `.deleted`,
   `invoice.payment_failed`.
4. `planTier` becomes **derived** from subscription status, never directly settable. Delete
   `user.upgradePlan` (`user.router.ts:131`) — F-4 closes here.
5. Stripe Customer Portal for cancellation and card updates. Don't build billing UI.
6. Pricing: €7.99/mo or €59/yr (38% saving). Anchor it — _"less than one delivery order"_.
   14-day trial, card required.
7. Dunning: on `payment_failed`, email + in-app banner, 7-day grace before downgrade.

**Acceptance criteria:**

- A test-mode card grants PREMIUM within 5s of checkout completion.
- Cancelling retains access until `currentPeriodEnd`, then downgrades automatically.
- Replaying a webhook does not double-apply.
- `user.upgradePlan` no longer exists.

**Docs:** `infrastructure.md` §6, §8, §10, §12; `business_flow.md` §9 — full rewrite.

---

#### `P2-2` — Observability · `M`

**Problem:** zero error tracking, zero APM, zero analytics. Production failures are invisible
today; after P2-1 they'll be invisible _and_ costing money.

**Steps:**

1. Sentry in both apps. Source maps in the build. Scrub PII from event payloads.
2. Replace `console.log` with `pino` structured logging, threading the existing `requestId`
   (`auth.middleware.ts:114`) through every log line.
3. PostHog (or Plausible if you want to stay cookieless) for the funnel in §7.
4. Alerts: AI failure rate > 5% over 15 min; image-worker queue depth > 100; p95 plan generation
   > 30s; any `payment_failed`.
5. `/health/ready` (`index.ts:47`) already checks the DB — add AI provider reachability and the
   worker heartbeat, and point an uptime monitor at it.

**Acceptance criteria:**

- A thrown error in production creates a Sentry issue with the request ID attached.
- The funnel dashboard renders real numbers.

**Docs:** `infrastructure.md` §10, §13.

---

#### `P2-3` — Weekly planning ritual (retention) · `L`

**Problem:** nothing brings a user back. Meal planning is inherently weekly and cyclical — the
product should own Sunday.

**Steps:**

1. `WeeklyPlanJob` — Sunday 10:00 in the user's timezone (add `ChefProfile.timezone`).
   Pre-generates next week's plan for premium users.
2. Email: _"Your week is ready — 21 meals, €63, 4 dishes you loved."_ One CTA: review the plan.
3. Web push (`web-push` + service worker), opt-in from the dashboard. Two notifications only:
   Sunday "plan ready" and a daily "time to start dinner" derived from `MEAL_SCHEDULE`.
   **Any more than this and users disable notifications entirely.**
4. Preferences page controls for both channels, plus one-click unsubscribe in every email.
5. Re-engagement: no login for 14 days → one email showing what they'd have eaten this week. One.
   Not a sequence.

**Acceptance criteria:**

- Sunday email arrives at 10:00 local time, with correct meal count and cost.
- Push permission is requested contextually (after the first plan), never on first load.
- Unsubscribing works from the email itself without logging in.

**Docs:** `infrastructure.md` §7, §10; `business_flow.md` — new §"Weekly Ritual".

---

#### `P2-4` — Lead with the price · `M`

**Problem:** the strongest differentiator is buried on a secondary page and denominated in EUR
against Romanian price assumptions (`apps/api/src/lib/ai/prompts.ts:134`).

**Steps:**

1. Show the week's estimated cost on the **meal-plan** page header, not just the shopping list.
2. Add a budget target to preferences: _"Keep my week under €X."_ Feed it into the generation
   prompt as a hard constraint and show a warning when a plan exceeds it.
3. Honour `ChefProfile.deliveryCurrency` (`schema.prisma:152`) end-to-end. Today every price is
   `estimatedPriceEur` regardless of the setting. Store a base currency, convert on read.
4. Cost-per-serving on recipe cards. _"€2.10/serving"_ is a genuinely useful sort key.
5. Add sorting/filtering by cost to the recipes page.

**Acceptance criteria:**

- A user with `deliveryCurrency = RON` sees RON everywhere, converted consistently.
- Setting a €60 budget produces plans that come in under it, or explains why they don't.

**Docs:** `infrastructure.md` §6, §7; `business_flow.md` shopping-list section.

---

#### `P2-5` — Account self-service & GDPR · `M`

**Problem:** no account deletion, no data export, no email verification. The app stores body
metrics, weight history, and dietary/health information — this is special-category data under
GDPR, and you're deploying in the EU.

**Steps:**

1. `user.requestDeletion` — 30-day soft delete, then a hard cascade. The schema already cascades
   correctly from `User`.
2. `user.exportData` — JSON of profile, preferences, plans, logs, weights, ratings. Generate
   async, email a signed time-limited link.
3. Email verification using the `VerificationToken` table and the `IEmailService` from P0-6.
   Verify on signup; block plan generation until verified (prevents throwaway-account farming of
   AI credits).
4. Privacy policy and terms pages. Cookie banner is **not** required if you stay on
   strictly-necessary cookies — keep it that way and skip the banner.

**Acceptance criteria:**

- Deletion removes every row referencing the user within 30 days.
- Export contains all personal data in a portable format.
- Unverified accounts cannot burn AI credits.

**Docs:** `business_flow.md` — new §"Account Lifecycle"; `infrastructure.md` §8.

---

### P3 — Differentiation (Weeks 7–10)

Pick **two**. Do not attempt all five.

#### `P3-1` — Pantry & leftovers · `XL`

Track what's on hand; subtract from the shopping list; bias generation toward using up what's
expiring. Directly attacks food waste, which is the strongest emotional pitch in this category
and pairs perfectly with the existing price data (_"this week's plan uses €12 of what you already
have"_).

#### `P3-2` — Household plans · `L`

Multiple eaters with different restrictions on one plan; shared shopping list; per-person portion
scaling. `DietaryPreferences.servingSize` (`schema.prisma:169`) already hints at this. Also the
natural upsell to a family tier at €12.99.

#### `P3-3` — Grocery delivery integration · `XL`

The scraping and product-link work (`lib/carrefour/`, `lib/grocery-ai/`) already exists. Push the
list into a real basket. Highest revenue potential (affiliate) and highest integration risk.

#### `P3-4` — Recipe import · `M`

Paste a URL → parse JSON-LD `Recipe` schema → add to the library. Cheap to build, immediately
useful, and it seeds the recipe corpus with things users already love.

#### `P3-5` — Photo logging · `L`

Photograph a meal → vision model estimates macros → writes a `DailyLog` entry. Removes the biggest
friction in tracking. Gemini is already wired up (`lib/ai/gemini.ts`), so the marginal cost is low.

---

## 7. Metrics & Instrumentation

Instrument these in P2-2. Without them, every prioritisation decision after this document is a
guess.

**Activation**

- Register → first plan generated (target: **> 60%**)
- Onboarding completion by tier — expect free to jump after P1-2

**Engagement**

- Weekly plan generation rate (target: **> 40%** of actives)
- Cook-mode sessions per user per week (target: **> 2** after P1-3)
- Meals logged per active user per week (target: **> 10**)
- Ratings submitted per week — this is the fuel for P1-1

**Retention**

- W1 / W4 / W12 retention. **W4 is the number that matters** for a weekly-cadence product.
- Sunday-email open and click-through (P2-3)

**Revenue**

- Trial → paid conversion (target: **> 25%**)
- Monthly churn (target: **< 7%**)
- AI cost per active user per month — must stay well under ARPU. `AiCallLog` already has the data.

**Health**

- p95 plan generation latency (target: **< 20s**)
- Image generation success rate (target: **> 95%**)
- AI call failure rate (target: **< 2%**)

---

## 8. Explicitly Out of Scope

Named so nobody rebuilds them by accident:

- **Native mobile apps.** The responsive web app shipped last week. Add a PWA manifest + service
  worker in P2-3 and revisit native only if push retention proves the case.
- **Social feed / recipe sharing between users.** Cold-start problem, moderation burden, no
  evidence of demand.
- **The `Post` / `Tag` / `PostTag` blog models.** Delete them in P0-7's cleanup pass — they're
  scaffolding from the starter template. Same for `UserProfile` (bio/website/twitter/github),
  which is never read or written.
- **Video content.** Enormous production cost, no differentiation.
- **Custom ML models.** Frontier LLM APIs are correct here for years.

---

## 9. Ticket Index

| ID         | Title                                    | Size | Fixes    | Depends on       |
| ---------- | ---------------------------------------- | ---- | -------- | ---------------- |
| **P0-1**   | Fix dashboard next-meal logic            | M    | F-1      | —                |
| **P0-2**   | Delete `/user`, close public read        | S    | F-2, F-8 | —                |
| **P0-3**   | Make CI run on `master`                  | S    | F-3      | —                |
| **P0-4**   | Rate limiting + helmet + AI quotas       | M    | F-6      | —                |
| **P0-5**   | Unify calorie target                     | M    | F-5      | —                |
| **P0-6**   | Password reset flow                      | M    | F-7      | P0-4             |
| **P0-7**   | Refactor plan assembly, kill duplication | M    | —        | —                |
| **P0-8**   | Backend test foundation                  | L    | F-9      | P0-1, P0-7       |
| **P0-9**   | Correct stale docs                       | S    | —        | P0-1, P0-2, P0-6 |
| **P1-1**   | Close the feedback loop                  | L    | —        | P0-7, P0-8       |
| **P1-2**   | Free allergies & restrictions            | M    | —        | P0-8             |
| **P1-3**   | Cook mode                                | L    | —        | P0-5             |
| **P1-4**   | Make the AI chef real                    | M    | —        | P0-4             |
| **P1-5**   | Sync shopping-list check-off             | S    | —        | —                |
| **P2-1**   | Stripe subscriptions                     | L    | F-4      | P1-2             |
| **P2-2**   | Observability                            | M    | —        | P0-3             |
| **P2-3**   | Weekly planning ritual                   | L    | —        | P0-6, P2-2       |
| **P2-4**   | Lead with the price                      | M    | —        | P0-5             |
| **P2-5**   | Account self-service & GDPR              | M    | —        | P0-6             |
| **P3-1…5** | Differentiation — pick two               | XL   | —        | P2-2             |

---

## Appendix — Working Agreements

Per `CLAUDE.md`, every ticket above lists the documentation it must update **in the same PR**.
Additionally:

- One ticket, one PR, one conventional commit scope.
- No PR merges without CI green (enforceable once P0-3 lands).
- Any new tRPC procedure goes into `infrastructure.md` §8 in the same change.
- Any new env var goes into `.env.example`, `.env.production.example`, and `infrastructure.md` §10.
- Coverage on `src/application/` ratchets up, never down.
