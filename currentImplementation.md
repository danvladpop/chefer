# Chefer — Current Implementation

**Last updated:** T-024, T-026, T-023B · History, Ratings, Smart Shopping List Redesign
**Phase:** 3 — Power Features (T-021–T-026 + T-023B complete)

---

## What's Been Built

| Task   | Name                                               | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | -------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001  | Health Check & Env Setup                           | ✅ Done | `GET /api/health` at port 3001; AI env vars added; root `.env.example` created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| T-002  | Chef Profile Schema                                | ✅ Done | `chef_profiles` table + `ActivityLevel`/`Goal` enums; `ChefProfileRepository` exported from `@chefer/database`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| T-003  | Authentication – Register & Login                  | ✅ Done | `auth.register` + `auth.login` + `auth.logout` + `auth.me` tRPC procedures; `chefer_session` cookie; bcrypt password hashing; register page at `/register`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T-004  | Core Layout & Navigation Shell                     | ✅ Done | Next.js `middleware.ts` protects all dashboard routes; `NavBar` component with logo, nav links, avatar/sign-out dropdown; `(dashboard)` route group layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T-005  | Landing Page (Unauthenticated)                     | ✅ Done | `app/page.tsx` — hero with CTA → `/register`, 3-column features (Weekly AI Meal Plans, Personalized Goals, Smart Shopping Lists), footer; server-side cookie check redirects authenticated users to `/dashboard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T-006  | Sign Up & Login Pages                              | ✅ Done | Register success now redirects to `/onboarding`; both `/login` and `/register` pages do server-side cookie check and redirect authenticated users to `/dashboard`; branding updated to Chefer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T-007  | Database Schema – Dietary Preferences              | ✅ Done | `dietary_preferences` table with `cuisinePreferences`, `dietaryRestrictions`, `allergies`, `dislikedIngredients` (`String[]`), `mealsPerDay` (default 3), `servingSize` (default 1); `DietaryPreferencesRepository` exported from `@chefer/database`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T-008  | Onboarding Wizard – Step 1: Goals                  | ✅ Done | `/onboarding` page at `(dashboard)/onboarding/page.tsx`; 4-step wizard shell with progress bar; Step 1 goal selector (Lose Weight / Maintain / Gain Muscle / Eat Healthier) with icon cards; Continue disabled until selection; steps 2–4 are placeholders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T-009  | Onboarding Wizard – Step 2: Body Metrics           | ✅ Done | Age input; height with cm/ft+in toggle (converts on switch); weight with kg/lbs toggle (converts on switch); activity level radio group (5 options); live Mifflin-St Jeor calorie estimate updates on every keystroke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T-010  | Onboarding Wizard – Step 3: Diet & Restrictions    | ✅ Done | Multi-select diet type toggle buttons (8 options); freeform allergy chip input (Enter/comma to tokenize, × to dismiss, Backspace to remove last); preset disliked ingredients multi-select (10 presets) + free-text add with Add button; all fields optional so Continue is always enabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T-011  | Onboarding Wizard – Step 4: Cuisine & Meal Cadence | ✅ Done | Multi-select cuisine preferences (12 options); meals per day (2–5) pill toggle (default 3); serving size (1–6) pill toggle (default 1); Finish calls `trpc.preferences.setup` mutation which upserts ChefProfile + DietaryPreferences in a Prisma `$transaction`; redirect to `/dashboard` on success; `/onboarding` page is now a server component that calls `preferences.hasProfile` and redirects returning users                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T-012  | tRPC – Preferences CRUD Procedures                 | ✅ Done | `preferences.get` query returns `{ chefProfile, dietaryPreferences }`; `preferences.update` mutation accepts `.partial()` of setup schema, merges + recomputes calorie target, runs in `$transaction`; `PreferencesService` refactored with constructor-injected repos for testability; `apps/api/vitest.config.ts` created; 7 unit tests pass (hasProfile×2, get×3, update×2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| T-013  | Preferences Settings Page                          | ✅ Done | `/preferences` server component fetches data via cookie-forwarding `createServerClient`; `PreferencesForm` client component reuses all 4 wizard step components (StepGoal, StepMetrics, StepDiet, StepCuisine) in card sections; Save calls `trpc.preferences.update`, shows success/error `Toast` from `@chefer/ui` (new component); calorie target displayed in page header; `packages/ui` now exports `Toast`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T-014  | DB Schema — Recipe, MealPlan, MealPlanDay          | ✅ Done | Added `Recipe`, `MealPlan`, `MealPlanDay` models to Prisma schema; `RecipeSource` + `MealPlanStatus` enums; meals stored as JSON in `MealPlanDay` (no Prisma relation to Recipe — app-level join); `MealPlanRepository` with `upsertRecipes`, `findRecipesByIds`, `createPlan`, `findActiveWithDays` exported from `@chefer/database`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T-015  | AI Service Layer                                   | ✅ Done | `apps/api/src/lib/ai/` — `types.ts` (IAIService interface + all DTOs); `prompts.ts` (system prompts + builders); `fixtures/week-plan.fixture.ts` (14-recipe library, 7-day WEEK_PLAN_FIXTURE); `fixtures/swap-recipes.fixture.ts` (4-type swap pool); `mock.ts` (MockAIService, deterministic, ~600ms delay); `openai.ts` (LiveAIService stub for Phase 3); `index.ts` (factory gated by `AI_MOCK_ENABLED` env var); `AI_MOCK_ENABLED=true` added to `apps/api/.env`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T-016  | Meal Plan tRPC Backend                             | ✅ Done | `MealPlanService` in `apps/api/src/application/meal-plan/`; `generate` reads user prefs → calls `aiService.generateMealPlan` → upserts recipes → archives old plan → creates new `ACTIVE` plan; `getActive` fetches plan + joins recipes from DB; `getRecipe` fetches single recipe; `mealPlanRouter` with `generate` (mutation), `getActive` (query), `getRecipe` (query) registered in `appRouter`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T-016A | Sidebar Navigation + Layout Overhaul               | ✅ Done | `lucide-react` installed; `SideBar` (w-56, 9 nav items, `pathname.startsWith()` active detection, saffron active state); `TopHeader` (page title + avatar/sign-out dropdown); `DashboardShell` client wrapper (title derived from pathname); `(dashboard)/layout.tsx` now renders `DashboardShell`; middleware updated — `/cookbook` → `/recipes`, `/profile` added; stub pages for all 9 routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T-017  | Meal Planner Page                                  | ✅ Done | `apps/web/src/app/(dashboard)/meal-plan/page.tsx` — client component; `trpc.mealPlan.getActive` query; empty state with "Generate" CTA; 7-column week grid (horizontally scrollable); `loading.tsx` skeleton                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| T-018  | Meal Planner UX Components                         | ✅ Done | `MealCard` — meal type badge, recipe name, cuisine, kcal + time stats, links to `/recipes/[id]?planId&day&meal`; `DayRecapBar` — daily kcal + P/C/F totals; `GenerateOverlay` — full-screen spinner with "Crafting your week…"; `trpc.mealPlan.generate` mutation with optimistic overlay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T-019  | Recipe Detail Page                                 | ✅ Done | `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx` — client component; `trpc.mealPlan.getRecipe` query; back link context-aware (`planId` param → "← Back to Meal Planner", else "← Back to Recipes"); hero placeholder, tags, 3-stat row (time/servings/kcal), 4-macro chips, ingredient list, numbered instructions; disabled Swap button (wired in T-022); `/recipes/[id]/loading.tsx` skeleton                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T-020  | Nutrition Panel + Dashboard Overhaul               | ✅ Done | `NutritionPanel` client component — fetches `trpc.mealPlan.getActive`, shows today's kcal + macro bars (protein/carbs/fat), today's meal list with links to recipe detail; dashboard page overhauled — welcome banner, 3 quick-action cards (Meal Planner / Recipes / Shopping List), 2-column layout with `NutritionPanel` in sidebar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T-021  | Dashboard — "Your Daily Overview"                  | ✅ Done | Full redesign of `apps/web/src/app/(dashboard)/dashboard/page.tsx` as `'use client'` component consuming `trpc.dashboard.summary.useQuery()`. New `DashboardService` + `dashboardRouter` added. Features: greeting header with date + "Sustainable Choice" badge, 7-day Weekly Outlook strip with dots for planned days, Next Meal spotlight card with Start Cooking CTA, Rest of Today list with time labels, Recent Favourites horizontal scroll, right-column Nutrition Panel with SVG calorie ring + macro bars + AI hint pill. `DashboardSkeleton` loading state.                                                                                                                                                                                                                                                                                                                                    |
| T-022  | Swap Individual Recipe (AI-Powered)                | ✅ Done | `mealPlan.swapRecipe` protectedProcedure mutation added to `meal-plan.router.ts`; `MealPlanService.swapRecipe()` calls `aiService.generateRecipeSwap()`, upserts new recipe, calls `repo.updateDayMeal()`. `updateDayMeal` and `findAllByUserId` added to `MealPlanRepository`. Recipe detail page wired: `trpc.mealPlan.swapRecipe.useMutation()` with `RefreshCw` spinner; Swap button only shown when `planId`+`day`+`meal` query params present; navigates to new recipe on success; error banner with dismiss on failure.                                                                                                                                                                                                                                                                                                                                                                            |
| T-023  | Shopping List Generation                           | ✅ Done | `mealPlan.getShoppingList` protectedProcedure query added; `MealPlanService.getShoppingList()` aggregates ingredients across all plan recipes, merges by name+unit, groups by category via `CATEGORY_MAP` keyword matching (Produce/Proteins/Dairy/Grains & Pantry/Other). `/shopping-list` page built: progress bar, category group headers, checkbox rows with local React state, print button, Chef's Tip callout, empty state for no active plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T-025  | Recipes Browse Page & Favourites                   | ✅ Done | `FavouriteRecipe` Prisma model added (userId FK, recipeId FK, savedAt, useInNextPlan, unique [userId, recipeId]). `FavouriteRecipeRepository` with `findByUserId`, `isSaved`, `save`, `remove`, `toggleUseInNextPlan`, `findAllRecipesForUser` exported from `@chefer/database`. `RecipeService` + `recipe.router.ts` with `list`, `isSaved`, `toggleFavourite`, `toggleUseInNextPlan` procedures. `/recipes` browse page: "All Recipes"/"♥ Saved" tabs, 300ms debounce search, 3-column grid, heart overlay per card, empty states. Recipe detail page wired: `isSaved` query, `toggleFavourite` mutation, `Save`/`Saved` button state, servings adjuster (1–8) with proportional quantity scaling, Nutrition Facts panel. `DashboardService` uses `favouriteRecipeRepository.findByUserId()` for Recent Favourites.                                                                                     |
| T-024  | Meal Plan History                                  | ✅ Done | `mealPlan.list`, `mealPlan.restore`, `mealPlan.getById` protectedProcedure procedures added to `meal-plan.router.ts`. `MealPlanService.list()` / `restore()` / `getById()` implemented; `MealPlanRepository` extended with `findAllByUserId`, `restorePlan`, `findByIdForUser`. `/history` page: ACTIVE plan shown at top with macro stats + recipe name strip, ARCHIVED cards with "Restore" button. `/history/[planId]` page: read-only 7-column plan grid with "READ-ONLY VIEW" label, recipe names per slot, day macro recap bar. `PlanHistoryCard` component using `date-fns` for week label formatting.                                                                                                                                                                                                                                                                                             |
| T-026  | Meal Ratings                                       | ✅ Done | `MealRating` Prisma model added (userId, recipeId, rating 1-5, notes?, ratedAt; unique [userId, recipeId]). `MealRatingRepository` with `upsert`, `findByUserAndRecipe` exported from `@chefer/database`. `RecipeService.rate()` + `RecipeService.getMyRating()` implemented. `recipe.rate` + `recipe.getMyRating` protectedProcedure procedures added. `StarRatingWidget` client component on recipe detail page — 5 clickable stars, "Saved ✓" confirmation, appears only when `?day=` query param is present (i.e., navigating from Meal Planner).                                                                                                                                                                                                                                                                                                                                                     |
| T-023B | Smart Shopping List Redesign                       | ✅ Done | `ShoppingListService` in `apps/api/src/application/shopping-list/`; `IGroceryAIService` interface + `MockGroceryAIService` (fixture data, ~300ms delay) + `ClaudeGroceryAIService` stub in `apps/api/src/lib/grocery-ai/`. Factory gated by `GROCERY_AI_MOCK_ENABLED` env var. `shoppingList.getForWeek` + `shoppingList.searchStores` protectedProcedure procedures added to `shopping-list.router.ts`. `/shopping-list` page redesigned: `WeekNavigator` (prev/next week buttons, week label), categorised item list with checkboxes + category headers, right-side store comparison panel (3 stores — Lidl, Carrefour, Kaufland — with item availability badges + per-store total + delivery estimate). `AvailabilityBadge` component (IN_STOCK/LIMITED/OUT_OF_STOCK/DELIVERY_ONLY). Preferences page extended with "Shopping & Delivery" section (address field + currency selector EUR/USD/GBP/RON). |

---

## How to Run

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env files (fill in DATABASE_URL at minimum)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Set DATABASE_URL in apps/api/.env and packages/database/.env, then push schema
pnpm db:push
pnpm db:seed

# 4. Start both apps
pnpm dev
# → web:  http://localhost:3000
# → api:  http://localhost:3001
```

