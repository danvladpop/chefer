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

> **Status:** Schema and types are in place. The registration endpoint and UI are not yet implemented.

**Planned flow:**

```
1. User fills in RegisterForm (email, password, name)
2. Client validates input with Zod (react-hook-form)
3. POST /trpc/user.create (admin) OR a future public register endpoint
4. UserService.create()
    └── Hash password (bcrypt/argon2)
    └── UserRepository.create()
    └── Prisma INSERT into users table
5. Return new User object (without passwordHash)
6. Redirect to /login
```

**Current state:** Admin can create users via `user.create` (admin-only tRPC mutation). A self-service registration route does not yet exist.

---

## 3. User Login Flow

> **Status:** Login form UI exists. The backend auth endpoint is not yet implemented.

**Planned flow:**

```
1. User fills in LoginForm at /(auth)/login
   └── Email + password (react-hook-form + Zod validation)
2. Form submits to POST /api/auth/login (Next.js API route, not yet built)
3. API route calls tRPC or directly validates credentials:
    └── UserRepository.findByEmail(email)
    └── Compare hash (bcrypt.compare)
    └── If match → generate JWT access token + refresh token
4. Set session cookie (chefer_session) or return JWT in response
5. Redirect to /(dashboard)/dashboard
```

**Current state:**

- `LoginForm` component at `apps/web/src/features/auth/components/LoginForm.tsx` submits to `/api/auth/login`
- The route handler and token generation are not yet implemented
- The database schema is NextAuth.js compatible (Account, Session, VerificationToken tables exist)

---

## 4. Session & Authorization Flow

> **Status:** Context scaffolding exists. Full JWT issuance is not yet implemented.

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

| Role              | What they can do                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| (unauthenticated) | `user.getById`                                                                            |
| USER              | All public + `user.me`, `user.update` (own), `user.updateProfile`                         |
| MODERATOR         | Same as USER (moderation capabilities reserved for future)                                |
| ADMIN             | Everything, including `user.list`, `user.create`, `user.delete`, `user.update` (any user) |

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

> **Status:** Post schema exists. Post tRPC router is not yet implemented.

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

### Upgrade flow (demo — no payment integration)

```
"Upgrade plan" button (sidebar / meal-plan banner / preferences / profile)
  → confirmation dialog
  → user.upgradePlan mutation (protected)
  → planTier = PREMIUM
  → user.me invalidated → UI unlocks instantly
```

### Weekly plan generation

`mealPlan.generate` is available to both tiers — the behaviour branches in `MealPlanService`:

```
mealPlan.generate { weekOffset }
  │
  ├─ FREE user
  │    ├─ ensureCuratedRecipes()          (idempotent upsert of curated pool)
  │    ├─ random breakfast/lunch/dinner per day (shuffled cycling, 7 days)
  │    ├─ no AI call, no chef profile required, preferences ignored
  │    └─ recipes ship with preset stock images (imageStatus DONE) → instant board
  │
  └─ PREMIUM user (or ADMIN)
       ├─ load ChefProfile + DietaryPreferences (profile required)
       ├─ calorie + macro targets from resolveDailyTargets()
       │   (preferences.service — THE single source: live Mifflin-St Jeor
       │   TDEE ± goal adjustment when metrics are complete, else the stored
       │   snapshot. The dashboard ring and tracker read the same resolver,
       │   so a goal change moves all three together.)
       ├─ IAIService.generateMealPlan (Gemini) → 21 personalised recipes
       ├─ image reuse: recipes whose name matches a previously generated
       │   DONE image are marked DONE immediately
       ├─ remaining recipes upserted as PENDING with imagePriority
       │   (0 = today) → RecipeImageWorker.wake()
       └─ worker generates up to 5 images in parallel (Pollinations),
           streaming DONE events to the client over SSE
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

IngredientPriceWorker (background)
  +- start + every 12 h: distinct ingredient names from ALL recipes
  +- prices missing entries, refreshes entries older than 7 days
  +- IAIService.estimateIngredientPrices (Gemini, batches of 40)
```

### Profile personalisation gating

- `preferences.setup` / `preferences.update` use `premiumProcedure` → free users receive `FORBIDDEN` ("This feature requires a premium plan…").
- The Preferences page and Onboarding wizard render an upgrade panel instead of the form for free users.

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
