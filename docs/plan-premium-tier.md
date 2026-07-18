# Implementation Plan — Premium User Tier

Status: **implemented** · Scope: FREE vs PREMIUM user tiers; AI features and profile
personalisation gated behind premium; curated generic recipe pool for free users.

## Product rules

| Capability                                                      | FREE                                                                          | PREMIUM                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| Generate weekly plan                                            | Random selection from curated generic recipe pool (no AI, no personalisation) | AI-generated, personalised (Gemini) |
| Swap a meal                                                     | Random curated recipe of the same meal type (no AI)                           | AI-generated alternative            |
| Preferences / profile setup (goals, body metrics, dietary data) | Locked — shows "Upgrade plan" CTA                                             | Full access                         |
| Recipe images                                                   | Curated recipes ship with preset stock URLs (instant)                         | AI pipeline (Pollinations worker)   |

- Admins are treated as premium.
- "Upgrade plan" is a demo flow: one click flips the tier in the DB (no payment
  integration — Stripe is a later phase, see `.env` placeholders).

## Schema (`packages/database/prisma/schema.prisma`)

- `enum PlanTier { FREE PREMIUM }`
- `User.planTier PlanTier @default(FREE)`
- `enum RecipeSource { AI MANUAL CURATED }` — add `CURATED`
- (From the perf plan: `Recipe.imagePriority Int @default(100)`)
- Apply with `pnpm db:push` + `pnpm db:generate` (dev flow).

## Backend

### Types & auth context

- `packages/types/src/index.ts`: `UserProfile` gains `planTier: 'FREE' | 'PREMIUM'`.
- `apps/api/src/interfaces/http/middleware/auth.middleware.ts`: select + map `planTier`
  when resolving the session user.
- `apps/api/src/lib/trpc.ts`: new `premiumProcedure` (middleware: authenticated AND
  (`planTier === 'PREMIUM'` OR `role === 'ADMIN'`), else `FORBIDDEN` with an
  upgrade-oriented message). Follows the "auth middleware, not router guards" rule.
- `UserService`/`UserDto`: include `planTier` so `user.me` exposes it to the web app.

### Curated recipe pool

- New `apps/api/src/lib/curated-recipes/curated-recipes.fixture.ts`: ~20 generic
  recipes with fixed IDs (`curated-b-*`, `curated-l-*`, `curated-d-*`), grouped by
  meal type, built from the existing week-plan + swap fixtures (they already have
  balanced macros and stable Unsplash image URLs).
- `ensureCuratedRecipes()` (same lib): idempotent upsert of the pool with
  `source: CURATED`, `imageStatus: DONE`, preset `imageUrl`. Called lazily on first
  free-tier generate (no separate seed run needed; safe on existing dev DBs).

### Meal plan service (`apps/api/src/application/meal-plan/meal-plan.service.ts`)

- `generate(userId, weekOffset, planTier)`:
  - **PREMIUM/ADMIN** → existing AI path (requires chef profile, logs `MEAL_PLAN` call).
  - **FREE** → `generateCurated()`: ensure pool, then for each of 7 days pick a random
    breakfast/lunch/dinner from the pool (shuffled cycling so a day never repeats a
    recipe and the week has variety). No chef-profile requirement, no AI call, no
    AI-call log, images instantly DONE.
- `swapRecipe(...)`: FREE picks a random curated recipe of the same meal type
  (excluding the current one); PREMIUM keeps the AI path.
- Routers pass `ctx.user.planTier` / role; `generate` and `swapRecipe` stay
  `protectedProcedure` (both tiers may call them — behaviour branches in the service,
  which is business logic, not access control).

### Gated procedures

- `preferences.setup` and `preferences.update` move to `premiumProcedure`.
- `preferences.get` / `hasProfile` / `computeTargets` stay `protectedProcedure`
  (read-only; needed to render the locked page state).

### Upgrade mutation

- `user.upgradePlan` (`protectedProcedure`, no input): sets `planTier: PREMIUM` for
  `ctx.user.id`, returns the updated user. (Downgrade for testing is done via SQL —
  deliberately no API surface.)

## Frontend (`apps/web`)

- **Plan awareness:** `trpc.user.me` now returns `planTier`. A small
  `useIsPremium()` helper (ADMIN counts as premium) in `src/hooks/`.
- **UpgradeButton / UpgradeCard** (new, `src/features/premium/components/`):
  amber "Upgrade plan" button → confirmation dialog ("demo upgrade — instantly
  enables AI features") → `user.upgradePlan` → invalidate `user.me` → success state.
- **Sidebar** (`side-bar.tsx`): footer card for free users — "Free plan" +
  Upgrade button. Premium users see a small "Premium" badge instead.
- **Preferences page**: if free — replace the form with a locked panel (lock icon,
  what premium unlocks, UpgradeCard). Onboarding wizard gets the same guard.
- **Meal plan page**:
  - Free: subtle banner under the nav bar — "You're on the free plan: generic
    chef-picked recipes. Upgrade for AI plans tailored to your goals." with button.
  - `GenerateOverlay` copy varies: free → "Picking this week's recipes…";
    premium → existing AI copy.
- **Profile page**: plan badge next to role + UpgradeCard when free.
- **Recipe detail**: swap button label for free users becomes "Swap recipe"
  (it's a random curated pick), premium keeps "AI Swap".

## Docs to update (per CLAUDE.md)

- `infrastructure.md` §6 (User.planTier, PlanTier + RecipeSource enums,
  Recipe.imagePriority), §7 (service branching, worker concurrency, curated lib),
  §8 (user.upgradePlan; premium-gated preferences procedures; generate/swap
  semantics), §9 (premiumProcedure middleware).
- `business_flow.md`: §4 authorization (premium middleware) + new "Premium tier &
  meal plan generation" flow section.

## Seed accounts after change

| Email            | Tier                                        |
| ---------------- | ------------------------------------------- |
| admin@chefer.dev | ADMIN (implicitly premium)                  |
| alice@chefer.dev | FREE (default) — used to test the free path |
| bob@chefer.dev   | FREE (default)                              |

Seed script additionally sets `dan@chefer.dev` unchanged; upgrading is exercised
through the UI.

## Verification (browser)

1. As a FREE user: Generate → instant curated plan, stock photos, no AI usage
   increment; Preferences page shows locked panel; sidebar shows Upgrade.
2. Click Upgrade plan → confirm → badge flips to Premium, preferences unlock.
3. As premium: Regenerate (one real Gemini call) → personalised plan, image
   pipeline improvements from the perf plan observable.