---

## How to Test the Latest Feature

### T-024/T-026/T-023B — History, Ratings, Smart Shopping List

**Pre-condition:** `pnpm db:push` run, `pnpm db:seed` run, `pnpm dev` running. Log in as `alice@chefer.dev` / `User@123!`. Generate a meal plan first (click "Generate" on `/meal-plan`).

#### Test A — Meal Plan History list

1. Navigate to `/history`
2. **Expected:** Active plan card at the top labelled "ACTIVE" — shows week date range, 4 macro chips (kcal/protein/carbs/fat), a strip of up to 4 recipe names.
3. If previous plans exist: ARCHIVED cards below with "Restore" button.
4. Click **Restore** on an archived plan — **Expected:** That plan becomes ACTIVE and the previous active plan becomes ARCHIVED.

#### Test B — History detail (read-only plan grid)

1. On `/history`, click on any plan card (not the Restore button)
2. **Expected:** Navigates to `/history/[planId]` — shows a "READ-ONLY VIEW" banner, 7-column week grid, recipe names per meal slot (Breakfast/Lunch/Dinner/Snack), day macro recap bars.
3. Confirm there is no "Swap" or "Generate" button on this page.

#### Test C — Star rating

1. Navigate to `/meal-plan`, click any MealCard → `/recipes/[id]?planId=...&day=0&meal=...`
2. **Expected:** `StarRatingWidget` appears below the recipe title — 5 grey stars.
3. Click star 4 — **Expected:** Stars 1–4 fill orange; "✓ Saved" confirmation text appears briefly.
4. Refresh the page — **Expected:** Stars 1–4 are still orange (rating persisted).

