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
17. [Household Plans Flow (F2)](#17-household-plans-flow-f2)
18. [Zero-Waste Pantry Flow (F3)](#18-zero-waste-pantry-flow-f3)
19. [Beta Feedback Flow](#19-beta-feedback-flow)
20. [Native App Update Flow (OTA, M4-4)](#20-native-app-update-flow-ota-m4-4)
21. [Gym Training Flow](#21-gym-training-flow)
22. [Gym Setup & Workout Sync Flow (API)](#22-gym-setup--workout-sync-flow-api)
23. [Weekly Emails & Notifications Flow (P2-5)](#23-weekly-emails--notifications-flow-p2-5)

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
   └── the client adds region? — detectRegion() from @chefer/utils reads the
       browser (navigator.languages) / device (Intl, no native dependency)
       locale, e.g. "en-US" → "US"
2. auth.register (public tRPC mutation, rate-limited 10/15 min per IP)
   └── AuthService.register
        ├── reject with CONFLICT when the email already has an account
        ├── bcrypt.hash(password, 12)
        ├── prisma.user.create (role USER, planTier FREE)
        │    └── with a region: nested ChefProfile { preferredUnits, deliveryCurrency }
        │        from defaultsForRegion (P2-6) — US/LR/MM → IMPERIAL, else METRIC;
        │        US → USD, GB → GBP, RO → RON, eurozone/else → EUR. The row has
        │        no goal, so preferences.hasProfile stays false and onboarding runs.
        └── createSession → chefer_session cookie
            (HttpOnly, SameSite=Strict, Secure in prod, 30 days)
   └── the router then emails the address-confirmation link in the
       background (P2-5, §23) — never blocks or fails the signup
3. Client redirects to /onboarding
4. Onboarding step 0 — "What brings you here?" (backlog P2-3, F-PM-6; web and
   mobile share `onboardingSteps` from @chefer/utils). Asked while
   ChefProfile.onboardingIntent is null; the answer is saved with
   preferences.setIntent (every tier):
   ├── Eat better (EAT_BETTER) → the tier's food wizard, unchanged
   │     (free: diet → goal → metrics; premium: goal → metrics → diet → cuisine)
   ├── Feed my household (HOUSEHOLD) → "Who's at your table?" (add members,
   │     free) → the food wizard
   └── Train (TRAIN) → gym setup first (web /gym/setup; mobile Gym mode →
         Today → setup). Food setup comes later: re-opening /onboarding skips
         the question and runs the food steps.
   Skip still works on every step (mobile "Skip for now" saves what is filled
   and leaves; web "Skip this question" continues with the solo flow).
   The premium wizard no longer asks "How many people are you cooking for?"
   — the household is the one people model (F-PM-8).
   Step counter (both platforms, shared `onboardingProgress`): while the
   intent question is on screen it reads "Step 1" with no total and an empty
   bar — the answer changes the total, so it never reads "1 of 4" and then
   "2 of 5"; from step 2 on it is "Step N of M" with a percentage.
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
"Forgot password?" on the form (web and the mobile Sign in screen) starts the
reset flow (§11). Both platforms' forms have a Show/Hide password toggle; the
register forms also require a matching confirm-password field (client-side
only — the API takes one `password`).

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

### Weekly auto-generation (PW-5; free curated weeks since P2-5)

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
on Preferences, web and mobile — shown on every tier since P2-5).

**Free tier (P2-5):** the same Sunday pass builds a _curated_ week (no AI) for
free accounts with the toggle on and a live session (signed in within the
session lifetime — abandoned signups don't collect weeks forever), through
`generate(userId, 1, false, { origin: WEEKLY_AUTO })`. Same skip rules
(existing week, followed template). The premium difference is that its week
learns. Monday's email and phone notification announce both (§23).

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
`/history/[planId]` renders the same component in read-only mode. Mobile has
the same read-only detail (`app/history/[planId].tsx`: day chips, meals open the
recipe) and adds Restore there; on both mobile screens Restore asks first
(`ConfirmSheet`) and only the row being restored shows a spinner.

### Meal swap

`mealPlan.swapRecipe` — premium: AI-generated alternative; free: random curated recipe of the same meal type (excluding the current one). A free swap of a portioned slot (P1-1) sizes the new dish to the old slot's calories; any other swap or replacement resets the slot to 1×. A curated free day can hold two snacks: every per-slot action (swap, replace, rebalance and its undo) names the slot by its index in the day, so the second snack is swapped on its own. Today's next-meal card, Later today and the read-only history grid show both snacks.

### Week templates — "My weeks" (4-week rotation)

Users save refined weeks as named templates (`mealPlan.saveAsTemplate`, max 4 — CONFLICT beyond) and switch between them by hand. `followTemplate` marks one followed (at most one) and applies it to the chosen week immediately (the existing plan for that week is archived); from then on carry-forward clones the followed template instead of the latest plan, so the followed week repeats indefinitely. `renameTemplate` / `deleteTemplate` / `unfollowTemplate` manage the set. Templates are `MealPlan` rows with `isTemplate=true`, invisible to week/active/history queries. All tiers, zero AI. UI: the **My weeks** page (web `/my-weeks`, mobile `my-weeks` screen; both reached from More and from the Plan tab) — saved weeks on top, past weeks below (`pastWeeks` in `@chefer/utils`: past weeks only, one card per week preferring the ACTIVE copy then the newest, newest week first — audit F-PLAN-6-3). It replaces History (web `/history` and mobile `history` redirect to My weeks; the read-only `/history/[planId]` view stays). Copy (F-PLAN-5-3): "Save a week you like and reuse it. The week you follow repeats each week until you switch." — nothing rotates automatically.

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

A plan made mid-week (a Friday signup, a Thursday regenerate, a copy first
opened on Wednesday) lists and prices only the days from its creation day on
(`shared/plan-window.ts`; `fromDayOfWeek` on the list, `shoppingFromDay` on the
plan, "Covers Fri–Sun" on both clients). A new user's first list used to be the
whole week — ~97 items / ~€169 for one person (audit F-PM-3).

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

All displayed prices (shopping-list lines + total, pantry savings, the
meal-plan week cost / per-person / over-budget copy, the ingredient browser)
are EUR estimates converted to ChefProfile.deliveryCurrency by formatMoney in
@chefer/utils — one static, approximate table (EUR 1, USD 1.08, GBP 0.85,
RON 4.97; EUR_EXCHANGE_RATES in currency.ts). The API stays EUR; converted
figures say "converted from euros at an approximate rate". The premium weekly
budget is typed in the user's currency and stored as weeklyBudgetEur.

shoppingList.regenerate { weekOffset }   (PREMIUM only; ticks carry over by ingredient name)
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

### Units & currency — one preference, every tier (P2-6)

```
Preferences → "Units & currency" (web preferences-form, mobile /preferences)
  └── preferences.setDisplayPreferences { preferredUnits?, currency? }   (FREE, every tier)
        ├── ChefProfile.preferredUnits / deliveryCurrency upserted
        └── units changed → gymProfileService.syncFromPreferredUnits
              └── gym profile exists and differs → gymProfileService.save({ unit })
                    (METRIC ↔ KG, IMPERIAL ↔ LB; stock rack swap + progression re-fold)

Gym settings unit switch / gym setup
  └── gym.profile.save { unit } / gym.profile.completeSetup
        └── ChefProfile.preferredUnits follows the gym unit (reverse sync;
            the forward path passes syncPreferences:false, so no ping-pong)
        └── setup's unit question defaults from preferredUnits (locale when
            the user has no profile yet)
```

- **Defaults** come from the device region at registration (see §2). Accounts created before P2-6, or from app builds that don't send a region, start METRIC + EUR and can change both freely.
- **Where units apply:** recipe/shopping quantities (`formatQuantity`), body weight on web + mobile (dashboard weight card, weight log + entry editing, /progress chart and deltas, the gym bodyweight prompt, the coach review's kg/wk trend — `formatBodyWeight` / `formatWeightTrend`) and gym loads (via the synced gym unit).
- **Body weight stays kg in the API.** IMPERIAL users type pounds; `parseBodyWeight(input, 'IMPERIAL')` accepts 44–881 lb (the API's 20–400 kg) with lb error copy and sends kg rounded to 0.1. A displayed lb value (0.1 lb) round-trips to the same stored kg.
- `preferences.updateTargets` still accepts `preferredUnits` / `deliveryCurrency` for app builds already in the stores (and syncs the gym the same way), but it is premium — current clients never send units through it.
- Not yet in the user's unit: the body-metrics step of onboarding / Goal & body (web has its own kg/lb + cm/ft toggles; mobile is metric-only v1).

### Profile personalisation gating (P1-2: safety is free)

- **Safety is free on every tier**: `preferences.updateSafety` (`protectedProcedure`) writes allergies, dietary restrictions and disliked ingredients. Free curated plans and free swaps are filtered by them (`lib/curated-recipes/safety.ts`); premium AI generation feeds them into the prompt.
- **AI output is never trusted for safety** (audit F-PLAN-1-9, 2026-09-25): after `generateMealPlan` every dish is re-checked against the household's allergies and restrictions, and a failing slot is replaced from the safe curated pool (or dropped when nothing safe fits); an unsafe AI swap falls back to a curated swap. The matcher scans name, ingredients **and steps**, and accepts qualified substitutes ("dairy-free milk", "vegan butter", "egg-free mayo", "gluten-free pasta") only for their own allergen family.
- **Warnings instead of silence**: `mealPlan.getRecipe` and every plan response carry an optional `allergenWarnings: string[]` (the viewer's conflicting allergies/restrictions). Web and mobile show a red "Contains …" banner on recipe detail and in cook mode, and a chip on plan meal cards — e.g. after allergies change under an existing plan (F-REC-2-3, F-PLAN-1-7). Mobile import now shows the same "could not fully remove" warning as web when an adaptation fails safety (F-M-REC-4-1).
- **Personalisation depth is premium**: `preferences.setup` / `preferences.updateTargets` (`premiumProcedure`) own goal, body metrics, calorie targets, cuisine, meal cadence and the weekly budget → free users receive `FORBIDDEN`. Units and currency are **not** personalisation depth: they save through the free `preferences.setDisplayPreferences` (P2-6, audit F-DASH-3-2).
- The Preferences page shows free users the editable safety section plus a locked-targets upgrade panel; the Onboarding wizard branches — free: 3 steps (safety → optional goal → optional body metrics, stored via `preferences.saveProfileBasics` with the premium pitch as a card under step 3), premium: 4 steps (goal → metrics → diet → cuisine). Both platforms start the wizard from the user's saved preferences (`preferences.get`), and `preferences.setup` never shrinks the safety lists, so re-opening onboarding after an upgrade can't erase allergies (audit F-ONB-1-1, 2026-09-25).
- **Numbers you can trust** (audit P1-1, 2026-09-26): free curated weeks are planned toward the user's calorie and protein targets, and every slot gets a **portion** (0.75×–2× of the recipe, deterministic, zero AI) so each day lands within ±10% of the calorie target — a 2,800–3,200 kcal gain goal is reachable now — with protein as close as the dishes allow (snacks added when the portioned mains still fall short). Plan cards show "1½× portion" and its kcal; day totals, the shopping list, the plan cost and the dashboard all count the portion; recipe detail and cook mode opened from the plan start at it, cook mode's "Made it!" and the tracker log it. When even 2× can't reach the protein target the day says **"Protein short by N g — add a snack"** instead of passing as on target (web + mobile). The dashboard no longer claims a meal "supports your daily nutrition goals" (F-PM-4). Premium AI plans get the protein/carbs/fat targets in the prompt, macro drift counts in the retry, and AI recipes whose stated calories don't match their ingredients are resized so the recipe delivers what it claims (bounded 0.6–1.8×; beyond that the honest computed numbers are shown).
- **Pool exhaustion is the upsell**: when the curated pool keeps fewer than `MIN_SAFE_POOL_SIZE` safe recipes for any plan meal type, `mealPlan.generate` / free swap throw `PRECONDITION_FAILED` and the meal-plan page renders a contextual upgrade prompt ("not enough free recipes matching your restrictions") instead of an error.

---

## 10. Dashboard Summary Flow

`dashboard.summary` (protected) assembles the daily overview in `DashboardService.getSummary`. Web and mobile send `{ localDate, localHour }` (the device's own day and hour, via `localDateStr` in `@chefer/utils`), so "today", the day label and the next meal follow the user's time zone; older clients without it fall back to server time (audit F-DASH-1-1). The tracker likewise sends the local calendar day, never the UTC one (F-TRK-1-1).

The "Today" card's ring shows what was **eaten** (the day's DailyLog totals: `nutrition.eatenKcal` and `protein/carbs/fat.eaten`, additive fields) against the target, with the plan as a caption ("1,870 planned · 1,200 left"); the chip judges the plan ("Plan on track / under / over target", shared `planStatus` in `@chefer/utils`). It used to show planned food only — "540 remaining" with 6,070 kcal logged (audit F-DASH-1-2).

```
dashboard.summary
  ├─ load ChefProfile + active MealPlan + recent favourites (parallel)
  ├─ join all recipe IDs across the plan's days
  ├─ load today's DailyLog (eaten totals + loggedMeals)
  ├─ nextMeal: resolveTodayMeals (@chefer/utils), by MEAL TYPE
  │    ├─ skips slots already EATEN today (audit F-PM-10): the same recipe
  │    │  was logged (Made it!, tracker, Today's "I ate this" — any meal
  │    │  type), or a custom scan/quick-add was logged for that meal type
  │    │  (not snacks: web quick-adds always land as "snack")
  │    └─ then the first meal type present in today's plan whose window is
  │       still open — MEAL_WINDOW_END: breakfast <10, lunch <14, snack <17,
  │       dinner <21. A 3-meal plan therefore surfaces dinner from 14:00
  │       (its snack window doesn't exist), a 4-meal plan surfaces the
  │       snack first.
  ├─ restOfToday: today's uneaten meals whose type sorts after nextMeal
  ├─ tomorrowFirstMeal: set when nothing is left today — every window has
  │    passed (late evening) or the rest is eaten — the first meal of day
  │    (today+1) % 7, so the hero renders a "Tomorrow" card instead of
  │    going blank or re-offering a meal already eaten
  └─ nutrition: planned kcal/macros for today vs targets
       └─ lifters only (P2-4): trainingDay + adjustedTargets (see below)
```

### Today (P2-2) — Home + Tracker in one tab

The food tab bar is **Today · Plan · Shop · Cookbook · More** on web below `lg`
and on mobile; the desktop sidebar lists the same four, a divider, then More's
items (Progress, My weeks, Profile, Preferences). Today (web `/dashboard`,
mobile `(food)/index`) shows:

```
Today
  ├─ ring: nutrition.eatenKcal against the target + macros (dashboard.summary —
  │    uses nutrition.adjustedTargets on a training day, P2-4, so server-side
  │    target changes flow straight through)
  ├─ quick log: Quick add (free, tracker.logCustomMeal) + Scan a meal
  │    (premium; free sees the demo ghost) — both refresh dashboard.summary
  ├─ next meal (nextMeal, else tomorrowFirstMeal badged "Tomorrow"):
  │    ├─ "I ate this" → tracker.logRecipe { date: local day, recipeId,
  │    │    mealType, portionMultiplier: the plan slot's portion (P1-1
  │    │    nextMeal.portion, clamped 0.5–2×; 1 when unset) } (atomic, idempotent; a premium
  │    │    log may rebalance the week) → summary refetch → the spotlight
  │    │    advances past the logged meal (resolveTodayMeals)
  │    └─ "Cook it" → cook mode (?meal=type); "Made it!" there logs too
  ├─ later today: restOfToday (uneaten meals after the spotlight)
  └─ "See full day" → /tracker (portions, past days, un-logging); the
       Tracker is no longer under More (F-PM-7) and lights the Today tab
```

The web hero card (`/dashboard`) renders `nextMeal`, else `tomorrowFirstMeal`
(badged "Tomorrow", CTA "View recipe"), else the "all caught up" empty state.

### Cookbook, Shop, My weeks (P2-8)

- **Cookbook** (was Recipes): All (past-plan recipes) / Saved / My Recipes /
  **Discover**. Discover calls `recipe.discover` — the curated pool filtered by
  the owner's and household members' allergies and restrictions, with meal-type
  chips, a "≤ 30 min" toggle and search. Every tier, no AI; results open, save
  and cook like any recipe.
- **Shop**: "To buy" (the shopping list) / "In my kitchen" (the pantry). See §18
  for the inline "Still have these?" banner.
- **My weeks**: saved weeks + past weeks (see §9 "Week templates").
- **Ingredients** left the nav; `/ingredients` still works by URL.

### 10.1 Training-aware nutrition (audit P2-4)

Connects the gym to the food side with deterministic rules (no AI call).
The pure maths lives in `@chefer/utils` (`training-nutrition.ts`); the gym
reads live in `trainingNutritionService` (API).

**Who is a lifter:** a set-up gym profile (`GymProfile.setupCompletedAt`),
a goal, and a known bodyweight (latest `WeightEntry`, else
`ChefProfile.weightKg`). Every goal has a g/kg protein base (follow-up,
2026-09-26); only `GAIN_MUSCLE` lifters get the training-day rules.

| Rule              | Value                                                                                                                                                                                                          | Tier                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Base protein      | by goal: **GAIN_MUSCLE 1.8 g/kg**, **LOSE_WEIGHT 2.0 g/kg** (keeps muscle in a deficit), **MAINTAIN / EAT_HEALTHIER 1.6 g/kg** — replaces the goal's % split; carbs absorb the difference so kcal is unchanged | every tier — `resolveDailyTargets(profile, lifterBodyweightKg)` in dashboard, tracker, chat context, coach review and both generation paths |
| Training day      | a workout **completed** that day (any day), else a routine day **planned** for that weekday outside a training pause                                                                                           | —                                                                                                                                           |
| Training-day bump | GAIN_MUSCLE only (a cut keeps its deficit): protein to **2.2 g/kg** (+0.4 g/kg), kcal **+10%** of the base (rounded to 10, clamped 150–300); kcal not covered by protein → carbs; fat unchanged                | **premium** applies it; **free** sees the same numbers locked (upgrade source `training-day`)                                               |
| Post-workout meal | **~0.4 g/kg** protein, rounded to 5 g, 20–45 g (30 g without a bodyweight)                                                                                                                                     | every tier                                                                                                                                  |
| Premium AI week   | the routine's training weekdays + the bump go into the generation prompt (`buildTrainingDaysSection`), and the ±15%/±20% validation judges those days against the bumped targets                               | premium                                                                                                                                     |
| Free curated week | training weekdays weigh the protein shortfall double in `planCuratedWeek`, so those days pick the higher-protein combinations (usually dinner); no kcal bump                                                   | free                                                                                                                                        |

```
dashboard.summary / tracker.getDay (lifter)
  └─ trainingNutritionService.targetsForDay(profile, day, premium)
  ├─ loadLifter → lifterBodyweightKg
  ├─ resolveDailyTargets(profile, bw) → base targets (protein g/kg by goal)
  │    — the existing nutrition fields keep carrying the BASE targets,
  │      so shipped clients see no change in meaning
  ├─ GAIN_MUSCLE only: trainingDayFor(localDate, weekday)
  │    → COMPLETED | SCHEDULED | rest
  └─ trainingDay { isTrainingDay, reason, workoutName,
       kcalBonus, proteinBonus, applied, basis }            (optional)
     adjustedTargets { dailyCalorieTarget, proteinG,
       carbsG, fatG }         (optional — premium AND training day)
     (under `nutrition.` on the dashboard, top level on getDay)
```

**Clients (web + mobile, same copy):** the Today nutrition card shows
"Training day · +250 kcal, +32 g protein". Premium: the ring and macro bars
use `adjustedTargets`, with "Full Body A today · protein at 2.2 g/kg, added
to today". Free: the line is locked ("Premium adds this to today's targets")
with the upgrade button (web) or "Upgrade from your Profile →" (mobile).
Rest days and non-lifters show nothing new.

**Tracker (web `/tracker`, mobile `tracker`):** the same line in the day's
progress card, from `tracker.getDay`'s `trainingDay` / `adjustedTargets`, so
the tracker bars match Today's ring. On another day the copy says "this day"
("Full Body A planned · …, added to this day"; "Premium adds this to this
day's targets"); a past day with a finished workout counts too.

**Preferences macro preview (web + mobile):** `preferences.computeTargets`
applies the same rule, so a lifter's preview shows the protein the dashboard
will show, with "Protein set from your bodyweight (1.8 g/kg) because you
train." under it (`lifterProteinNote`). Web replaces its instant local
estimate with the server numbers once they arrive; mobile adds a protein line
under the calorie estimate in Goal & body for lifters only.

**Coach weekly review (§14):** lifters are judged against their g/kg protein
target — one line with the week's average ("Protein averaged 120 g a day, 24
g short of your 144 g lifting target (1.8 g per kg) — …"). Non-lifters get no
protein line.

**Workout summary (web + mobile, every tier):** a refuel card — "Aim for ~30 g
protein in your next meal" — linking the next planned meal (from
`dashboard.summary`, recipe page) or, offline / without a plan, the tracker's
quick add.

---

## 11. Password Reset Flow

> Added 2026-08-21 (roadmap P0-6). Email goes through `IEmailService`
> (`apps/api/src/lib/email`), chosen by `EMAIL_PROVIDER`: a console-logging
> mock (default — the logged link is the local testing workflow), Resend, or
> SMTP (a Gmail account + App Password, 2026-09-26). Reset and confirmation
> emails always have priority: the daily cap (`EMAIL_DAILY_CAP`) never
> blocks them, and weekly emails stop 50 sends short of it to leave them room.

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
       ├─ confirm the address (emailVerified) if it wasn't yet — the user
       │   just proved they read that inbox (P2-5, §23)
       └─ delete ALL of the user's sessions — every device signs out
```

**Mobile (audit P1-7, 2026-09-26):** the app has the same two screens —
`(auth)/forgot-password` (from "Forgot password?" on Sign in) and
`(auth)/reset-password`. The emailed link still points at the **web** page
(it works in any phone browser, app installed or not); the in-app reset
screen opens from the deep link `chefer://reset-password?token=…`
(`chefer-dev://` in dev builds). Like web, it has no manual token entry —
without a token it offers "Request a new reset link". Both screens are
signed-out routes (the root layout's `Stack.Protected` guard), so a signed-in
user following the deep link does not get the reset screen; the web page is
the path for them. After a reset the app returns to Sign in (every session, including
other phones, was deleted).

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

Mobile (`apps/mobile/app/cook/[id].tsx`) has the same finish: "Log this meal"
→ `tracker.logRecipe`, then the rebalance banner (if the log triggered one)
and the `StarRating` card (`src/features/recipes/star-rating.tsx` — 44pt stars
labelled "Rate N stars", "who liked it" household chips, notes; helpers
shared via `@chefer/utils` `rating.ts`). Mobile recipe detail shows the same
card when opened from a Plan-tab day (`day` param), mirroring web's
`?day=` gate.

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
       │    ├─ swapMeal(dayOfWeek, mealType, occurrence?) → MealPlanService.swapRecipe
       │    │    (occurrence 2 = the day's second snack → slotIndex; omitted = first)
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
  │         │    adherence = logged days / 7; avg kcal (and protein) over
  │         │    logged days;
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
  │         ├─ targets: resolveDailyTargets(profile, lifter bodyweight) —
  │         │    lifters (§10.1) get a protein line vs their g/kg target
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
  `tracker.deleteWeight`): both platforms list them on Progress (web
  /progress, mobile `progress` — linked from the card's "See progress" and
  from More); mobile can also expand them inside the dashboard card.
- Progress (web + mobile): 28-day calories vs target and macro breakdown
  (`tracker.monthlySummary`), 90-day weight chart (`tracker.weightHistory`)
  with current weight and change. The change is coloured by goal via the
  shared `weightChangeTone` (`@chefer/utils`): gaining is green for
  GAIN_MUSCLE, losing is green for LOSE_WEIGHT, other goals stay neutral
  (audit F-TRK-4-1). Reads ignore
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

**One entry per plan slot** (follow-up, 2026-09-26). A curated day can hold two
identical snacks; entries used to be matched by recipe + meal type, so ticking
one ticked both. `tracker.getDay` now gives each planned meal its `slotIndex`
(its index in the plan day's `meals`), the tracker (web + mobile) keys rows by
it and sends it back on each ticked entry, and Today's "I ate this" passes
`dashboard.summary.nextMeal.slotIndex` to `tracker.logRecipe`. Matching is
`matchLoggedToSlots` in `@chefer/utils` (tracker, and `resolveTodayMeals` for
Today): an entry with a `slotIndex` claims that slot while it still holds the
entry's recipe; any other entry claims the first unclaimed slot with its
recipe (and type) — so an older entry without one ticks one snack, not both.
`logRecipe` with a `slotIndex` replaces only that slot's entry; without one
(cook mode, shipped apps) it keeps the recipe + meal type rule. No schema
change: `slotIndex` is an optional field of the `loggedMeals` JSON.

### Free-tier honesty tools

- **Quick add** (tracker): name + kcal only → `tracker.logCustomMeal`
  (`estimatedBy: 'manual'`, mealType snack). Free for every account.
  Mobile (`src/features/tracker/quick-add-sheet.tsx`, "Quick add" button on
  the tracker, any non-future day) also lets the user pick the meal slot and
  optional protein/carbs/fat; inline validation mirrors the API bounds via the
  shared `parseQuickAdd` (`@chefer/utils`), API errors show in the sheet, and
  the day's `tracker.getDay` is invalidated on success.
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
(`features/tracker/lib/rebalance-storage.ts`), MERGED with any still-pending
swaps (`@chefer/utils` `mergePendingRebalance` — a second rebalance used to
erase the first one's undo, F-TRK-3-2). The banner ("I adjusted Thursday
dinner to keep your week on track") shows where the log happened (tracker,
cook-mode finish) and on the meal-plan page, with one-tap
**undo**, which replays `mealPlan.replaceRecipe(previousRecipeId)` per swap.
Undo is per-device and expires after 24 h — nothing about the swap pairs is
stored server-side (wave-0 schema freeze). Analytics: `week_rebalanced` fires
on the client when a log's response carries an applied rebalance. Failures in
the rebalance path never fail the log save itself.

**Mobile** (P1-7, 2026-09-26): every logging surface (tracker Save Day, quick
add, photo scan, cook-mode log) feeds the response's `rebalance` into
`src/features/tracker/rebalance-store.ts`, persisted in the app's SQLite KV.
The store **merges** a new rebalance into the pending one
(`mergePendingRebalance` in `@chefer/utils`: one entry per slot, a slot
swapped twice keeps its original recipe for undo, a slot swapped back drops
out; another plan or a stale hand-off is replaced) — so a second rebalance no
longer destroys the first one's undo (audit F-TRK-3-2). The banner with Undo
/ Dismiss renders **where the log happened** (tracker, cook-mode finish) and
on the Plan tab (filtered to the displayed plan). Web still overwrites and
shows the banner only on the meal-plan page — reverse row in
`mobile_parity_backlog.md`.

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
  │    swaps, servings rescaled to the household portion sum (P2-3); the
  │    allergy set is the household union (members included)
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

**"Feed the Whole Table"** (premium_plan.md W2-D; reworked by backlog P2-3):
the account owner adds the people they cook for — partner, kids, the flatmate
with the nut allergy — and every week is safe for all of them. **Member safety
is free on every tier; portion scaling is premium.** The household is the one
people model: there is no separate "cooking for N" setting any more (F-PM-8).

```
Entry points (≤ 2 taps from Profile / "You", PM review §5)
  ├─ web: Profile → "Your household" card → /preferences#household
  │        (the Preferences header also links straight to the section)
  ├─ mobile: Profile → "Household" row → /household (also More → Household)
  └─ onboarding: intent "Feed my household" → "Who's at your table?" step

Members (household.* — protected, EVERY tier, cap householdMembers = 5)
  ├─ household.list — member chips with per-member safety summary
  ├─ household.add — { name, portionFactor 0.25–3 (0.5 kid … 1.5 big eater),
  │    isKid, allergies[], dietaryRestrictions[], dislikedIngredients[] }
  │    count + insert in one SERIALIZABLE transaction (F-ONB-3-1: parallel
  │    adds can no longer pass the cap); `household_member_added` on save
  ├─ household.update / household.remove — ownership-scoped; removing asks
  │    to confirm first (F-ONB-3-2)
  └─ quick chips on an empty household: "+ add your partner" / "+ add a kid"
       ├─ premium: open the editor pre-filled (kid = ½ portion, isKid)
       └─ free: the §6.4 ghost reflects the chip tapped (F-PM-12) — the kid
            chip shows a sample kid at ½ portion with a peanut allergy, the
            partner chip a vegetarian adult — then offers "Add a kid" (free,
            pre-filled editor) and the premium scaling upsell. Mobile
            (Household screen): the same ghost sits above the inline add form,
            which the chip pre-fills; members edit in place under their row
            (pencil → "Save changes" = household.update), every tier
            (`upgrade_prompt_shown {source: 'household'}`,
            `teaser_engaged {feature: 'household'}`)

Legacy "cooking for N" (DietaryPreferences.servingSize > 1)
  └─ converted ONCE into N−1 "Person 2…N" placeholder members (only when the
       user has none) and reset to 1 — at API boot (backfill), when an older
       app build writes servingSize through preferences.setup/updateTargets,
       and lazily on household.list / mealPlan.generate. Idempotent: the
       conditional reset is the claim. preferences.get still returns
       servingSize, derived from the household (≤ 6), for builds in the stores.

SAFETY — every tier (members' allergies + restrictions ∪ the owner's)
  ├─ free curated generation + curated swaps: loadMergedSafety →
  │    safeCuratedPools(union) — the same filterSafeRecipes
  ├─ premium AI generation + AI swaps: householdContext.mergedSafety on the
  │    prompt AND the post-generation safety pass
  ├─ allergen warnings (plan cards, recipe page, cook mode): allergenWarnings
  │    are computed against the union
  └─ recipe import (premium): the Cheferize preferences and the fail-closed
       save check use the union too

SCALING — premium only (`householdPlans`)
  ├─ generation: servings = householdPortionSum = ceil(1 + Σ portionFactor)
  │    (householdContext.portionSum → prompt "servings=N", MealPlanInput
  │    .servingSize); the legacy setting is never read. Imports adapt to the
  │    same number.
  ├─ shopping list (derived AND the AI-consolidation input): every recipe's
  │    ingredients × portions / recipe.servings — a single-portion curated
  │    week ×portions, a recipe already generated for the table ×1 — and the
  │    list reports `portions`
  ├─ plan week cost: estimatedCost scaled the same way (chip = list total),
  │    with `portions`
  └─ recipe page + cook mode default to the table's servings, × the plan
       slot's portion when opened from the plan (shared
       `defaultCookServings`; mobile cook mode's ingredient list has the
       servings stepper)
FREE households: lists, costs and recipe pages stay as written (single
portion for curated plans) and say so ("sized for 1 portion — Premium scales
it for your table"). Per-person cost is ALWAYS total ÷ the portions the list
was sized for (perPortionCost), never a single-portion total ÷ head count
(F-PM-5).

Ratings: optional "who liked it" member chips on the star widget → stored as
a "Liked by: Maria, Tom" line inside MealRating.notes.
```

**Downgrade semantics:** nothing is deleted and nothing about members changes
— they stay fully editable on free, and their safety keeps applying. Only the
scaling stops (lists go back to recipes as written).

**Post-upgrade activation (web + mobile):** the "You're premium" sheet orders its steps
by the upgrade `source` and hides what is already done (F-PREM-1-5, F-PM-9):
source `household` → "Add your table" first (web → /preferences#household,
mobile → the Household screen); users who already have a profile never see
"Set your goal" or a link to onboarding. Ordering and copy are shared
(`activationStepKeys`, `ACTIVATION_STEP_COPY`, `SOURCE_FEATURE_PRIORITY` in
@chefer/utils). Mobile: upsells open Profile with `?source=` (household,
pantry, chat-locked, training-day); a successful Upgrade there opens the sheet.

**Events:** `household_member_added`, `upgrade_prompt_shown {source:
'household'}`, `teaser_engaged {feature: 'household'}`, `onboarding_intent
{intent}` (see docs/analytics-funnel.md).

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
  └─ PantryService.seedFromPurchases: each checked item's name/qty/unit —
       the quantity the list shows (slot portions + premium household
       scale), not one recipe's base quantity →
       upsert PantryItem (source PURCHASE, name normalized,
       @@unique(userId, ingredientName, unit) collapses re-buys)
       ├─ STAPLES DENYLIST: salt, pepper, oil/vinegar/salt families, water,
       │    sugar, dried spices… are NEVER tracked
       └─ unchecking does NOT remove — you bought it last week, you have it

DEPLETION v1 (premium)
pantry.confirmWeekly { clearIds }                        (premium)
  ├─ asked by the inline "Still have these?" banner (PantryCheckBanner on
  │    web, pantry-check-banner on mobile) at the top of Shop — never a sheet
  │    over the list (audit F-PM-13): at most once a week (answered or "Not
  │    now" both count; web localStorage / mobile KV key = local Monday), and
  │    only about items ≥ 3 days old (pantryItemsToConfirm, @chefer/utils);
  │    also by hand from "Still have these?" on Shop → In my kitchen
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
this list (web + mobile; on mobile also on Shop → "In my kitchen", where it
replaces the static upsell once the kitchen has items). Shop → "In my kitchen" (web `/shopping-list?view=kitchen`, which
`/pantry` redirects to; mobile Shop tab segment) is visible read-only with the upsell. Events:
`upgrade_prompt_shown {source: pantry}` (impression), `teaser_engaged {feature:
pantry}`, `pantry_confirmed`, `plan_used_pantry {itemCount}`.

---

## 19. Beta Feedback Flow

Any signed-in user can send free-text feedback from the sidebar (desktop) or the
More drawer (mobile web): "Send feedback" opens a Sheet with one labelled textarea;
the native app has the same field as a card on the More tab. Both cap it at the
API's 2,000 characters with a live counter ("123 / 2,000", amber in the last 100,
"Limit reached: 2,000 characters") — shared `feedbackCounter` in @chefer/utils
(F-PROF-2-2).

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
  Web renders the summary in place and only rewrites the URL (history.replaceState), so
  finishing with no connection shows the summary, not the browser's error page (F-GYM-5-1)
  Live PR badges and the summary's PRs compare against recent sessions AND the bootstrap's
  `olderBests` (all-time), so an old best is never re-celebrated (F-GYM-6-1)
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

---

## 23. Weekly Emails & Notifications Flow (P2-5)

> Added 2026-09-26 (audit backlog P2-5; F-PM-14, F-PLAN-4-3, PM review §7 #9).
> The outbound retention channel, for **both tiers**: Monday "your week is
> ready" and a Sunday recap, by email and (opt-in) as phone notifications.

### Email

```
Sunday ≥ 08:00 UTC  WeeklyPlanWorker builds next week (premium: AI, learned;
                    free: curated) — §9
Monday ≥ 07:00 UTC  WeeklyEmailWorker → WeeklyEmailService.sendWeekReady
Sunday ≥ 17:00 UTC  WeeklyEmailWorker → WeeklyEmailService.sendWeeklyRecap
  (hourly tick; fixed UTC hours because no per-user time zone is stored —
   08:00/09:00 and 18:00/19:00 in Central Europe)

recipients = users with a CONFIRMED address (emailVerified)
             AND the email's switch on (weeklyEmailReady / weeklyEmailRecap)
             AND no EmailSend row for (kind, this week)
for each:
  build → nothing to say?  skip (no plan this week / an empty recap week)
        → claimSend (insert EmailSend; @@unique → a second tick or a restart
          loses the claim and sends nothing)
        → send (EMAIL_PROVIDER: Gmail SMTP / Resend; console mock in dev)
            └─ failure → release the claim, the next tick retries
  daily cap (EMAIL_DAILY_CAP, 400 for Gmail): budget = cap − 50 − sends in
  the last 24h. Budget spent, or the provider says "sending limit" →
  stop BEFORE the next claim (a failed user's claim is released); the rest
  go out on later hourly ticks, for up to 48h (a capped Sunday recap
  finishes Monday for the week that ended).
```

- **Monday** lists one dinner per day, the shopping-list estimate in the
  user's currency (`formatMoney`) and where the week came from: premium
  Sunday week "planned around your targets and the N dishes you rated", free
  Sunday week "a fresh week of recipes … fit your allergies and daily
  targets" (plus one quiet premium line), a followed template, or the user's
  own week. Links: the plan and the shopping list.
- **Sunday** recaps meals logged, days within ±10% of the calorie target,
  weight vs the previous weigh-in (in the user's units), completed workouts
  (Gym users only) and next week's planned dinners. Premium: a pointer to the
  chef review on Progress; free with ≥ 3 logged days: one line on what the
  review adds. Never guilt copy — a quiet week gets an encouraging line.
- Every weekly email has an unsubscribe link and a `List-Unsubscribe` header.

### Confirmation, opt-out, account deletion

```
signup (auth.register) ─► confirmation email: APP_URL/verify-email?token=…
                          (signed, 7 days, bound to the address)
Preferences "Send confirmation link" ─► notifications.resendConfirmation (3/h)
/verify-email ─► notifications.confirmEmail { token } ─► emailVerified = now
password reset completed ─► emailVerified = now (if unset)

email "Unsubscribe" ─► /unsubscribe?token=… (public, no login)
   └─ the page calls notifications.unsubscribe { token } from the browser
      (so link-prefetching mail scanners can't unsubscribe anyone)
      → flips the Monday, Sunday or both switches; "Undo" re-subscribes
Preferences (web + mobile) ─► notifications.setEmailPreferences
```

Deleting the account hard-deletes the user (cascade), so there is nobody left
to email. Accounts created before P2-5 are unconfirmed: they see the
"Confirm your email" prompt in Preferences and get nothing until they confirm.

### Phone notifications (mobile)

Local repeating notifications — no push tokens, no server state:

```
Preferences → Weekly updates → "On this phone" switch
  on:  ensureGymReminderPermission() (asked HERE, never on launch)
       ├─ denied → "Turn them on in your phone's Settings", stays off
       └─ granted → schedule two WEEKLY notifications (data.app = weekly-digest)
            Monday 08:00 local  "Your week is ready"   → /meal-plan
            Sunday 18:00 local  "Your week in review"  → /progress
  off: cancel the weekly-digest notifications (gym reminders untouched)
  state = whether they are scheduled (nothing else is stored)

tap → useNotificationLinks (root layout, signed in only) → router.push(url)
      (cold start: the launch response, deferred until the Stack mounts)
```

Off by default; unlike email they use the phone's own time zone.

### Manual trigger (ops / live verification)

No API procedure. From `apps/api`:

```
pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts ready  [--user=a@b.c] [--dry-run]
pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts recap  [--user=a@b.c] [--dry-run]
```

Runs one sweep now regardless of day and hour; opt-outs, confirmation and the
per-week claims still apply (delete the `email_sends` row to resend).
`--dry-run` prints the rendered text without claiming or sending.
