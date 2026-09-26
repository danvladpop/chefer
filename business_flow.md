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
17. _(reserved for the F2 Household flow — lands with feat/household)_
18. [Zero-Waste Pantry Flow (F3)](#18-zero-waste-pantry-flow-f3)
19. [Beta Feedback Flow](#19-beta-feedback-flow)
20. [Native App Update Flow (OTA, M4-4)](#20-native-app-update-flow-ota-m4-4)
21. [Gym Training Flow](#21-gym-training-flow)
22. [Gym Setup & Workout Sync Flow (API)](#22-gym-setup--workout-sync-flow-api)

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
> `chefer_session` cookie (web) **or** an `Authorization: Bearer <sessionToken>`
> header (native mobile). Both carry the same DB `Session` token; resolution is
> shared via `lib/session-auth.ts` across tRPC and the non-tRPC endpoints.
> Mobile obtains the token from the `auth.login`/`auth.register` response body,
> which includes `session: { token, expires }` only for requests sent with the
> `x-chefer-client: mobile` header; browsers never receive the token in a body.

**How the API resolves the current user on every request:**

```
Incoming HTTP request
  │
  ├─ requestIdMiddleware → attaches X-Request-ID
  │
  └─ tRPC adapter → createContext()
        │
        ├─ Read cookie: chefer_session (web)
        ├─ OR read header: Authorization: Bearer <sessionToken> (mobile)
        │
        ├─ Look up the Session row (cookie wins when both are valid)
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

| Role              | What they can do                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| (unauthenticated) | `auth.register`, `auth.login`, `auth.requestPasswordReset`, `auth.resetPassword`, `auth.me`                                                     |
| USER              | All protected procedures: `user.me`, `user.update` (own), plans, recipes, tracker, …                                                            |
| MODERATOR         | Same as USER (moderation capabilities reserved for future)                                                                                      |
| ADMIN             | Everything, incl. `user.list`, `user.getById`, `user.create`, `user.delete`, `user.update` (any user); treated as premium by `premiumProcedure` |

---

## 5. View User Profile Flow

> **Status:** Removed 2026-08-21 (roadmap P0-2). The `/user` dev scaffold rendered the first
> account's name and email to anonymous visitors and was deleted. `user.getById` became a
> `protectedProcedure`, then admin-only on 2026-09-25 (audit F-ADM-1-1: any signed-in user could
> read any account's email). Authenticated users see their own data via `user.me` on `/profile`.
>
> **Your data (audit P0-6, 2026-09-25):** `/profile` (web) and Profile (mobile) offer **Download / Export my data** (`user.exportData`, JSON) and **Delete account** (`user.deleteSelf`: re-enter password + type DELETE; deletes the user's own recipes and everything that cascades, then signs them out). The mobile app links Terms and Privacy from More and the register screen.

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
- **Onboarding carousel (§6.6)** — the free flow's final (body metrics) step
  renders `UpgradeCard perkDisplay="carousel"` beneath the optional form: the same feature-card
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
       ├─ load ChefProfile + DietaryPreferences (no profile → default targets,
       │    audit F-PM-2; generation errors render inline with Try again)
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
  │            AND ChefProfile.autoPlanWeekly ("Plan my week every Sunday")
  ├─ next week already planned?
  │    ├─ untouched CARRY_FORWARD copy (no edits, no shopping ticks or
  │    │   custom items) → replaced below
  │    └─ anything else (USER, TEMPLATE, WEEKLY_AUTO, edited/shopped copy) → skip
  ├─ follows a "My weeks" template → applyTemplateToWeek (origin TEMPLATE, no AI)
  ├─ otherwise MealPlanService.generate(userId, 1, true, { origin: WEEKLY_AUTO })
  │    └─ full premium path: ratings + pins + budget + safety (P1-1/P2-4)
  └─ Monday: dashboard.summary.weekReady { preparedAt, ratedCount } — only
       for WEEKLY_AUTO plans → "Your week is ready — built from N dishes you rated"
```

Every plan records its `origin` (audit F-PLAN-4-1/2/3): `USER` (generated,
restored or built by hand), `CARRY_FORWARD` (the lazy copy made when a new
week is first viewed), `TEMPLATE` (a followed week) or `WEEKLY_AUTO`.
Swapping a meal in a carry-forward copy (`updateDayMeal`) turns it into
`USER`, so the worker never overwrites a week the user has touched. Premium
users switch auto-planning off with `preferences.setAutoPlanWeekly` (toggle
on Preferences, web and mobile). The Sunday notification is still to come
(backlog P2-5).

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

### Week templates — "My weeks" (4-week rotation)

Users save refined weeks as named templates (`mealPlan.saveAsTemplate`, max 4 — CONFLICT beyond) and rotate through them. `followTemplate` marks one followed (at most one) and applies it to the chosen week immediately (the existing plan for that week is archived); from then on carry-forward clones the followed template instead of the latest plan, so the followed week repeats indefinitely. `renameTemplate` / `deleteTemplate` / `unfollowTemplate` manage the set. Templates are `MealPlan` rows with `isTemplate=true`, invisible to week/active/history queries. All tiers, zero AI. UI: "My Weeks" screen on mobile (from the Plan tab) and the `WeekTemplates` panel on web's meal-plan page.

### Week carry-forward

Plans continue week to week until changed: `mealPlan.getForWeek` for the current or next week, finding no plan, copies the followed template (if any — see "My weeks" above) or else the user's most recent plan into that week (a real plan row — shopping list, tracker and swaps work on it unchanged; the source week is never touched) and returns it flagged `carriedOver: true` once, which both clients render as a "Continued from your last plan" badge. Past weeks never materialize. "Regenerate Week" still replaces the copy, so opting out is one tap. The product intent: refine one good week and keep living it, tailoring meals via the picker below.

### Meal replace (picker)

`mealPlan.replaceRecipe` — any tier, no quota: sets a meal slot to a specific recipe the user chose. On mobile this is the primary per-meal action: the Plan tab's replace button opens a bottom-sheet picker (own + favourited recipes first, searchable) with an AI-regen footer (premium, calls `swapRecipe`). Web exposes `replaceRecipe` only via the tracker rebalance banner so far — meal-plan picker port pending (see `mobile_parity_backlog.md`).

### Shopping list & ingredient price vocabulary

**Shopping state survives plan changes** (audit F-SHOP-2-1, F-PLAN-6-1): check-offs and custom items are stored per plan, so `MealPlanRepository.createPlan` copies them from the same-week plan it replaces (regenerate, follow a template) onto the new plan. History **Restore** re-creates the old plan as the newest row for its week, archiving only that week, and brings that plan's own ticks and custom items back.

```
shoppingList.getForWeek { weekOffset }
  |
  +- persisted AI list exists for the plan? -> serve it (aiGenerated: true),
  |    tidied by the same rules (tidyListItems + local aisle map)
  +- else aggregateIngredientLines (shopping-list/aggregate.ts):
  |    canonical name (Egg = Eggs, "Fresh parsley" = parsley, parentheticals
  |    dropped) + unit family (g/kg/oz/lb together, ml/l/tsp/tbsp/cup
  |    together, count units only with the same unit); mixed units are summed
  |    and shown in the unit that contributed most. Water, ice, "to taste"
  |    and bare salt-and-pepper lines are dropped (audit F-SHOP-1-1)
  +- aisle: category-map.ts — frozen/canned/dried prefixes and pantry head
  |    words (stock, sauce, paste, powder, oil, …) first, then keywords
  |    (F-SHOP-1-2); "grains" is the "Grains & Pantry" aisle
  |
  +- every item joined against IngredientPrice (store-agnostic vocabulary):
  |    estimatedPriceEur = quantity x pricePer100g / per100ml / perPiece
  |    unpriced ingredients -> IngredientPriceWorker.wake()
  +- estimatedTotalEur = sum of item estimates (minus pantry-covered lines
       for pantryPlanning accounts)

The planner's "≈ €X this week" chip (plan-cost.ts) prices the SAME aggregated
lines, so it equals the list total unless the list adds custom items or
subtracts pantry stock (F-SHOP-1-3).

Pantry coverage (F-PAN-1-1/1-2): a line the user has ticked this week is
never "have it" (ticking seeds the pantry, which used to flip the same line
to covered and count it as saved); unticking removes that PURCHASE row again.
The matcher compares head nouns ("lemon" no longer covers "lemon juice",
"rice" no longer covers "rice vinegar"; cuts of meat still match) and a
pantry row with a known, smaller amount doesn't cover the line.

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
- **AI output is never trusted for safety** (audit F-PLAN-1-9, 2026-09-25): after `generateMealPlan` every dish is re-checked against the household's allergies and restrictions, and a failing slot is replaced from the safe curated pool (or dropped when nothing safe fits); an unsafe AI swap falls back to a curated swap. The matcher scans name, ingredients **and steps**, and accepts qualified substitutes ("dairy-free milk", "vegan butter", "egg-free mayo", "gluten-free pasta") only for their own allergen family.
- **Warnings instead of silence**: `mealPlan.getRecipe` and every plan response carry an optional `allergenWarnings: string[]` (the viewer's conflicting allergies/restrictions). Web and mobile show a red "Contains …" banner on recipe detail and in cook mode, and a chip on plan meal cards — e.g. after allergies change under an existing plan (F-REC-2-3, F-PLAN-1-7). Mobile import now shows the same "could not fully remove" warning as web when an adaptation fails safety (F-M-REC-4-1).
- **Personalisation depth is premium**: `preferences.setup` / `preferences.updateTargets` (`premiumProcedure`) own goal, body metrics, calorie targets, cuisine and meal cadence → free users receive `FORBIDDEN`.
- The Preferences page shows free users the editable safety section plus a locked-targets upgrade panel; the Onboarding wizard branches — free: 3 steps (safety → optional goal → optional body metrics, stored via `preferences.saveProfileBasics` with the premium pitch as a card under step 3), premium: 4 steps (goal → metrics → diet → cuisine). Both platforms start the wizard from the user's saved preferences (`preferences.get`), and `preferences.setup` never shrinks the safety lists, so re-opening onboarding after an upgrade can't erase allergies (audit F-ONB-1-1, 2026-09-25).
- **Pool exhaustion is the upsell**: when the curated pool keeps fewer than `MIN_SAFE_POOL_SIZE` safe recipes for any plan meal type, `mealPlan.generate` / free swap throw `PRECONDITION_FAILED` and the meal-plan page renders a contextual upgrade prompt ("not enough free recipes matching your restrictions") instead of an error.

---

## 10. Dashboard Summary Flow

`dashboard.summary` (protected) assembles the daily overview in `DashboardService.getSummary`. Web and mobile send `{ localDate, localHour }` (the device's own day and hour, via `localDateStr` in `@chefer/utils`), so "today", the day label and the next meal follow the user's time zone; older clients without it fall back to server time (audit F-DASH-1-1). The tracker likewise sends the local calendar day, never the UTC one (F-TRK-1-1).

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
  ├─ focus route: no tab bar or chat button on phones; Back/Next pinned
  │    to the bottom of the screen (audit F-REC-6-1)
  ├─ full-screen stepper — one instruction at a time, large type,
  │    tap or swipe to advance (step index clamped against rapid taps)
  ├─ screen wake lock (feature-detected, reacquired on tab return,
  │    silent degrade on iOS < 16.4)
  ├─ inline timer for steps mentioning a duration (upper bound of
  │    ranges, ≤ 4 h sanity cap; Android vibrates at zero)
  ├─ servings scaler + collapsible ingredients checklist
  │    (quantities scale live in the user's unit system)
  └─ Finish → "Made it!"
       ├─ tracker.logRecipe: atomically APPENDS one serving of the
       │    recipe's stored macros to today's log (portionMultiplier 1 —
       │    cooking for 4 doesn't mean you ate 4×); idempotent per
       │    recipe + meal type, so a double tap logs once
       ├─ capture('meal_cooked' { mealType })
       └─ StarRatingWidget — "your rating shapes what the chef cooks up
            next week" (P1-1 signal)
```

Real-device acceptance (wake lock, swipe, keyboard) is tracked in
[`docs/device-checklist.md`](./docs/device-checklist.md) (P1-6).

---

## 13. AI Chat Flow

> **Premium-only since 2026-09-25** (owner decision: per-user AI is premium). Free users
> keep the chat button; it opens a locked preview — a labelled example conversation, the
> upgrade sheet (`source: chat-locked`) and links to the free tools that do the same jobs
> (Replace a meal, Quick add, Add to shopping list). The API answers free users with
> FORBIDDEN from `reserveChatMessage`, sent as the existing 200 + `X-Chat-Quota-Exhausted`
> response plus `X-Chat-Upgrade-Required`, so shipped mobile builds still show their
> upgrade card. Recipe import (§16) and the AI nutrition auto-fill are premium-only the
> same way; free Sunday coach reviews use the deterministic template, never live AI.

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
- Weigh-ins are validated everywhere by the shared `parseBodyWeightKg`
  (`@chefer/utils`, 20–400 kg, "72,5" accepted, exponents rejected) with an
  inline error, and the API enforces the same bounds plus "not in the
  future". Entries can be corrected or deleted (`tracker.updateWeight` /
  `tracker.deleteWeight`): web lists them on /progress (linked from the
  card), mobile expands them inside the dashboard card. Reads ignore
  future-dated rows, and the coach's EWMA trend drops jumps over 3 kg/day,
  so a single typo can't swing the weekly adjustment (audit F-DASH-3-1).
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
  ├─ reserveMealScan (lib/quotas.ts — atomic reservation)
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
the day's progress bars.

**Day saves merge, they never replace** (audit 2026-09-25, F-PM-1 / F-TRK-1-2).
`tracker.upsertDay` carries only the planned meals the tracker shows; the
server keeps every custom entry and every logged recipe that isn't in today's
plan (e.g. cooked before a regenerate or swap). Those appear under "Also logged
today" (`getDay.offPlanLogged`) and count in the totals. Every day write runs
in a serializable transaction with retry, so parallel quick-adds from two
devices all persist. Saving with nothing ticked un-logs the planned meals.

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

---

## 17. Household Plans Flow (F2)

**"Feed the Whole Table"** (premium_plan.md W2-D): the account owner adds the
people they cook for — partner, kids, the flatmate with the nut allergy — and
one generated week feeds all of them safely, at the right amounts.

```
Preferences → "My household" section
  ├─ household.list (protected) — member chips with per-member safety summary
  ├─ household.add (premium, cap PLAN_FEATURES.householdMembers = 5)
  │    member = { name, portionFactor 0.25–3 (0.5 kid … 1.5 big eater),
  │              isKid, allergies[], dietaryRestrictions[], dislikedIngredients[] }
  │    → per-member editor reuses the onboarding StepDiet safety component
  │    → `household_member_added` on save
  ├─ household.update (premium) / household.remove (protected — a downgraded
  │    user must still be able to manage the members that filter their plans)
  └─ free tier ghost state (§6.4): ghost chips ("+ add your partner") → tap
       renders a sample merged week from the user's OWN diet + one fictional
       member; fires `upgrade_prompt_shown {source: 'household'}` +
       `teaser_engaged {feature: 'household'}`; UpgradeButton source=household

mealPlan.generate with members present
  ├─ PREMIUM (AI): computeHouseholdContext →
  │    MealPlanInput.householdContext {
  │      memberCount, portionSum = ceil(1 + Σ portionFactor),
  │      mergedSafety = union(owner + every member allergies/restrictions),
  │      dislikeNotes = ["avoid mushrooms for Maria", …]  (soft)
  │    }
  │    ├─ merged union ALSO replaces the top-level Allergies/Restrictions
  │    │    prompt fields (hard, every dish)
  │    ├─ prompt: buildHouseholdSection — servings=portionSum, quantities
  │    │    scaled, dislikes soft-balanced ("or note who the dish suits")
  │    └─ recipes come back with servings = portionSum → shopping list
  │         quantities scale automatically (list derives from ingredients)
  └─ FREE (curated): loadMergedSafety → safeCuratedPools(mergedUnion) —
       the SAME filterSafeRecipes, unchanged. SAFETY IS NEVER PREMIUM:
       the matrix gates the members UI, but existing members keep
       filtering every tier's plans (e.g. after a downgrade).
       Swaps (curated AND AI) use the union too.

Cooking & eating surfaces
  ├─ recipe page: "cooking for your household of N" note under servings
  ├─ cook mode: servings pre-set to the household portionSum (not the
  │    recipe's stored servings) when members exist
  ├─ meal-plan page: week cost shows per-household total AND ≈€/person
  └─ ratings: optional "who liked it" member chips on the star widget →
       stored as a "Liked by: Maria, Tom" line inside MealRating.notes
       (v1 — no schema change; the P1-1 signal reader is unaffected)
```

**Downgrade semantics:** nothing is deleted (the /premium FAQ promise).
Members stay visible in a read-only list with remove; their safety union
keeps applying to free curated plans; add/edit come back with premium.

**Events:** `household_member_added`, `upgrade_prompt_shown {source:
'household'}`, `teaser_engaged {feature: 'household'}` (see
docs/analytics-funnel.md).

---

## 18. Zero-Waste Pantry Flow (F3)

**F3 "Zero-Waste Kitchen"** (premium_plan.md W2-E): Chefer remembers what the user
bought, plans around it, and shows the savings in euros. v1 is deliberately honest —
no per-recipe gram depletion; a weekly 60-second confirm instead.

```
SEEDING (all tiers — the free ghost state needs real data)
shoppingList.toggleItems { keys, checked: true }        (protected)
  ├─ P1-5 check-off transaction commits first (a pantry failure never
  │    breaks the check-off)
  └─ PantryService.seedFromPurchases: each checked item's name/qty/unit →
       upsert PantryItem (source PURCHASE, name normalized,
       @@unique(userId, ingredientName, unit) collapses re-buys)
       ├─ STAPLES DENYLIST: salt, pepper, oil/vinegar/salt families, water,
       │    sugar, dried spices… are NEVER tracked
       └─ unchecking does NOT remove — you bought it last week, you have it

DEPLETION v1 (premium)
pantry.confirmWeekly { clearIds }                        (premium)
  ├─ auto-prompted once per week on the shopping list (Sunday / first visit,
  │    localStorage-cooldowned; also manual from the pantry page header)
  ├─ tapped items are deleted ("used it up")
  └─ kept rows older than 7 days decay quantity → 0 = the "some" state
       (amount unknown; updatedAt PRESERVED so use-first order holds)

PLANNING (premium — wired by the wave-2 integrator into the household-owned loader)
mealPlan.generate
  ├─ aiInput.useFirstIngredients ← getUseFirstIngredients(userId)
  │    (application/pantry/pantry-context.ts — top 5, OLDEST updatedAt first,
  │     human reason strings; buildUseFirstSection renders the soft-constraint
  │     prompt section, quantity 0 rendered as "some")
  ├─ optional leftoversMode → buildLeftoversSection steers dinners, then
  │    pairLeftovers() pairs 2-3 dinner → next-day-lunch slots with doubled
  │    servings and `leftoverOf` labels (Json only, no schema change)
  └─ personalisation.usedPantryItems ← computeUsedPantryItemsForUser(...)
       → meal-plan banner "uses N things you already have"
       → analytics `plan_used_pantry {itemCount}`

LIST SUBTRACTION (premium)
shoppingList.getForWeek / regenerate
  ├─ pantry-covered derived/AI items get `pantryCovered` ("Have it" chip),
  │    are EXCLUDED from estimatedTotalEur; custom items never subtracted
  ├─ header savings counter: pantry.savedEur = Σ estimated prices of covered
  │    items ("saved ~€X this week")
  ├─ one-tap re-add = pantry.markOutOfStock { ingredientName } — clears the
  │    pantry rows, item returns to the buy list
  └─ coach seam: PantryService.computeWeekPantrySavings(userId, weekStart)
       → ChefReview.savedEur (written by coach code at review time)

CHAT
whatCanIMake tool → PantryService.whatCanIMake: ranks active-plan + curated
recipes by pantry coverage (staples assumed on hand); free tier gets an
honest teaser.
```

**Free-tier ghost state (§6.4):** check-offs really seed the pantry, so after any
check-off session the shopping list header shows "You now have N items in your
kitchen — premium plans cook from them" plus the REAL computed savings figure for
this list. The `/pantry` page is visible read-only with the upsell. Events:
`upgrade_prompt_shown {source: pantry}` (impression), `teaser_engaged {feature:
pantry}`, `pantry_confirmed`, `plan_used_pantry {itemCount}`.

---

## 19. Beta Feedback Flow

Any signed-in user can send free-text feedback from the sidebar (desktop) or the
More drawer (mobile): "Send feedback" opens a Sheet with one textarea.

```
User → Send feedback → feedback.submit { message, path } → FeedbackService.submit
     → Feedback row (userId, message ≤2000, path, createdAt)
```

The current route is attached automatically as `path`. On success the client
fires the `feedback_submitted { path }` PostHog event and thanks the chef.
Feedback is write-only in-app; the team reads it via Prisma Studio/psql.

---

## 20. Native App Update Flow (OTA, M4-4)

The production native apps (`Chefer`, variant `production`) talk to
`https://chefer.duckdns.org` and receive JavaScript changes over the air via
EAS Update. Nothing here touches the API — it's how app code reaches phones.

```
push to master → Deploy workflow → API/web deployed → verify healthy
          → mobile-update job: pnpm mobile:update "<sha> <subject>"
            (or a developer runs it by hand)
          → eas update --channel production (bundle built with the prod API URL,
            tagged with the native fingerprint = runtimeVersion)

App launch (production binary) → expo-updates asks u.expo.dev for the newest
  update on channel "production" whose runtimeVersion == its own fingerprint
    ├─ none newer → run the embedded (or last downloaded) bundle
    └─ newer      → download in the background, keep running the current one;
                    the NEXT cold launch runs the new update
```

- **Native changes can't ship OTA.** A new native module changes the
  fingerprint; that update matches no installed binary and is simply ignored
  until the phones get a `pnpm mobile:release:*` build over USB.
- **Publish after deploy.** Automatic: the deploy workflow publishes only
  after the API it needs is verified live. API changes stay additive so older
  bundles (phones that haven't relaunched yet) keep working.
- **iOS free signing:** the binary itself expires 7 days after it was signed
  (free Apple ID); OTA doesn't extend that — re-run `pnpm mobile:release:ios`.
- The More tab footer shows which bundle is running (`built-in bundle` vs
  `update <id>`).
- Dev builds (`Chefer Dev`) keep loading JS from Metro on the Mac; they
  never receive production updates.

---

## 21. Gym Training Flow

Weight training alongside food (plan: [`gym_plan.md`](./gym_plan.md); evidence:
[`docs/gym/programming-research.md`](./docs/gym/programming-research.md)). Free on
every tier (`PLAN_FEATURES.gymTraining`). Mobile first; the web port is wave G5.
On web (G5) the same loop lives under `/gym*`: the mode comes from the URL plus a
`chefer_mode` cookie, the active workout is kept in localStorage (resumes after a
reload), and finished workouts upload through a localStorage outbox on
reconnect / focus. Web reminders are stored only; the phone sends them.

### Entering Gym mode

```
Food/Gym switch (header of every tab root) → persisted mode
  ├─ no GymProfile → /gym/setup
  │     days/week → experience → equipment + units → weekdays/reminder
  │     → gym.profile.recommend (pure engine: template + volume hints)
  │     → "Help me find my weights" (calibration) | "I know my weights"
  │     → gym.profile.completeSetup  (profile + active routine + initial progressions)
  └─ profile exists → Gym tabs: Today / Routine / Exercises / Stats
```

### The daily loop (offline-first)

```
Today: gym.bootstrap (persisted on the phone) → "Next up: <day>" with targets
  → Start → workoutReducer.startSession (warm-ups + prefilled working sets)
  → every tap: reducer action → SQLite KV write (crash-safe, resumable)
  → Finish → summary ("next time" decisions) → outbox.enqueue(doc)
      → optimistic: engine.applyFinishedSession on the cached bootstrap
      → flush when online: gym.session.upsertMany (idempotent by client UUID)
          → server: ownership + clientUpdatedAt checks → write doc
          → advance rotation once (rotationAppliedAt) → recompute progressions
      → invalidate gym.bootstrap
```

- The routine is a **rotation, not a calendar**: "next up" is the next day in
  sequence; missed days roll forward and are never marked failed.
- Outbox entries are removed only on an `applied`/`stale` ack; a `rejected`
  doc is parked for the user — workouts are never dropped silently.

### In the active workout (`gym/workout`, G2-A)

```
Set row: [− weight +] [− reps +] ✓  (prefilled from the suggestion)
  ✓ → completeSet with the shown values → rest timer (working sets only) + haptic
  − / + → next ACHIEVABLE load for the equipment (engine stepUp/stepDown);
          a weight change carries to the later unticked sets that had the old weight
  tap weight → plate calculator (barbell/smith) or keypad; tap reps → keypad
Last working set ticked → optional RIR chips (0/1/2/3+), highlighted while calibrating;
  the finished exercise stays open until answered / "Not now" / ticking elsewhere
⋯ menu → swap (just today | today + routine), skip, add/remove set, move, note, history
  "today + routine" → gym.routine.save (online only; one CONFLICT rebase onto the
  server's routine, else the swap stays today-only)
Finish → confirm if working sets are unticked → finish() → summary
  Summary "Next time" reads the optimistically folded cached progressions;
  Adjust → gym.progression.setOverride (online only)
Android back / ⌄ → minimise (the session stays resumable from Today); Discard is confirmed
Remove one set → long-press its row (mobile, ConfirmSheet) / tap its number (web menu);
  warm-ups and working sets alike, positions stay contiguous
```

### Supersets (G4-B)

```
Routine editor (mobile + web): "Superset with next" on any exercise but the day's last
  → adjacent exercises share a letter (routineExercise.supersetGroup: A, B … per day)
  → violet bracket + A1/A2 chips + "Superset A · <rest> s rest after each round"
  reorder / remove / cross-day move → groups re-normalised (a pair left with one dissolves;
  a step move hops over a whole superset; a drag dropped between members joins it)
Active workout: grouping derived from routineExerciseId via the cached routine
  (the session doc has no superset field; exercises added mid-session never join one,
  and moving members apart in the session breaks it for that session)
  tick set k of A1 → no rest, focus + scroll to set k of A2 (a running rest is cleared)
  last exercise of round k ticked → rest timer with the superset's LAST exercise's rest
  focus walks round by round (A1·1, A2·1, A1·2 …); skipped members drop out of rounds
Also shown outside the workout, same bracket/chip/heading, read-only (no reorder there):
  Routine tab day cards (mobile `(gym)/routine.tsx`, web `gym/routine/components/DayCard.tsx`)
  Today's "Next up" exercise list (mobile `today-screen.tsx`, web `today-view.tsx`'s NextUpCard,
  via the shared `SupersetHeading` component)
```

Shared logic: `@chefer/utils` `gym/supersets.ts` (`setSupersetWithNext`,
`moveSupersetItem[To]`, `removeSupersetItem`, `sessionSupersets`, `setTickOutcome`,
`workoutFocus`, `supersetRuns`, `supersetSlot`).

"Notes from last time": `SessionSummaryDto.exercises[].notes` (additive, optional —
shipped mobile clients predate it) carries each exercise's session note through
`toSessionSummary` (`@chefer/utils` `gym/session.ts`). The workout screens (mobile
`exercise-card.tsx`, web `workout/components/exercise-card.tsx`) show the most
recent non-empty note for that exercise from `bootstrap.recentSessions` as a muted
"Last time: <note>" line under the exercise name.

On web the floating chat widget is hidden on `/gym/workout*` (`ChatWidgetGate`).

### Progression (deterministic, explainable)

Double progression inside the slot's rep range (research §1): all sets at the
top → add the smallest achievable load; otherwise add reps. The optional
last-set RIR chip (0/1/2/3+) only adjusts (bigger jump when easy, consolidate
at failure). Misses hold once then drop ~10 %; three stalled exposures reset to
90 %; breaks > 2 weeks re-enter lighter and fast-track back. Every suggestion
carries a reason code shown as one sentence plus a "Why?" sheet.
`ExerciseProgression` is a derived cache — the server re-folds the engine over
completed sessions, so late offline syncs and deleted sessions stay consistent.

### Editing at three levels (D5)

| Level    | Where                                                                                        | Effect                                                              |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Routine  | Routine tab → editor (`gym.routine.save`, optimistic version)                                | Days, exercises, sets, rep ranges, rest, order, planned weekdays    |
| Week/day | Today → "Do another day" / "Skip" (`gym.routine.setNextDay`); pre-start and in-session edits | Session-only unless the user picks "Update routine"                 |
| Targets  | Summary "Adjust" / routine "Next targets" (`gym.progression.setOverride`)                    | Overrides the next prescription once; the engine resumes afterwards |

### Consistency mechanics

Weekly goal = routine days/week; the week ring fills per session; the streak
counts consecutive goal-met weeks. Flex weeks (earn 1 per 4 met weeks, hold 2)
auto-cover a short week; pauses (`gym.pause.*`) freeze the streak. No daily
streaks, no red "missed" markers.

- **Pause, end early:** `GymBootstrap.activePause` (additive DTO field, G4-A)
  carries the id/dates/reason of the pause covering the client's `today`, so
  both mobile settings and web settings can show "Paused until <date>" with an
  **End pause** button (`gym.pause.end`) regardless of which device started
  it — the web's earlier "only pauses created in this browser" workaround
  (localStorage bookkeeping) is gone.
- **Reminders (mobile only, local `expo-notifications`, G4-A):** one
  notification per planned weekday over the next 14 days at the profile's
  `reminderTime`, skipping a day already trained or inside a pause, plus at
  most one gentle "missed yesterday" nudge the day after a missed planned
  day (never the same day as a planned reminder — max one notification a
  day, never guilt copy). `useGymReminders()` cancels and reschedules
  everything whenever the bootstrap's reminder-relevant fields change or the
  app foregrounds; permission is requested only from the settings toggle and
  the setup wizard's reminder step, never on cold start. Web shows "Reminders
  are sent by the Chefer phone app" — it stores the preference but sends
  nothing itself.
- **Streak repair — "Log a past workout" (mobile + web, G4-A):** pick a date
  in the current or previous week (never the future), then a routine day or
  freestyle. Starts a session backdated to that date's `localDate` with
  `startedAt` at 18:00 local (`use-active-workout.ts`'s `backfillDate`); the
  user logs the actual sets in the normal workout screen and finishes like
  any other session. The engine folds it into `summarizeWeeks` by the week it
  happened in and into progression by `performedAt` — never by upload order —
  so a backfill logged after today's session still lands in the right place
  chronologically.
- **Contextual offers:** at most one of comeback / deload / stall / recap is
  shown at a time, in that priority order (`pickOffer` in `@chefer/utils`,
  shared by mobile and web so they never disagree — the web previously just
  took `offers[0]`, found and fixed during G4-A verification). A deload
  accepted from Today (`gym.progression.startDeload`) flips
  `nextWorkout.isDeload` and prescribes deload targets (half the sets,
  ~90% load, reps at the floor) on the very next bootstrap read.

## 22. Gym Setup & Workout Sync Flow (API)

Server side of gym_plan.md §4/§5.2 (services in `apps/api/src/application/gym/`). Every
`gym.*` procedure is `protectedProcedure` and free (D9). Progression, weeks, PRs and volume are
computed by the pure engine in `@chefer/utils`; the API loads, calls it and persists.

```
Setup: gym.profile.recommend (engine only) → user picks template/days/weekdays
  → gym.profile.completeSetup  ── ONE transaction:
        GymProfile (unit-default plates, goalHistory, knownWeights in offerState)
        + active Routine from the template (pointer = day 1, others deactivated)
        + ExerciseProgression initialState per (exercise, rep bucket)
  → returns GymBootstrap (the phone persists it)

Workout (offline on the phone) → Finish → outbox → gym.session.upsertMany({ docs })
  per doc, oldest first:
    unknown exercise / duplicate ids / bad range ─► rejected (reason)   phone parks it
    id owned by another user ────────────────────► rejected: forbidden
    stored clientUpdatedAt newer ────────────────► stale                phone drops it
    same clientUpdatedAt (retry) ────────────────► applied (no write)
    else: upsert row + delete/recreate children ─► applied
          COMPLETED routine session & rotationAppliedAt empty
             → Routine.nextDayId = engine nextDayIdAfter(day)   (exactly once)
  then ProgressionService.recompute(touched exercises):
    all completed exposures → group by rep bucket → engine foldHistory → state
    (overrides consumed by a newer exposure are cleared)
  → phone invalidates gym.bootstrap → next workout + prescriptions for `today`
```

- **Re-syncs are harmless:** the same doc twice is one write; the rotation never advances twice
  (even after later edits of the finished session).
- **Delete / discard** of a completed session re-folds its exercises; the rotation pointer is not
  rewound.
- **Routine editing** is a whole-document save with `expectedVersion`; a stale version returns
  `CONFLICT` with `error.data.conflict.current` (the server's `RoutineDto`) so the client can offer
  "keep mine / take theirs". Moving the pointer (`setNextDay`, finished workouts) never bumps the
  version.
- **Offers** in the bootstrap (deload, stall, comeback after > 8 days, monthly recap on days
  1–7) are dismissed by key via `gym.progression.dismissOffer`; `startDeload` makes the next 7 days'
  prescriptions deloads.