#### Test D — Smart Shopping List

1. Navigate to `/shopping-list`
2. **Expected:** Week navigator with `← Previous` / `Next →` arrows and week label. Left panel: items grouped by category (Produce/Proteins/Dairy/Grains & Pantry/Other) with checkboxes. Right panel: 3 store cards (Lidl, Carrefour, Kaufland) each showing item counts, availability badges (IN STOCK / LIMITED / OUT OF STOCK), per-store total, delivery estimate.
3. Check items — progress bar increments.
4. Navigate to previous/next week using the arrows — **Expected:** Item list updates.

#### Test E — Preferences delivery fields

1. Navigate to `/preferences` → scroll to "Shopping & Delivery" section
2. **Expected:** Delivery address text field + currency selector (EUR/USD/GBP/RON).
3. Enter an address and select currency, click Save — **Expected:** Green toast "✓ Preferences saved successfully."
4. Refresh — **Expected:** Address and currency retained.

---

### T-021/T-022/T-023/T-025 — Dashboard, Swap, Shopping List, Recipes Browse

**Pre-condition:** `pnpm db:push` run, `pnpm db:seed` run, `pnpm dev` running. Log in as `alice@chefer.dev` / `User@123!`.

#### Test A — Dashboard overview

1. Navigate to `/dashboard` — confirm greeting "Alice", date badge, 7-day weekly outlook with today highlighted orange.
2. If plan exists: Next Meal spotlight shows recipe name + kcal + "Start Cooking →" button.
3. Right column: Nutrition Panel with SVG calorie ring, macro bars, AI hint pill.
4. Recent Favourites: horizontal scroll with recipe cards (seeded favourites for alice).

