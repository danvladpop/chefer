# Chefer — Business Flows

> **Keep this document up to date.** Any time a new flow is added, an existing flow changes, or a new tRPC procedure is introduced, update the relevant section here.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [User Registration Flow](#2-user-registration-flow)
3. [User Login Flow](#3-user-login-flow)
4. [Session & Authorization Flow](#4-session--authorization-flow)
5. [View User Profile Flow](#5-view-user-profile-flow)
6. [User Management (Admin) Flow](#6-user-management-admin-flow)
7. [Post Lifecycle Flow](#7-post-lifecycle-flow)
8. [API Request Lifecycle](#8-api-request-lifecycle)
9. [Premium Tier & Meal Plan Generation Flow](#9-premium-tier--meal-plan-generation-flow)
10. [Dashboard Summary Flow](#10-dashboard-summary-flow)
11. [Password Reset Flow](#11-password-reset-flow)
12. [Cook Mode Flow](#12-cook-mode-flow)
13. [AI Chat Flow](#13-ai-chat-flow)
14. [Adaptive Chef Weekly Review Flow](#14-adaptive-chef-weekly-review-flow)
15. [Snap-to-Log Flow (F4)](#15-snap-to-log-flow-f4)
16. [Recipe Import & Cheferize Flow](#16-recipe-import--cheferize-flow)

---

## 1. Application Overview

Chefer is a full-stack web application with a clear separation between a **Next.js frontend** (port 3000) and an **Express + tRPC API** (port 3001). All data flows between the frontend and backend go through tRPC over HTTP.

```
Browser
  │
  ├─ Server Components (SSR) ──► tRPC Server Client ──► API (3001) ──► PostgreSQL
  │
  └─ Client Components (CSR) ──► tRPC React Client ──► API (3001) ──► PostgreSQL
```

---

## 2. User Registration Flow

> **Status:** Implemented (self-service at `/register`).

```
1. User fills in RegisterForm at /(auth)/register
   └── email, password, firstName?, lastName? (react-hook-form + Zod)
2. auth.register (public tRPC mutation, rate-limited 10/15 min per IP)
   └── AuthService.register
        ├── reject with CONFLICT when the email already has an account
        ├── bcrypt.hash(password, 12)
        ├── prisma.user.create (role USER, planTier FREE)
        └── createSession → chefer_session cookie
            (HttpOnly, SameSite=Strict, Secure in prod, 30 days)
3. Client redirects to /onboarding
```

Admins can additionally create users via `user.create` (admin-only).

---

## 3. User Login Flow

> **Status:** Implemented.

```
1. User fills in LoginForm at /(auth)/login
   └── email + password (react-hook-form + Zod)
2. auth.login (public tRPC mutation, rate-limited 10/15 min per IP)
   └── AuthService.login
        ├── prisma.user.findUnique by normalised email
        ├── bcrypt.compare — identical UNAUTHORIZED for wrong email
        │   and wrong password (no account probing)
        └── createSession → chefer_session cookie
            (HttpOnly, SameSite=Strict, Secure in prod, 30 days)
3. Client router.push('/dashboard')
```

Sessions are DB rows (`sessions` table), not JWTs — resolution is a lookup on
every request (see §4), and logout / password reset delete the rows.
"Forgot password?" on the form starts the reset flow (§11).

---

## 4. Session & Authorization Flow

> **Status:** Implemented — DB-backed sessions resolved from the
> `chefer_session` cookie. The `Authorization: Bearer` branch in
> `createContext` is scaffolding for a possible future token flow and is
> currently a no-op.

**How the API resolves the current user on every request:**

```
Incoming HTTP request
  │
  ├─ requestIdMiddleware → attaches X-Request-ID
  │
  └─ tRPC adapter → createContext()
        │
        ├─ Read cookie: chefer_session
        ├─ OR read header: Authorization: Bearer <token>
        │
        ├─ Validate token / look up session
        │
        └─ Set ctx.user (null if unauthenticated)
              │
              └─ Procedure middleware checks ctx.user:
                    publicProcedure    → always allowed
                    protectedProcedure → requires ctx.user != null
                    premiumProcedure   → requires planTier === 'PREMIUM' OR role === 'ADMIN'
                    adminProcedure     → requires ctx.user.role === 'ADMIN'
```

**How the web app handles an expired or deleted session:**

```
Browser still holds a chefer_session cookie whose row is gone
  │
  ├─ Navigate to /dashboard
  │     ├─ middleware.ts sees a cookie value → allows the request through
  │     └─ Client queries fire → API returns UNAUTHORIZED
  │           └─ QueryCache/MutationCache onError (lib/trpc.ts)
  │                 └─ window.location.replace('/login?from=…')
  │
  └─ Navigate to /, /login or /register
        └─ getSessionUser() calls auth.me
              ├─ user  → redirect('/dashboard')
              └─ null  → render the page (login form is reachable)
```

The stale cookie is not explicitly cleared — server components cannot modify cookies
during render. A successful login overwrites it via `Set-Cookie`.

**Role capabilities:**

| Role              | What they can do                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| (unauthenticated) | `auth.register`, `auth.login`, `auth.requestPasswordReset`, `auth.resetPassword`, `auth.me`                                     |
| USER              | All protected procedures: `user.me`, `user.update` (own), plans, recipes, tracker, …                                            |
| MODERATOR         | Same as USER (moderation capabilities reserved for future)                                                                      |
| ADMIN             | Everything, incl. `user.list`, `user.create`, `user.delete`, `user.update` (any user); treated as premium by `premiumProcedure` |

---

## 5. View User Profile Flow

> **Status:** Removed 2026-08-21 (roadmap P0-2). The `/user` dev scaffold rendered the first
> account's name and email to anonymous visitors and was deleted; `user.getById` is now a
> `protectedProcedure`. Authenticated users see their own data via `user.me` on `/profile`.

---

## 6. User Management (Admin) Flow

> **Status:** tRPC procedures implemented. Admin UI not yet built.

### List Users

```
adminProcedure user.list
  Input: { page, limit, search?, role?, sortBy, sortOrder }
  │
  └── UserService.list()
        └── PrismaUserRepository.findManyWithCount()
              └── prisma.$transaction([findMany, count])
  Output: { users: User[], total: number, page, limit, totalPages }
```

### Create User

```
adminProcedure user.create
  Input: { email, name?, password, role? }
  │
  └── UserService.create()
        └── Check email not already in use
        └── Hash password
        └── PrismaUserRepository.create()
  Output: User
```

### Update User

```
protectedProcedure user.update
  Input: { id, name?, email?, role?, image? }
  │
  ├── If caller is not ADMIN:
  │     └── Reject if id != ctx.user.id (FORBIDDEN)
  │     └── Reject if role is being changed (FORBIDDEN)
  └── UserService.update(id, data)
        └── PrismaUserRepository.update()
  Output: User
```

### Delete User

```
adminProcedure user.delete
  Input: { id }
  │
  └── Reject if id == ctx.user.id (cannot delete self)
  └── UserService.delete(id)
        └── PrismaUserRepository.delete()
  Output: { success: true }
```

---

## 7. Post Lifecycle Flow

> **Status:** Starter-template scaffolding — no router, no UI, no plans to
> build it. The `Post`/`Tag`/`PostTag` models are slated for deletion
> (roadmap §8 "explicitly out of scope"); the section below is kept only
> until the schema cleanup lands.

**Planned states:**

```
DRAFT ──► PUBLISHED ──► ARCHIVED
  │                        │
  └────────────────────────┘ (can archive from any state)
```

**Planned create flow:**

```
1. Author fills in PostEditor (title, content, tags)
2. POST trpc/post.create (protectedProcedure)
3. PostService.create()
    └── slugify(title) → unique slug
    └── prisma.post.create() with status: DRAFT
4. Redirect to post edit page
```

**Planned publish flow:**

```
1. Author clicks Publish on a DRAFT post
2. PATCH trpc/post.publish (protectedProcedure)
3. PostService.publish(id)
    └── Check caller is the author (or ADMIN)
    └── prisma.post.update({ status: PUBLISHED, published: true, publishedAt: now() })
```

---

## 8. API Request Lifecycle

Every call from the frontend to the API follows this path:

```
Frontend (Server or Client Component)
  │
  │  HTTP POST /trpc/<procedure>  (batched by tRPC)
  ▼
Express Server (apps/api, port 3001)
  │
  ├─ CORS check
  ├─ JSON body parse
  ├─ requestIdMiddleware (X-Request-ID)
  │
  └─ tRPC adapter
        │
        ├─ createContext()
        │     └─ Resolve ctx.user from cookie/header
        │
        ├─ timingMiddleware (logs duration in dev)
        │
        ├─ [if protectedProcedure] isAuthenticated middleware
        ├─ [if adminProcedure]     isAdmin middleware
        │
        ├─ Zod input validation
        │
        └─ Router handler
              └─ Service method
                    └─ Repository method
                          └─ Prisma → PostgreSQL
                                └─ Response serialised with superjson
                                      └─ Returned to frontend
```

### Error Handling

| Source                       | How it surfaces                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Zod validation failure       | tRPC `BAD_REQUEST` with field-level errors                                                                    |
| `UserNotFoundError` (domain) | Mapped to tRPC `NOT_FOUND`                                                                                    |
| Unauthenticated access       | tRPC `UNAUTHORIZED`                                                                                           |
| Insufficient role            | tRPC `FORBIDDEN`                                                                                              |
| Unhandled exception          | tRPC `INTERNAL_SERVER_ERROR` — captured to Sentry (with tRPC path, request ID, user ID) and logged to console |

---

## 9. Premium Tier & Meal Plan Generation Flow

Users have a `planTier` (`FREE` by default, `PREMIUM` after upgrading). Admins are treated as premium everywhere.

### The feature matrix (PW-1)

**What each tier gets is defined in one file: [`packages/types/src/plan-features.ts`](./packages/types/src/plan-features.ts)** (`PLAN_FEATURES`). This document intentionally does not copy the matrix — the file is the source of truth, and everything reads from it:

- **API enforcement** — `apps/api/src/lib/entitlements.ts` (`isPremiumUser` / `hasFeature` / `getLimit`) backs the `premiumProcedure` middleware, the tier branch in `mealPlan.generate`/`swapRecipe`, and the daily quotas in `apps/api/src/lib/quotas.ts`. No other API file compares `planTier` directly.
- **Web UI** — the `useEntitlement(key)` hook (`apps/web/src/hooks/useEntitlement.ts`) resolves a feature for the current user; the `UpgradeButton` dialog and `UpgradeCard` panels render their perk lists from `PREMIUM_PERK_KEYS`.

Changing a limit or moving a feature between tiers is an edit to that one file; enforcement and marketing copy follow automatically.

### Upgrade & downgrade flow (soft paywall, PW-2 — no payment integration)

```
UpgradeButton (ONE shared surface; every touchpoint passes a `source`)
  sources: sidebar, mobile-drawer, meal-plan-banner, pool-exhaustion,
           shopping-list, preferences-locked, onboarding, profile-page, swap,
           chat-quota (the widget swaps its input for the shared surface when
           the API answers with X-Chat-Quota-Exhausted; upgrading re-enables
           the chat in place)
  → capture('upgrade_prompt_shown' { source })
  → Sheet dialog ("free during the beta") → capture('upgrade_clicked')
  → user.upgradePlan (protected) → planTier = PREMIUM
  → capture('upgrade_completed') → full cache invalidate + router.refresh

DowngradeButton (profile page, premium users)
  → inline confirm → user.downgradePlan → planTier = FREE
  → capture('downgrade_completed')

Admin (/admin/users, adminProcedure-gated)
  → user.list search + user.aiCallsToday usage → user.setPlanTier flips
    any user's tier without touching prod psql
```

**Merchandising rails (premium_plan.md §6, wave 0):**

- **`/premium` showcase page** — the full pitch at one deep-linkable URL.
  Feature cards render from `features/premium/premium-features.ts` (a registry
  file — each wave agent appends its card when its feature ships); the
  Free-vs-Premium table renders row-by-row from `PLAN_FEATURES`. Entry points
  link `/premium?source=<their source>`; the page fires
  `premium_page_viewed { source }` and its CTA keeps the ORIGIN source's
  funnel attribution (falling back to `premium-page` on direct visits).
- **Upgrade dialog v2 (source-aware)** — `SOURCE_FEATURE_PRIORITY` maps each
  `source` to the matrix keys the user was looking at; those perks render
  first and expanded, the rest collapse to compact rows. The dialog links to
  `/premium` preserving its source.
- **Nudge frequency cap** — every contextual nudge must render through
  `useNudge(source)` (`features/premium/lib/nudge-cap.ts`): max one nudge per
  day across all sources, dismissal silences that source for 7 days
  (localStorage). No fake urgency, no countdowns.
- **Live nudges (§6.5, via the shared `UpgradeNudge` component)** —
  `post-rating` (free user saves a rating → "Premium turns your ratings into
  next week's menu") and `monday-nudge` (free user opens a plan-less current
  week on a Monday). Mounting counts as the impression:
  `upgrade_prompt_shown { source }`; the CTA deep-links to `/premium`.
- **Onboarding carousel (§6.6)** — the free flow's "You're all set" step
  renders `UpgradeCard perkDisplay="carousel"`: the same feature-card
  registry as `/premium`, horizontally scrollable, plus the comparison-table
  link. Source stays `onboarding`.

The `source`-tagged events are the input to the PW-3 funnel (prompt → click →
complete conversion by touchpoint). PW-3 adds per-feature usage events
(`plan_generated`, `meal_swapped`, `chat_message_sent`,
`shopping_list_regenerated`, `preferences_saved`, `recipe_rated`,
`recipe_pinned`, `pool_exhausted`) and a `planTier` person property on
identify — the full dictionary and the one-time PostHog/Sentry dashboard
setup live in [`docs/analytics-funnel.md`](./docs/analytics-funnel.md).

### Weekly plan generation

`mealPlan.generate` is available to both tiers — the behaviour branches in `MealPlanService`:

```
mealPlan.generate { weekOffset }
  │
  ├─ FREE user
  │    ├─ ensureCuratedRecipes()          (idempotent upsert of the 64-recipe pool)
  │    ├─ safeCuratedPools(prefs)         (filter by allergies/restrictions/dislikes)
  │    │    └─ any plan meal type < MIN_SAFE_POOL_SIZE safe recipes
  │    │         → PRECONDITION_FAILED → contextual upgrade prompt in the UI
  │    ├─ random breakfast/lunch/dinner per day (shuffled cycling, 7 days)
  │    ├─ no AI call, no chef profile required
  │    └─ recipes ship with preset images (imageStatus DONE) → instant board
  │
  └─ PREMIUM user (or ADMIN)
       ├─ load ChefProfile + DietaryPreferences (profile required)
       ├─ load learning signals (P1-1): pinned favourites
       │   (useInNextPlan=true) + 20 most recent MealRatings joined to
       │   recipe name/cuisine
       ├─ calorie + macro targets from resolveDailyTargets()
       │   (preferences.service — THE single source: live Mifflin-St Jeor
       │   TDEE ± goal adjustment when metrics are complete, else the stored
       │   snapshot. The dashboard ring and tracker read the same resolver,
       │   so a goal change moves all three together.)
       ├─ IAIService.generateMealPlan (Gemini) → 21 personalised recipes
       │   (prompt carries "Liked recently (4-5★)…" / "Disliked recently
       │   (1-2★)… do not repeat" / "Already booked: <pinned names>" /
       │   "Budget (hard constraint): stay under €X" when set — P2-4)
       ├─ pinned favourites REPLACE matching meal slots verbatim (exact
       │   saved recipe, meal type inferred from recent plans, spread
       │   across the week); useInNextPlan flags cleared after success
       ├─ response.personalisation { pinnedDishNames, likedCount,
       │   dislikedCount } → meal-plan page shows "Built for you from N
       │   dishes you rated and M pinned favourites"
       ├─ response.estimatedCost (every tier, also on curated plans and
       │   plan loads): week cost from the price vocabulary → cost chip
       │   on the planner; over-budget warning when it exceeds the
       │   premium weeklyBudgetEur (P2-4)
       ├─ image reuse: recipes whose name matches a previously generated
       │   DONE image are marked DONE immediately
       ├─ remaining recipes upserted as PENDING with imagePriority
       │   (0 = today) → RecipeImageWorker.wake()
       └─ worker generates up to 5 images in parallel (Pollinations),
           streaming DONE events to the client over SSE
```

### Weekly auto-generation (PW-5, premium)

```
WeeklyPlanWorker (hourly tick; acts Sundays ≥ 08:00 UTC)
  ├─ eligible: planTier = PREMIUM AND complete chef profile
  ├─ skip users who already have next week's plan (findByWeekStart)
  ├─ MealPlanService.generate(userId, weekOffset=1, premium=true)
  │    └─ full premium path: ratings + pins + budget + safety (P1-1/P2-4)
  └─ Monday: dashboard.summary.weekReady { preparedAt, ratedCount }
       → "Your week is ready — built from N dishes you rated" banner
```

### Viewing the plan

The generated week is presented two ways, chosen by viewport rather than by any
user setting:

```
/meal-plan
  │
  ├─ ≥ lg (1024px)   7-column week grid — the whole week at once
  │
  └─ < lg            Single-day view
       ├─ horizontal day picker (Mon–Sun), today selected by default
       ├─ that day's meals as full-width row cards + day totals
       └─ selected day is held in the URL as ?day=N, alongside ?week=N,
          so back/forward/refresh return to the day being viewed
```

A 7-column grid needs ~900px, so on a phone it showed roughly a third of one
column and reaching Sunday meant scrolling sideways through the whole week. The
single-day view is a different information architecture, not a scaled-down grid.
`/history/[planId]` renders the same component in read-only mode.

### Meal swap

`mealPlan.swapRecipe` — premium: AI-generated alternative; free: random curated recipe of the same meal type (excluding the current one).

### Shopping list & ingredient price vocabulary

```
shoppingList.getForWeek { weekOffset }
  |
  +- persisted AI list exists for the plan? -> serve it (aiGenerated: true)
  +- else deterministic merge of recipe ingredients (merge key: name|unit)
  |
  +- every item joined against IngredientPrice (store-agnostic vocabulary):
  |    estimatedPriceEur = quantity x pricePer100g / per100ml / perPiece
  |    unpriced ingredients -> IngredientPriceWorker.wake()
  +- estimatedTotalEur = sum of item estimates

All displayed quantities (shopping list + recipe pages) are converted to the
user's preferred unit system (ChefProfile.preferredUnits, set in Preferences):
METRIC shows g/kg/ml/l (cups -> ml), IMPERIAL shows oz/lb/fl oz/cups.

shoppingList.regenerate { weekOffset }   (PREMIUM only)
  +- Gemini consolidates raw ingredients -> persisted in ShoppingList table
     (keyed by planId) -> subsequent getForWeek calls serve it

Ingredient catalog permissions
  +- global rows (creatorId null): visible to all; edit/delete = ADMIN only
  |    (admin edits set source ADMIN -> exempt from weekly AI refresh)
  +- custom rows (creatorId set): visible/editable ONLY by their creator
  |    (hidden even from admins; others get NOT_FOUND)
  +- /ingredients page: All / My Ingredients tabs, search, add/edit/delete

Recipe creation (revamped form)
  +- ingredients.search picks from the catalog; ingredients.createCustom adds
  |    private ingredients (manual macros, uploaded or AI-generated image)
  +- ingredients.computeNutrition auto-fills per-serving nutrition from
  |    ingredient quantities (unit conversion x per-100g macros)
  +- recipe photo: device upload (POST /api/uploads/image) or deterministic
  |    AI image (recipe.aiImageUrl)

Synced check-off (P1-5)
  +- shoppingList.getForWeek returns checkedKeys; ticking an item calls
  |    shoppingList.toggleItems (optimistic client update, per-key
  |    add/remove under SERIALIZABLE + retry server-side) — checks made
  |    on one phone appear on the other on its next fetch
  +- pre-P1-5 localStorage checks migrate to the server once, then clear

IngredientPriceWorker (background)
  +- start + every 12 h: distinct ingredient names from ALL recipes
  +- prices missing entries, refreshes entries older than 7 days
  +- IAIService.estimateIngredientPrices (Gemini, batches of 40)
```

### Profile personalisation gating (P1-2: safety is free)

- **Safety is free on every tier**: `preferences.updateSafety` (`protectedProcedure`) writes allergies, dietary restrictions and disliked ingredients. Free curated plans and free swaps are filtered by them (`lib/curated-recipes/safety.ts`); premium AI generation feeds them into the prompt.
- **Personalisation depth is premium**: `preferences.setup` / `preferences.updateTargets` (`premiumProcedure`) own goal, body metrics, calorie targets, cuisine and meal cadence → free users receive `FORBIDDEN`.
- The Preferences page shows free users the editable safety section plus a locked-targets upgrade panel; the Onboarding wizard branches — free: 2 steps (safety → premium preview), premium: 4 steps (goal → metrics → diet → cuisine).
- **Pool exhaustion is the upsell**: when the curated pool keeps fewer than `MIN_SAFE_POOL_SIZE` safe recipes for any plan meal type, `mealPlan.generate` / free swap throw `PRECONDITION_FAILED` and the meal-plan page renders a contextual upgrade prompt ("not enough free recipes matching your restrictions") instead of an error.

---

## 10. Dashboard Summary Flow

`dashboard.summary` (protected) assembles the daily overview in `DashboardService.getSummary`:

```
dashboard.summary
  ├─ load ChefProfile + active MealPlan + recent favourites (parallel)
  ├─ join all recipe IDs across the plan's days
  ├─ nextMeal: resolved by MEAL TYPE, not position (getNextMealType)
  │    └─ first meal type present in today's plan whose window is still
  │       open — MEAL_WINDOW_END: breakfast <10, lunch <14, snack <17,
  │       dinner <21. A 3-meal plan therefore surfaces dinner from 14:00
  │       (its snack window doesn't exist), a 4-meal plan surfaces the
  │       snack first.
  ├─ restOfToday: today's meals whose type sorts after nextMeal
  ├─ tomorrowFirstMeal: set only when every window has passed (late
  │    evening) — the first meal of day (today+1) % 7, so the dashboard
  │    hero renders a "Tomorrow" card instead of going blank
  └─ nutrition: planned kcal/macros for today vs targets
```

The web hero card (`/dashboard`) renders `nextMeal`, else `tomorrowFirstMeal`
(badged "Tomorrow", CTA "View Recipe"), else the "all caught up" empty state.

---

## 11. Password Reset Flow

> Added 2026-08-21 (roadmap P0-6). Email goes through `IEmailService`
> (`apps/api/src/lib/email`): a console-logging mock when
> `EMAIL_MOCK_ENABLED=true` (default — the logged link is the local testing
> workflow), Resend otherwise.

```
/forgot-password → auth.requestPasswordReset { email }   (public)
  ├─ rate limits: 5/15 min per IP, 3/h per target address
  ├─ ALWAYS returns success — responses must not reveal which
  │   addresses have accounts (enumeration)
  └─ if the account exists:
       ├─ delete any previous reset tokens for the address
       ├─ VerificationToken { identifier: "reset:<email>",
       │    token: sha256(random 32 bytes), expires: +1 h }
       │    (only the hash is stored — a DB leak can't reset passwords)
       └─ email link: APP_URL/reset-password?token=<raw>

/reset-password?token=… → auth.resetPassword { token, password }   (public)
  ├─ look up sha256(token); reject invalid / expired / non-reset rows
  └─ transaction:
       ├─ user.passwordHash = bcrypt(newPassword, 12)
       ├─ delete all reset tokens for the address (single-use)
       └─ delete ALL of the user's sessions — every device signs out
```

---

## 12. Cook Mode Flow

> P1-3 — the single highest-leverage interaction: finishing a cook session
> closes the tracker loop AND the personalisation loop in one tap.

```
/recipes/[id]/cook?meal=<type>       (entry: recipe page "Cook" button,
  │                                   dashboard next-meal "Start Cooking";
  │                                   meal defaults by time of day)
  ├─ full-screen stepper — one instruction at a time, large type,
  │    tap or swipe to advance (step index clamped against rapid taps)
  ├─ screen wake lock (feature-detected, reacquired on tab return,
  │    silent degrade on iOS < 16.4)
  ├─ inline timer for steps mentioning a duration (upper bound of
  │    ranges, ≤ 4 h sanity cap; Android vibrates at zero)
  ├─ servings scaler + collapsible ingredients checklist
  │    (quantities scale live in the user's unit system)
  └─ Finish → "Made it!"
       ├─ tracker.getDay + tracker.upsertDay: APPENDS one serving of the
       │    recipe's macros to today's log (portionMultiplier 1 — cooking
       │    for 4 doesn't mean you ate 4×)
       ├─ capture('meal_cooked' { mealType })
       └─ StarRatingWidget — "your rating shapes what the chef cooks up
            next week" (P1-1 signal)
```

Real-device acceptance (wake lock, swipe, keyboard) is tracked in
[`docs/device-checklist.md`](./docs/device-checklist.md) (P1-6).

---

## 13. AI Chat Flow

The AI chef chat (P1-4) is a real assistant over the user's data, not canned
responses. The widget (`ChatWidget.tsx`, every dashboard page) posts the
message history to `POST /api/chat` on the API and renders the plain-text
stream.

```
POST /api/chat (session cookie)
  ├─ resolve user from session (401 without)
  ├─ ChatService.assertChatQuota
  │    └─ FREE: 5 messages/day (PLAN_FEATURES.chatMessagesPerDay, counted
  │       from ai_call_logs CHAT rows) — over quota streams the upgrade
  │       message as a normal reply + X-Chat-Quota-Exhausted header; the
  │       widget then swaps its input for UpgradeButton (source: chat-quota)
  ├─ build fresh context from REAL data:
  │    today's meals + macros + day totals, weekly overview, resolved
  │    daily targets, allergies/restrictions/dislikes, recent ratings
  ├─ log AiCallLog CHAT
  └─ aiService.chat(messages, { contextSummary, tools })
       ├─ Gemini: bounded function-calling loop, then streams the answer
       │    ├─ swapMeal(dayOfWeek, mealType) → MealPlanService.swapRecipe
       │    │    (a chat swap IS a plan swap — the meal-plan page reflects it)
       │    ├─ scaleRecipe(recipeName, servings) → quantities rescaled from
       │    │    the active plan
       │    └─ addToShoppingList(items[]) → ShoppingListService.addCustomItems
       │         (items land in the customItems overlay — visible and
       │         removable on the Shopping List page)
       └─ mock: echoes the same context and exercises the same tools
```

Routing: Caddy sends `/api/chat` to the API in production; a Next.js rewrite
proxies it in dev. `apps/web` no longer touches Prisma anywhere (Architecture
Rule 1 exception removed).

---

## 14. Adaptive Chef Weekly Review Flow

**F1 (premium_plan.md W1-A).** Every Sunday the chef reviews the week that is
ending and — for premium users — adjusts the calorie budget the next week is
generated against. Free users keep static targets but still get a real review
teaser (§6.4 ghost state).

```
WeeklyPlanWorker Sunday tick (BEFORE plan generation — ordering matters:
the adjusted target must shape next week's budget)
  ├─ CoachService.runReviewSweep(now)
  │    ├─ candidates: users with ≥3 DailyLog rows since UTC Monday (groupBy)
  │    └─ per user: runWeeklyReview(userId, now, applyAdjustment=premium?)
  │         ├─ idempotency: existing ChefReview row for (userId, weekStart
  │         │    = UTC Monday midnight, @@unique) → no-op; second tick on the
  │         │    same Sunday changes nothing
  │         ├─ <3 logged days → no review ("log more days" is itself the coach)
  │         ├─ metrics (application/coach/review.service.ts — pure, unit-tested):
  │         │    adherence = logged days / 7; avg kcal over logged days;
  │         │    weight trend = EWMA (α=0.25) over ≤28 days of WeightEntry
  │         │    rows, null unless ≥5 points spanning ≥10 days
  │         ├─ adjustment policy (deterministic, conservative):
  │         │    adherence <50% → nothing, coach the habit;
  │         │    LOSE plateau (trend ≥ −0.1 kg/wk) for 2 CONSECUTIVE reviews
  │         │    → −100 kcal (floor BMR×1.1, partial clamp);
  │         │    GAIN stall (trend ≤ +0.05) → +100 kcal (ceiling TDEE+500);
  │         │    free tier: policy skipped entirely (adjustmentKcal = 0)
  │         ├─ dial: ChefProfile.targetAdjustmentKcal += adjustment.
  │         │    resolveDailyTargets applies the dial AFTER the goal
  │         │    adjustment and BEFORE the protein cap — so the dashboard
  │         │    ring, tracker bars, chat context AND next week's generation
  │         │    budget all move together (ordering unit-tested)
  │         └─ prose: Gemini (application/coach/review-text.ts — warm,
  │              non-medical, never mentions BMR/algorithms; first line
  │              stands alone) with the deterministic template as mock/
  │              failure fallback → ChefReview row written last
  └─ plan generation sweep (PW-5) — reads the moved targets
```

**Surfaces:**

- `coach.currentReview` (protected query) returns the latest review while
  fresh (≤14 days after its weekStart), shaped by entitlement:
  `full` for `adaptiveCoaching` accounts; `teaser` (FIRST line only +
  `lockedLineCount` — the full text never leaves the server) for free;
  `none` with `loggedDaysThisWeek`/`daysNeeded` otherwise.
- Dashboard banner (`ChefReviewBanner`): premium sees summary chips + a
  full-review Sheet (`chef_review_viewed`); free sees the blurred-teaser ghost
  state (`upgrade_prompt_shown {source: 'coach-review'}` on impression,
  `teaser_engaged {feature: 'coach'}` on interaction, UpgradeButton).
- Dashboard `WeightCard`: free-for-everyone weight quick-entry + 30-day
  sparkline over the existing `tracker.logWeight`/`tracker.weightHistory`
  procedures (`weight_logged` on save) + "log N more days" coaching hint.
- Chat tool `getMyReview`: the model can quote the latest review; free users
  get the teaser line + an upgrade suggestion.

---

## 15. Snap-to-Log Flow (F4)

Photo logging + week rebalance (premium*plan.md W1-B). The honesty principle:
logging off-plan food is FREE (manual quick-add, chat "I ate this"); the
\_vision* scan and the automatic week rebalance are premium
(`PLAN_FEATURES.photoLogging`, `mealScansPerDay: 10`).

### Photo scan (premium)

```
Tracker page → "Scan a meal" → native camera / file picker (≤5 MB image)
POST /api/scan-meal (session cookie, raw image body — same transport as uploads)
  ├─ resolve user from session (401 without)
  ├─ assertMealScanQuota (lib/quotas.ts)
  │    ├─ FREE → 403 { upgradeRequired: true } — client opens the snap-scan
  │    │    demo sheet instead (upgrade source: snap-scan)
  │    └─ ≥10 scans today (ai_call_logs SCAN rows since midnight UTC) → 429
  ├─ log AiCallLog SCAN (attempts count, like chat)
  └─ aiService.analyzeMealPhoto(base64, mime)
       ├─ Gemini: multimodal structured output → { dishName, confidence
       │    low|med|high, kcal, protein, carbs, fat, portionNote }; the
       │    prompt demands honesty about what a photo can't show
       └─ mock: deterministic fixture (520 kcal chicken plate)
→ confirm Sheet: every number editable, confidence badge + portion note shown
  ├─ confirm → tracker.logCustomMeal (custom entry, estimatedBy: 'vision')
  │    → analytics meal_scanned { confirmed: true }
  └─ discard → nothing logged; meal_scanned { confirmed: false }
```

Custom entries render on the tracker as their own rows (name + "estimated" /
"quick add" chip, deletable via `tracker.deleteCustomMeal`) and count toward
the day's progress bars. They are preserved verbatim when the planned-meal
save flow rewrites the day (`tracker.upsertDay`).

### Free-tier honesty tools

- **Quick add** (tracker): name + kcal only → `tracker.logCustomMeal`
  (`estimatedBy: 'manual'`, mealType snack). Free for every account.
- **Chat "I ate this"**: the `logMeal` chat tool logs the model's own macro
  estimate as a manual custom entry into today's log.
- The camera button stays visible for free users; tapping it opens the
  demo-scan ghost sheet (sample scan animating into macros) — fires
  `upgrade_prompt_shown { source: 'snap-scan' }` + `teaser_engaged
{ feature: 'snap' }` (§6.4 merchandising).

### Week rebalance (premium)

After ANY log write (tracker save, quick-add, photo scan, chat logMeal,
cook-mode "Made it!"), `TrackerService.maybeRebalance` runs for users with
`photoLogging` access:

```
rebalanceWeek(userId, activePlanId)   [application/meal-plan/rebalance.ts]
  ├─ only the CURRENT week's plan; Sunday → no-op (no future days)
  ├─ projection = Σ logged kcal Mon…today + Σ planned kcal for days AFTER today
  ├─ |projection − 7×dailyTarget| ≤ 15% → no-op ("week is on track")
  └─ else: greedy-swap up to 2 FUTURE slots for closer-calorie alternatives
       from the safety-filtered curated pool (deterministic, no AI call);
       stops early when back within 15% or no swap improves ≥2% of target
       → applies via mealPlanRepository.updateDayMeal
       → returns { rebalanced, swaps[previous↔new pairs], planId }
```

The client hands the swap pairs to localStorage
(`features/tracker/lib/rebalance-storage.ts`); the meal-plan page shows the
banner ("I adjusted Thursday dinner to keep your week on track") with one-tap
**undo**, which replays `mealPlan.replaceRecipe(previousRecipeId)` per swap.
Undo is per-device and expires after 24 h — nothing about the swap pairs is
stored server-side (wave-0 schema freeze). Analytics: `week_rebalanced` fires
on the client when a log's response carries an applied rebalance. Failures in
the rebalance path never fail the log save itself.

Routing: Caddy sends `/api/scan-meal` to the API in production; a Next.js
rewrite proxies it in dev.

---

## 16. Recipe Import & Cheferize Flow

**F5 "Cheferize Anything"** (premium_plan.md W1-C): paste a link, paste text, or snap a
cookbook page — the chef imports the recipe and adapts it to the user.

```
recipe.importPreview { url | text | imageBase64 }   (protected — free gets 1/day)
  ├─ assertRecipeImportQuota (PLAN_FEATURES.recipeImportsPerDay: FREE 1 / PREMIUM 5,
  │    counted from ai_call_logs RECIPE_IMPORT rows — attempts, not successes)
  ├─ URL path: SSRF-guarded fetch (http(s) only, default ports, private/loopback/
  │    link-local/metadata ranges rejected on EVERY resolved address and EVERY
  │    redirect hop; 10 s timeout; 1 MB streaming cap)
  │    → readability strip (schema.org Recipe JSON-LD preferred, chrome removed,
  │      og:image captured, 20 k char cap)
  ├─ IAIService.extractRecipe (structured output; photo path uses vision)
  ├─ IAIService.cheferizeRecipe — allergen/restriction substitutions, soft dislike
  │    swaps, servings rescaled to the profile serving size
  ├─ P1-2 allergen matcher RE-VALIDATES the adapted output (AI never trusted for
  │    safety) — surviving terms are listed and the adapted variant is unusable
  └─ macro cross-check vs the ingredient vocabulary (>25% off → "estimate uncertain")

recipe.importSave { recipe, variant, sourceUrl?, ogImageUrl? }   (premium)
  ├─ variant=adapted → matcher re-runs server-side on the submitted payload:
  │    a recipe that still violates the user's allergies/restrictions is REJECTED
  │    (fail closed — the "AI missed the peanut" case cannot be saved as adapted)
  ├─ image: og:image only when a guarded HEAD check confirms an image response,
  │    else the deterministic name-seeded Pollinations URL
  └─ Recipe created with source: MANUAL, creatorId, sourceUrl provenance
       → rateable + pinnable → flows into P1-1 generation placement
```

**Free-tier ghost state (§6.4):** the Import button is visible to everyone; free users
get one real extraction preview a day on their own URL, then the Cheferize diff renders
BLURRED with the adaptation count visible ("3 adaptations for your preferences") and the
upgrade CTA (`source: recipe-import`). Events: `recipe_imported {via}`,
`recipe_cheferized`, `teaser_engaged {feature: import}`, `upgrade_prompt_shown`.

**Chat entry point:** the `importRecipe(url)` chat tool runs the same flow — premium
saves automatically (adapted when safe and changed, else original); free gets the
preview summary and an upgrade pointer.

**Copyright stance (deliberate):** imports are a personal collection only. Provenance
is kept (`sourceUrl` on the recipe), imported recipes are owned by and visible to the
importing user only, never served to other users or the curated pool, and no full page
text is stored or republished — only the structured recipe data the user cooks from.