#### Test B — Swap a recipe

1. Navigate to `/meal-plan`, click any `MealCard` → `/recipes/[id]?planId=...&day=...&meal=...`
2. Confirm "Swap Recipe" button is visible (outlined, orange). Click it.
3. **Expected:** `RefreshCw` icon spins briefly; page navigates to new recipe detail page with same query params.
4. Click Swap again — confirm a different recipe appears.

#### Test C — Shopping list

1. Navigate to `/shopping-list`
2. **Expected:** Items grouped under Produce/Proteins/Dairy/Grains & Pantry/Other headings with checkboxes.
3. Check an item — confirm it gets strikethrough styling and progress bar increments.
4. Confirm empty state for a brand-new user (no active plan).

#### Test D — Recipes browse

1. Navigate to `/recipes` — "All Recipes" tab active, grid shows all recipes from active plan.
2. Click the "Saved" tab — empty state "No saved recipes yet".
3. Click the ♥ on a recipe card — heart fills orange. Switch to "Saved" tab — recipe appears.
4. Navigate to `/recipes/[id]` — "Save" / "Saved" button toggles correctly.
5. Type a fragment in the search box — grid filters within 300ms.

---

### T-017/T-018/T-019/T-020 — Meal Planner, Recipe Detail, Nutrition Panel

**Pre-condition:** `pnpm db:push` run, `pnpm db:seed` run, `pnpm dev` running. Log in as `alice@chefer.dev` / `User@123!`.

#### Test A — Dashboard shows nutrition panel

1. Navigate to `http://localhost:3000/dashboard`
2. **Expected:** Left sidebar shows 9 nav items (Dashboard, Meal Planner, Recipes, Shopping List, Tracker, Progress, History, Profile, Preferences). "Chefer" brand in sidebar. Top header shows "Dashboard" + "AJ" avatar.
3. If a meal plan exists: right column shows "Today's Nutrition" with kcal total, macro bars (Protein/Carbs/Fat), and today's meal list.
4. If no plan yet: "No active meal plan. Generate one →" link.

#### Test B — Generate a meal plan

1. Click **Meal Planner** in the sidebar → `/meal-plan`
2. If no plan: empty state "No meal plan yet" with "Generate my meal plan" button.
3. Click the button → **Expected:** `GenerateOverlay` appears ("Crafting your week…"). After ~600ms, the 7-day grid loads.
4. Grid shows Mon–Sun columns each with Breakfast/Lunch/Dinner/Snack cards and a "Day total" recap bar.

#### Test C — Click a recipe card

1. On the meal plan page, click any `MealCard`
2. **Expected:** Navigates to `/recipes/[id]?planId=...&day=...&meal=...`
3. Recipe detail page shows: "← Back to Meal Planner" link, recipe name, description, disabled Swap recipe button, cuisine + dietary tags, stats (total time, servings, calories), 4 macro chips, ingredients list, numbered instructions.
4. **Sidebar:** "Recipes" item is highlighted (active detection for nested `/recipes/[id]` route).

#### Test D — Back navigation from recipe

1. On the recipe detail page, click "← Back to Meal Planner"
2. **Expected:** Returns to `/meal-plan`.

#### Test E — Regenerate plan

1. On `/meal-plan`, click **Regenerate**
2. **Expected:** `GenerateOverlay` appears briefly, then the grid refreshes (new plan ID).

#### Test F — Dashboard nutrition panel reflects active plan

1. After generating a plan, navigate to `/dashboard`
2. **Expected:** NutritionPanel shows today's calorie total and today's 3–4 meals with recipe names linking to `/recipes/[id]?planId=...`.

---

### T-013 — Preferences Settings Page

**Pre-condition:** Logged in as a user who has completed onboarding (`pnpm db:seed` then log in as `alice@chefer.dev` / `User@123!`, or complete the wizard as a new user). `pnpm dev` running.

#### Test A — Data pre-populated from DB

1. Navigate to `http://localhost:3000/preferences`
2. **Expected:** The page loads with all 4 sections (Your Goal, Body Metrics, Diet & Restrictions, Cuisine & Meal Cadence) pre-filled with the values saved during onboarding. The previously selected goal card is highlighted, activity level radio is selected, any dietary chips are present, and previously chosen cuisines are toggled on.

#### Test B — Calorie target shown in header

1. On `/preferences`, look at the top of the page below the heading
2. **Expected:** A pill shows e.g. `2,321 kcal / day — current target` (only appears when a ChefProfile exists).

#### Test C — Save updates DB and shows toast

1. Change a value (e.g. click a different goal card, or toggle an additional cuisine)
2. Click **Save preferences**
3. **Expected:** Button shows "Saving…" briefly, then a green **✓ Preferences saved successfully.** toast appears in the bottom-right corner and auto-dismisses after 3 seconds.
4. Refresh the page — **Expected:** The changed value is still selected (persisted to DB).

#### Test D — Toast dismisses manually

1. Click **Save preferences**
2. Before the toast auto-dismisses, click the **×** on the toast
3. **Expected:** Toast disappears immediately.

#### Test E — Save disabled when required fields missing

1. Clear the Age field (delete the value)
2. **Expected:** The **Save preferences** button is disabled and a hint message appears: "Fill in your goal, age, height, weight, and activity level to save."

#### Test F — Error toast on API failure

1. Stop the API server (`apps/api`), then click **Save preferences**
2. **Expected:** A red **✕** error toast appears with an error message.

#### Test G — Nav link routes correctly

1. Click **Preferences** in the top nav bar
2. **Expected:** Navigates to `/preferences` with the form fully populated.

---

### T-011 — Onboarding Wizard – Step 4: Cuisine & Meal Cadence

**Pre-condition:** Logged in as a fresh account (or run `pnpm db:seed` to reset). `pnpm dev` running for both apps.

#### Test A — Step 4 renders with correct defaults

1. Complete Steps 1–3 and click **Continue** to reach Step 4
2. **Expected:** Heading "Cuisine & meal cadence". No cuisine cards selected. Meals per day pill **3** is active. Serving size pill **1** is active.

#### Test B — Cuisine multi-select toggles

1. Click **Italian** and **Japanese** cards
2. **Expected:** Both show primary border + tinted background (`aria-pressed="true"`).
3. Click **Italian** again — **Expected:** Deselects.

#### Test C — Meals per day and serving size

1. Click **4** in the meals per day row — **Expected:** **4** pill becomes active; **3** deselects.
2. Click **3** in the serving size row — **Expected:** "3 people" label appears below.

#### Test D — Finish saves to DB and redirects

1. Complete all 4 steps, click **Finish**
2. **Expected:** Button shows "Saving…" briefly, then redirects to `/dashboard`.
3. Open `pnpm db:studio` — **Expected:** A `chef_profiles` row and a `dietary_preferences` row exist for your user with all the entered values.

#### Test E — Redirect for returning user

1. After completing onboarding, navigate to `http://localhost:3000/onboarding`
2. **Expected:** Immediately redirected to `/dashboard` — wizard is never shown.

#### Test F — Finish disabled while saving

1. Click **Finish** and immediately check the button
2. **Expected:** Button is disabled and shows "Saving…" while the mutation is in flight.

#### Test G — API error shows inline message

1. Stop the API server (`apps/api`), then click **Finish**
2. **Expected:** A red error banner appears below the progress bar with an error message. The wizard stays on Step 4.

---

### T-010 — Onboarding Wizard – Step 3: Diet & Restrictions

**Pre-condition:** Logged in. Navigate to `/onboarding`, complete Steps 1 and 2, click **Continue** to reach Step 3.

#### Test A — Diet type toggles

1. On Step 3, click **Vegan** and **Gluten-Free**
2. **Expected:** Both buttons show a primary border and tinted background (`aria-pressed="true"`).
3. Click **Vegan** again — **Expected:** It deselects (border returns to default).

#### Test B — Allergy chip input (Enter)

1. Type `peanuts` in the Allergies field, press **Enter**
2. **Expected:** A chip labelled `peanuts` appears inside the input area; the text field clears.
3. Type `shellfish,` (with a trailing comma) — **Expected:** A `shellfish` chip is added immediately without pressing Enter.

#### Test C — Allergy chip removal

1. With at least one allergy chip, click the **×** on a chip
2. **Expected:** That chip is removed.
3. Focus the allergy input with at least one chip, press **Backspace** with an empty input — **Expected:** The last chip is removed.

#### Test D — Preset disliked ingredients

1. Click **Onions** and **Mushrooms** in the preset grid
2. **Expected:** Both pills show primary styling.
3. Click **Onions** again — **Expected:** Deselects.

#### Test E — Free-text disliked ingredient add

1. Type `Anchovies` in the "Add another ingredient…" field, click **Add** (or press **Enter**)
2. **Expected:** `Anchovies` appears as a custom chip above the input. The field clears.
3. Click **×** on the custom chip — **Expected:** It is removed.

#### Test F — Continue is always enabled

1. Leave all Step 3 fields empty
2. **Expected:** **Continue** button is enabled (fields are optional).

#### Test G — Back preserves Step 3 selections

1. Select a diet type and add an allergy, then click **Back** to Step 2, then **Continue** again
2. **Expected:** Step 3 renders with the previously selected diet type and allergy chip still present.

---

### T-009 — Onboarding Wizard – Step 2: Body Metrics

**Pre-condition:** Logged in. Navigate to `/onboarding`, select a goal on Step 1, click **Continue**.

#### Test A — Live calorie estimate appears on input

1. On Step 2, type `30` in Age, `175` in Height (cm), `75` in Weight (kg)
2. **Expected:** Calorie estimate card shows a number (e.g. ~2,321 kcal) and updates immediately on every keystroke.

#### Test B — Height cm ↔ ft/in toggle converts the value

1. Enter `180` cm in Height, then click **ft / in**
2. **Expected:** Feet shows `5`, inches shows `11` (180 cm ≈ 5′11″). Calorie estimate is unchanged.
3. Click **cm** — **Expected:** Height reverts to `180` cm.

#### Test C — Weight kg ↔ lbs toggle converts the value

1. Enter `80` kg in Weight, then click **lbs**
2. **Expected:** Weight field shows `176.4` lbs. Calorie estimate is unchanged.
3. Click **kg** — **Expected:** Weight reverts to `80` kg.

#### Test D — Activity level changes calorie estimate

1. With age/height/weight filled, select **Sedentary**; note the calorie number
2. Select **Athlete** — **Expected:** Calorie estimate is noticeably higher.

#### Test E — Continue disabled until all fields filled

1. Fill only age and height, leave weight empty
2. **Expected:** **Continue** button remains disabled.
3. Fill weight and select an activity level — **Expected:** **Continue** becomes enabled.

#### Test F — Back preserves Step 1 goal selection

1. From Step 2, click **Back**
2. **Expected:** Returns to Step 1 with the previously selected goal card still highlighted.

---

### T-008 — Onboarding Wizard – Step 1: Goals

**Pre-condition:** Logged in (or register a fresh account which redirects to `/onboarding`). `pnpm dev` running.

#### Test A — Redirect from register

1. Open an incognito window, register a new account at `/register`
2. **Expected:** Redirected to `/onboarding` and Step 1 renders.

#### Test B — Four goal cards with icons render

1. Navigate to `http://localhost:3000/onboarding`
2. **Expected:** Progress bar shows "Step 1 of 4 · 25% complete". Four cards visible: Lose Weight ⚖️, Maintain Weight 🎯, Gain Muscle 💪, Eat Healthier 🥗.

#### Test C — Continue disabled until selection

1. On `/onboarding` Step 1, do not click any card
2. **Expected:** **Continue** button is disabled (greyed out, `cursor-not-allowed`).

#### Test D — Selecting a card enables Continue

1. Click the **Gain Muscle** card
2. **Expected:** Card gets a highlighted border and tinted background. **Continue** becomes enabled.
3. Click another card — **Expected:** Previous card deselects, new card highlights.

#### Test E — Continue advances to Step 2 with selection preserved

1. Select a goal and click **Continue**
2. **Expected:** Step 2 placeholder renders ("Step 2 of 4 · 50% complete").
3. Click **Back** — **Expected:** Returns to Step 1 with the previously selected goal still highlighted.

#### Test F — Cancel on Step 1 returns to dashboard

1. On Step 1, click **Cancel**
2. **Expected:** Navigates to `/dashboard`.

---

### T-007 — Database Schema – Dietary Preferences

**Pre-condition:** `pnpm db:push` has been run (or the dev server restarted after running it).

#### Test A — Table exists with correct columns

1. Run `pnpm db:studio` from the `packages/database` directory
2. **Expected:** A `dietary_preferences` table is visible with columns: `id`, `userId`, `cuisinePreferences`, `dietaryRestrictions`, `allergies`, `dislikedIngredients`, `mealsPerDay`, `servingSize`, `updatedAt`

#### Test B — FK to users

1. In Prisma Studio, inspect the `dietary_preferences` table schema
2. **Expected:** `userId` is a unique foreign key referencing `users.id` with cascade delete

#### Test C — users table unchanged

1. In Prisma Studio, confirm the `users` table still has the same columns as before
2. **Expected:** No new columns on `users` — the relation is held by `dietary_preferences`

---

### T-006 — Sign Up & Login Pages

**Pre-condition:** `pnpm db:push` and `pnpm db:seed` have been run. Both `pnpm dev` processes are running.

#### Test A — Register redirects to /onboarding

1. Open an incognito window and navigate to `http://localhost:3000/register`
2. Fill in: First name `Test`, Last name `User`, Email `newuser@example.com`, Password `Test@123!`, Confirm password `Test@123!`
3. Click **Create account**
4. **Expected:** Redirected to `/onboarding` (404 is fine at this stage — the route isn't built yet). `chefer_session` cookie is set.

#### Test B — Mismatched passwords shows inline error

1. Navigate to `/register`
2. Enter any email, password `Test@123!`, confirm password `Different@123!`
3. Click **Create account**
4. **Expected:** "Passwords do not match" error shown inline under the confirm field. No API call made.

#### Test C — Duplicate email shows server error

1. Navigate to `/register`, use `alice@chefer.dev` with a valid password
2. Click **Create account**
3. **Expected:** Red error banner "An account with this email already exists".

#### Test D — Login redirects to /dashboard

1. Navigate to `/login`, sign in as `alice@chefer.dev` / `User@123!`
2. **Expected:** Redirected to `/dashboard`.

#### Test E — Authenticated users redirected away from auth pages

1. While logged in as Alice, navigate to `http://localhost:3000/login`
2. **Expected:** Immediately redirected to `/dashboard` — login form never shown.
3. Navigate to `http://localhost:3000/register`
4. **Expected:** Same — redirected to `/dashboard`.

---

### T-005 — Landing Page (Unauthenticated)

**Pre-condition:** Both `pnpm dev` processes are running.

#### Test A — Landing page renders for unauthenticated users

1. Open an incognito window and navigate to `http://localhost:3000`
2. **Expected:** Hero section with headline "Your personal chef, powered by AI", a **Get started for free** CTA, and a **Sign in** link.

#### Test B — CTA navigates to register

1. On the landing page, click **Get started for free**
2. **Expected:** Navigates to `/register`.

#### Test C — 3-column features are present

1. Scroll down on the landing page
2. **Expected:** Three feature cards: "Weekly AI Meal Plans", "Personalized Goals", "Smart Shopping Lists" — each with an icon and description.

#### Test D — Authenticated users are redirected

1. Log in as `alice@chefer.dev` / `User@123!`
2. Navigate to `http://localhost:3000`
3. **Expected:** Immediately redirected to `/dashboard` — no landing page content shown.

---

### T-004 — Core Layout & Navigation Shell

**Pre-condition:** `pnpm db:push` and `pnpm db:seed` have been run. Both `pnpm dev` processes are running.

#### Test A — Unauthenticated redirect

1. Open an incognito window and navigate to `http://localhost:3000/dashboard`
2. **Expected:** Redirected to `/login?from=%2Fdashboard`. No `/dashboard` content is shown.

#### Test B — Redirect works for all protected routes

1. In incognito, navigate to each of: `/meal-plan`, `/preferences`, `/onboarding`, `/tracker`, `/history`
2. **Expected:** Each redirects to `/login`.

#### Test C — Nav bar visible after login

1. Navigate to `http://localhost:3000/login`
2. Sign in as `alice@chefer.dev` / `User@123!`
3. **Expected:** `/dashboard` loads with a top nav bar showing the 🍽️ Chefer logo, Dashboard / Meal Plan / Preferences links, and a user avatar.

#### Test D — Nav links route correctly

1. While logged in, click **Meal Plan** in the nav
2. **Expected:** URL changes to `/meal-plan` (404 page is fine at this stage — the route is not yet built).
3. Click **Preferences** — URL changes to `/preferences`.
4. Click the logo — navigates to `/dashboard`.

#### Test E — Sign Out clears session

1. Click the avatar/name in the top-right corner
2. **Expected:** Dropdown shows the user's display name, email, and a **Sign out** button.
3. Click **Sign out**
4. **Expected:** Redirected to `/login`. Navigating to `/dashboard` redirects back to `/login`.

#### Test F — Auth pages remain accessible without nav

1. While logged out, visit `/login` and `/register`
2. **Expected:** No top nav bar on these pages.

---

## Seed Accounts

Available after `pnpm db:seed`:

| Email            | Password   | Role      |
| ---------------- | ---------- | --------- |
| admin@chefer.dev | Admin@123! | ADMIN     |
| alice@chefer.dev | User@123!  | USER      |
| bob@chefer.dev   | User@123!  | MODERATOR |

---

## Known Limitations (Phase 3 complete — T-021–T-026 + T-023B done)

- No "forgot password" flow (out of scope for MVP)
- `/tracker`, `/progress`, `/profile` are Phase 4 stubs (show "Coming soon")
- Saved recipe ♥ state on "All Recipes" tab is derived from the fetched list; heartbeat may briefly show unfilled before data loads
- Shopping list checkbox state is in React local state only — not persisted to localStorage yet (no `useLocalStorage` hook implemented; persistence is an MVP TODO)
- `lucide-react` was installed at `^0.400.0` — icon names differ from latest v0.4xx, update if icons render incorrectly
- AI mock uses fixture data (same 14 recipes every time) — real LLM integration in Phase 3 (T-031); set `AI_MOCK_ENABLED=false` + `OPENAI_API_KEY` to use live
- Pre-existing TypeScript errors in `packages/database`, `packages/utils`, and `packages/ui` (missing deps: `@types/node`, `@radix-ui/react-slot`). These do not affect the dev runtime — only `pnpm typecheck` output.
- Pre-existing `exactOptionalPropertyTypes` violations in `apps/api/src` (user router/service/repository). These do not affect runtime.
