# Chefer — Phase 3–5 Completion & Smart Shopping List PRD

| Field                 | Value                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| **Version**           | 2.0.0                                                                                |
| **Status**            | Active — Staff Engineering Backlog                                                   |
| **Author**            | Senior Engineering Manager / Product Owner                                           |
| **Date**              | 2026-03-22                                                                           |
| **Stack**             | Next.js 16 · Express + tRPC v11 · Prisma 5 · PostgreSQL 16 · Tailwind CSS 3         |
| **Design Source**     | Stitch project `14879881194424758396` — screen `3026367cb60140dbb887e329f42985c6` ("Chefer: AI Smart Shopping List (Rethought)") |
| **Predecessor**       | `PersonalChef_PRD.md` v1.6.0 — all Phase 0–2 tasks complete; Phase 3 partially done |

---

## Table of Contents

1. [Context & Current State](#1-context--current-state)
2. [Architecture Constraints](#2-architecture-constraints)
3. [Remaining Phase 3 Tasks](#3-remaining-phase-3-tasks)
   - [T-024 · Meal Plan History](#t-024--meal-plan-history--archives-m-p1)
   - [T-026 · Meal Ratings](#t-026--meal-ratings--feedback-loop-m-p2)
4. [Smart Shopping List — Full Redesign (T-023B)](#4-smart-shopping-list--full-redesign-t-023b)
   - [4.1 Overview & Design Intent](#41-overview--design-intent)
   - [4.2 Grocery Store AI Integration Architecture](#42-grocery-store-ai-integration-architecture)
   - [4.3 Mock Data Contract](#43-mock-data-contract)
   - [4.4 User Location Strategy](#44-user-location-strategy)
   - [4.5 Preferences — Delivery Address Field](#45-preferences--delivery-address-field)
   - [4.6 Database Schema Changes](#46-database-schema-changes)
   - [4.7 tRPC Procedures](#47-trpc-procedures)
   - [4.8 Page & Component Specification](#48-page--component-specification)
   - [4.9 Future Claude AI Integration Plan](#49-future-claude-ai-integration-plan)
5. [Phase 4 — Tracking & Engagement](#5-phase-4--tracking--engagement-t-027-to-t-032)
   - [T-027 · Calorie & Macro Tracker](#t-027--calorie--macro-tracking--daily-log-l-p1)
   - [T-028 · Progress Charts](#t-028--progress-charts-m-p1)
   - [T-029 · Weight Tracking](#t-029--weight-tracking--goal-progress-m-p2)
   - [T-030 · Email Notifications](#t-030--email-notifications--weekly-plan-ready-m-p2)
   - [T-031 · Shopping List Export](#t-031--shopping-list-export-pdf--share-link-m-p2)
   - [T-032 · AI Chat](#t-032--ai-chat--ask-your-chef-xl-p2)
6. [Phase 5 — Production Hardening](#6-phase-5--production-hardening-t-033-to-t-040)
   - [T-033 · Responsive Design](#t-033--responsive-design-audit--mobile-polish-l-p1)
   - [T-034 · Error Handling & Empty States](#t-034--error-handling--empty-states-m-p1)
   - [T-035 · Accessibility Baseline](#t-035--accessibility-a11y-baseline-m-p1)
   - [T-036 · Performance & Core Web Vitals](#t-036--performance--core-web-vitals-l-p1)
   - [T-037 · End-to-End Tests](#t-037--end-to-end-tests-with-playwright-l-p2)
   - [T-038 · Deployment](#t-038--environment-config--deployment-vercel-m-p1)
   - [T-039 · Analytics & Monitoring](#t-039--analytics--usage-monitoring-m-p2)
   - [T-040 · Subscription & Paywall Stub](#t-040--subscription--paywall-future-ready-stub-xl-p2)
7. [Effort & Priority Summary](#7-effort--priority-summary)
8. [Complete Test Plan](#8-complete-test-plan)
9. [Environment Variables Reference](#9-environment-variables-reference)

---

## 1. Context & Current State

### 1.1 What Is Complete

The following tasks from `PersonalChef_PRD.md` are fully implemented, committed, and pushed to master:

| Phase | Task Range | Description | Status |
|---|---|---|---|
| 0 | T-001 – T-006 | Foundation: scaffolding, DB schema, auth, navigation | ✅ Complete |
| 1 | T-007 – T-013 | User preferences: onboarding wizard, preferences CRUD | ✅ Complete |
| 2 | T-014 – T-020 + T-016A | AI meal plan generation, sidebar nav, meal planner page, recipe detail, nutrition panel | ✅ Complete |
| 3 | T-021 | Dashboard "Your Daily Overview" | ✅ Complete |
| 3 | T-022 | Recipe swap (AI-powered) | ✅ Complete |
| 3 | T-023 | Shopping list — basic grouped checklist with print button | ✅ Complete (superseded by T-023B in this PRD) |
| 3 | T-025 | Recipes browse page + favourites | ✅ Complete |

### 1.2 What Remains

| Phase | Task | Description | Effort | Priority |
|---|---|---|---|---|
| 3 | T-024 | Meal plan history & archives | M | P1 |
| 3 | T-023B | **Smart Shopping List — full redesign** (this PRD) | XL | P0 |
| 3 | T-026 | Meal ratings & feedback loop | M | P2 |
| 4 | T-027 | Calorie & macro tracker | L | P1 |
| 4 | T-028 | Progress charts | M | P1 |
| 4 | T-029 | Weight tracking & goal progress | M | P2 |
| 4 | T-030 | Email notifications | M | P2 |
| 4 | T-031 | Shopping list PDF export & share link | M | P2 |
| 4 | T-032 | AI chat — Ask Your Chef | XL | P2 |
| 5 | T-033 | Responsive design & mobile polish | L | P1 |
| 5 | T-034 | Error handling & empty states | M | P1 |
| 5 | T-035 | Accessibility baseline | M | P1 |
| 5 | T-036 | Performance & Core Web Vitals | L | P1 |
| 5 | T-037 | End-to-end tests with Playwright | L | P2 |
| 5 | T-038 | Deployment to Vercel | M | P1 |
| 5 | T-039 | Analytics & monitoring | M | P2 |
| 5 | T-040 | Subscription & paywall stub | XL | P2 |

**Total remaining effort:** ~145–185 engineering hours across 18 tasks.

---

## 2. Architecture Constraints

All new code must respect the following non-negotiable rules from the project's CLAUDE.md and `PersonalChef_PRD.md`:

1. **tRPC only** — all API communication goes through tRPC procedures. No Next.js API routes except `/api/chat` (streaming) and `/api/stripe-webhook` (Stripe signature).
2. **Layer order** — Router → Service (`apps/api/src/application/`) → Repository (`packages/database/src/repositories/`) → Prisma. Never skip layers.
3. **No direct Prisma in apps** — always import through `@chefer/database`.
4. **Interface-driven repositories** — services depend on `IRepository` interfaces, not concrete classes.
5. **Zod validation everywhere** — all tRPC inputs, env vars, and AI response schemas validated with Zod.
6. **AI mock/live pattern** — all grocery AI calls go through `IGroceryAIService` interface with a `MockGroceryAIService` (used now) and a `ClaudeGroceryAIService` (future). Flag: `GROCERY_AI_MOCK_ENABLED` (default `true`).
7. **`currentImplementation.md` must be updated** after every task completion.
8. **Conventional Commits** — all commits use `feat(scope)`, `fix(scope)`, `refactor(scope)` format.

---

## 3. Remaining Phase 3 Tasks

### T-024 · Meal Plan History & Archives `M` `P1`

**Goal:** Let users revisit past meal plans and optionally restore an old plan as the active one.

#### Backend

Add two procedures to `apps/api/src/routers/meal-plan.router.ts`:

- **`mealPlan.list`** — `protectedProcedure` query.
  - Input: `{ cursor?: string; limit?: number }` (default limit: 10).
  - Returns paginated list of the user's `MealPlan` rows (all statuses), newest first. Each item includes:
    - `id`, `weekStartDate`, `status`, `createdAt`
    - `recipePreview`: array of up to 3 recipe names sampled from the plan's days
    - `macroSummary`: average daily `{ kcal, protein, carbs, fat }` across all days of the plan
  - Implement cursor-based pagination using `createdAt` as the cursor.
- **`mealPlan.restore`** — `protectedProcedure` mutation.
  - Input: `{ planId: string }`.
  - Within a single Prisma transaction: set the target plan's `status` to `ACTIVE`, set any currently `ACTIVE` plan for the same user to `ARCHIVED`.
  - Returns the newly restored plan (same shape as `mealPlan.getActive`).
  - Guards: the plan must belong to `ctx.user.id`; throw `FORBIDDEN` otherwise.

Add `MealPlanListService.list()` and `MealPlanListService.restore()` to `apps/api/src/application/meal-plan/meal-plan.service.ts` (extend existing service, do not create a second file).

#### Frontend

Build `apps/web/src/app/(dashboard)/history/page.tsx`:

- Server component; fetches first page of plans via `serverClient.mealPlan.list()`.
- **Page header**: eyebrow `"PAST PLANS"`, H1 `"History"`.
- **Plan card** (`apps/web/src/features/history/components/PlanHistoryCard.tsx`):
  - Date range: `"Week of {Mon dd MMM} – {Sun dd MMM}"` formatted with `date-fns`.
  - Status badge: `ACTIVE` (orange), `ARCHIVED` (grey), `DRAFT` (muted).
  - Recipe preview: 3 recipe name chips in a flex row.
  - Macro summary row: `{kcal} kcal avg · {protein}g P · {carbs}g C · {fat}g F`.
  - Two buttons: `"View"` (ghost, navigates to `/history/[planId]`) and `"Restore"` (orange outlined, calls `mealPlan.restore` mutation, shows spinner while in-flight, toast on success).
- **Load more**: A `"Load more"` button at the bottom triggers the next cursor page (client component pagination, no full page refresh).
- **Empty state**: Illustration + `"No past plans yet — generate your first meal plan to start building your history."` + CTA `"Go to Meal Planner"`.

Build `apps/web/src/app/(dashboard)/history/[planId]/page.tsx`:

- A **read-only** view of any plan from history. Reuses the `MealPlanGrid` component built in T-017.
- Render with `readOnly={true}` prop that hides: the Regenerate button, the Swap Recipe button inside `MealCard`, and the `DayRecapBar`'s `// TODO tracker` chevron link.
- Add a `"← Back to History"` link at the top.
- Fetch via a new query: `mealPlan.getById` — `protectedProcedure` query. Input: `{ planId: string }`. Same return shape as `mealPlan.getActive`. Guard: plan must belong to `ctx.user.id`.

#### Files

| Action | File |
|---|---|
| Modify | `apps/api/src/routers/meal-plan.router.ts` (add `list`, `restore`, `getById`) |
| Modify | `apps/api/src/application/meal-plan/meal-plan.service.ts` |
| Modify | `packages/database/src/repositories/meal-plan.repository.ts` |
| Create | `apps/web/src/app/(dashboard)/history/page.tsx` |
| Create | `apps/web/src/app/(dashboard)/history/loading.tsx` |
| Create | `apps/web/src/app/(dashboard)/history/[planId]/page.tsx` |
| Create | `apps/web/src/features/history/components/PlanHistoryCard.tsx` |

> **Definition of Done:** TypeScript compiles clean. `pnpm lint` passes. Navigate to `/history` — confirm cards render with date ranges, recipe previews, and macro summaries. Click `Restore` on an archived plan — confirm it becomes active and appears on `/meal-plan`. Click `View` — confirm the read-only grid renders without Swap/Regenerate controls.

---

### T-026 · Meal Ratings & Feedback Loop `M` `P2`

**Goal:** Collect user ratings on recipes after they've been cooked. Feed high/low ratings back into the AI prompt to improve future plan relevance.

#### Database

Add to `packages/database/prisma/schema.prisma`:

```prisma
model MealRating {
  id        String   @id @default(cuid())
  userId    String
  recipeId  String
  rating    Int      // 1–5 stars
  notes     String?
  ratedAt   DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  @@unique([userId, recipeId])
  @@index([userId])
  @@map("meal_ratings")
}
```

Add `mealRatings MealRating[]` relation to both `User` and `Recipe`. Run `pnpm db:migrate`. Run `pnpm db:generate`.

#### Backend

Add to `apps/api/src/routers/recipe.router.ts`:

- **`recipe.rate`** — `protectedProcedure` mutation.
  - Input: `{ recipeId: string; rating: z.number().int().min(1).max(5); notes?: string }`.
  - Upserts a `MealRating` row (update `rating`/`notes` if the user has already rated this recipe).
  - Returns `{ rating: number; notes: string | null }`.

Add `recipe.getMyRating` — `protectedProcedure` query:
- Input: `{ recipeId: string }`.
- Returns `{ rating: number; notes: string | null } | null`.

Extend `RecipeService` in `apps/api/src/application/recipe/recipe.service.ts` with `rateRecipe()` and `getMyRating()` methods.

**AI prompt integration** (live mode only — `AI_MOCK_ENABLED=false`):

Extend `apps/api/src/lib/ai/prompts.ts` to accept a `ratingHints` parameter:
```ts
// Append to the meal plan generation system prompt:
// "These recipes are highly rated by the user (4–5 stars): {names}. Prefer similar styles."
// "These recipes are disliked by the user (1–2 stars): {names}. Avoid similar styles."
```
The `MealPlanService.generate()` method fetches this data before building the prompt. In mock mode, skip this step entirely.

#### Frontend

On `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx`:

- Show a `StarRatingWidget` component at the bottom of the page.
- Display condition: the `day` query param exists AND the corresponding meal plan day's `weekStartDate + day` date is **in the past** relative to today. If `day` is absent (user accessed the recipe outside of a plan context), hide the widget.
- `StarRatingWidget` renders 5 clickable star icons (filled orange / outline grey). Below: an optional `<textarea>` for notes (`placeholder="Any notes? (optional)"`), a `Save Rating` button.
- On save, call `recipe.rate`. On success, show a success toast.
- On page load, fetch `recipe.getMyRating` to pre-populate existing rating.

On `apps/web/src/app/(dashboard)/recipes/page.tsx`:

- Highly rated recipes (≥4 stars) get a small gold star badge overlaid on the card's top-left corner.
- Include `myRating` in the `recipe.list` return shape (join `MealRating` for `ctx.user.id`).

#### Files

| Action | File |
|---|---|
| Modify | `packages/database/prisma/schema.prisma` |
| Modify | `packages/database/src/repositories/favourite-recipe.repository.ts` (add rating repo) |
| Create | `packages/database/src/repositories/meal-rating.repository.ts` |
| Modify | `apps/api/src/routers/recipe.router.ts` |
| Modify | `apps/api/src/application/recipe/recipe.service.ts` |
| Modify | `apps/api/src/lib/ai/prompts.ts` |
| Modify | `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx` |
| Modify | `apps/web/src/app/(dashboard)/recipes/page.tsx` |
| Create | `apps/web/src/features/recipe/components/StarRatingWidget.tsx` |

> **Definition of Done:** Navigate to `/recipes/[id]?day=0` where day 0 is in the past — confirm the star widget renders. Click 4 stars and Save — confirm toast appears. Revisit — confirm the 4-star pre-selection. In `/recipes`, confirm the recipe shows a gold star badge. Verify the badge is absent for unrated recipes.

---

## 4. Smart Shopping List — Full Redesign (T-023B)

### 4.1 Overview & Design Intent

The current T-023 implementation is a basic grouped checklist. This redesign elevates the Shopping List into a **Smart Commerce Feature** — the product's strongest differentiator after meal plan generation.

**Design source:** Stitch screen `3026367cb60140dbb887e329f42985c6` — "Chefer: AI Smart Shopping List (Rethought)"

**Core capabilities to add:**

| Capability | Description |
|---|---|
| **Week navigation** | Previous / current / next week selector in the page header |
| **Item images** | Thumbnail photo of each grocery item using Unsplash CDN or store product image |
| **Store availability** | Per-item status: `IN_STOCK` / `LIMITED` / `OUT_OF_STOCK` / `BOUGHT` |
| **Estimated price** | Per-item and total estimated cost in the user's local currency |
| **In-Store vs Delivery toggle** | Switches between in-store aisle hints and delivery-specific options |
| **Store selector** | Compare multiple nearby stores (LIDL, Carrefour, Kaufland) side-by-side |
| **Order summary** | Subtotal, estimated taxes, delivery fee, total — per store |
| **Order actions** | "Order via Delivery", "Print List", "Send to Mobile" |
| **Chef's Tip** | Contextual tip (e.g. leftover ingredients from last week) |

**AI integration strategy:**
- **Now (Phase 1):** A `MockGroceryAIService` returns a deterministic, fully-typed fixture that matches the exact production data contract. All UI is built against this contract.
- **Future (Phase 2):** A `ClaudeGroceryAIService` uses Claude with web search/computer_use tools to fetch real prices and availability from nearby stores. Swapping providers requires only changing `GROCERY_AI_MOCK_ENABLED=false`. No UI changes required.

---

### 4.2 Grocery Store AI Integration Architecture

The grocery AI integration follows the exact same pattern as the existing `IAIService` / `MockAIService` / `LiveAIService`:

```
apps/api/src/lib/grocery-ai/
├── types.ts              ← IGroceryAIService interface + all DTOs
├── mock.ts               ← MockGroceryAIService (used now)
├── claude.ts             ← ClaudeGroceryAIService (Phase 2, skeleton only)
├── index.ts              ← factory (reads GROCERY_AI_MOCK_ENABLED env)
└── fixtures/
    └── grocery-stores.fixture.ts  ← realistic mock data for 3 stores
```

**Interface (`apps/api/src/lib/grocery-ai/types.ts`):**

```ts
export type AvailabilityStatus =
  | 'IN_STOCK'
  | 'LIMITED'
  | 'OUT_OF_STOCK';

export interface GroceryItem {
  ingredientName: string;       // Matches the shopping list ingredient name
  quantity: string;             // e.g. "1 bag", "400g", "3 units"
  unit: string;                 // normalised unit for display
  category: string;             // 'produce' | 'proteins' | 'dairy' | 'grains' | 'frozen'
  imageUrl: string;             // Unsplash CDN URL (800×600)
  storeSku?: string;            // Store-specific product ID
  storeProductName?: string;    // Store's own product name (may differ from ingredient name)
  priceEur: number;             // Estimated price in EUR (or local currency)
  availabilityStatus: AvailabilityStatus;
  aisleHint?: string;           // e.g. "Produce Section • Organic", "Aisle 4"
  deliveryNote?: string;        // e.g. "Ships within 2 hours"
}

export interface GroceryStore {
  id: string;                   // 'lidl' | 'carrefour' | 'kaufland'
  name: string;                 // Display name: "LIDL"
  logoUrl: string;              // Brand logo URL
  address: string;              // Nearest store address
  distanceKm: number;           // Distance from user's location
  inStoreAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryFeeEur: number;       // 0 if above minimum order threshold
  minimumOrderEur: number;
  estimatedDeliveryTime: string; // "45–60 min" or "Tomorrow by 10 AM"
  items: GroceryItem[];         // All shopping list items priced for this store
  subtotalEur: number;          // Sum of all item prices
  taxEur: number;               // Estimated tax (varies by country)
  totalEur: number;             // subtotal + tax + delivery fee
  availableItemCount: number;   // Items with IN_STOCK or LIMITED status
  unavailableItemCount: number; // Items with OUT_OF_STOCK status
}

export interface GrocerySearchInput {
  ingredients: {
    name: string;
    quantity: string;
    unit: string;
    category: string;
  }[];
  userLocation: {
    lat: number;
    lng: number;
  } | null;
  deliveryAddress: string | null;
  preferredCurrency: string;    // ISO 4217, e.g. "EUR"
}

export interface GrocerySearchResult {
  stores: GroceryStore[];       // 1–4 stores, sorted by totalEur ascending
  searchedAt: Date;
  locationUsed: 'gps' | 'address' | 'default';
  currencyCode: string;
}

export interface IGroceryAIService {
  searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult>;
}
```

**Mock implementation (`apps/api/src/lib/grocery-ai/mock.ts`):**

```ts
export class MockGroceryAIService implements IGroceryAIService {
  async searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult> {
    // Return GROCERY_STORES_FIXTURE with all ingredient names mapped to fixture items.
    // If an ingredient from the list has no fixture entry, return a generic placeholder item.
    // Never throw — the mock must always return a full, valid GrocerySearchResult.
    return buildMockResult(input, GROCERY_STORES_FIXTURE);
  }
}
```

**Factory (`apps/api/src/lib/grocery-ai/index.ts`):**

```ts
import { MockGroceryAIService } from './mock';
import { ClaudeGroceryAIService } from './claude';

export const groceryAIService: IGroceryAIService =
  process.env.GROCERY_AI_MOCK_ENABLED === 'false'
    ? new ClaudeGroceryAIService()
    : new MockGroceryAIService();
```

---

### 4.3 Mock Data Contract

The fixture at `apps/api/src/lib/grocery-ai/fixtures/grocery-stores.fixture.ts` must define 3 stores with realistic data. The mock must cover all ingredient categories. Below is the **required data shape**; the engineer is responsible for filling in all values.

```ts
export const GROCERY_STORES_FIXTURE: GroceryStore[] = [
  {
    id: 'lidl',
    name: 'LIDL',
    logoUrl: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=80&h=80&fit=crop',
    address: 'Str. Exemplu 12, Sector 1, București',
    distanceKm: 0.8,
    inStoreAvailable: true,
    deliveryAvailable: true,
    deliveryFeeEur: 2.99,
    minimumOrderEur: 30,
    estimatedDeliveryTime: '45–60 min',
    items: [
      // One entry per ingredient in the shopping list.
      // All 14+ week-plan recipe ingredients must be represented.
      // At minimum: Avocado, Baby Spinach, Greek Yogurt, Salmon Fillet, Chicken Breast,
      // Quinoa, Lentils, Oats, Eggs, Olive Oil, Cherry Tomatoes, Garlic, Lemon, Banana,
      // Almonds, Mixed Nuts, Cod Fillet, Chickpeas, Broccoli, Red Onion, Carrot.
      {
        ingredientName: 'Avocado',
        quantity: '0.5 medium',
        unit: 'medium',
        category: 'produce',
        imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=120&h=120&fit=crop',
        storeProductName: 'Avocado Ready to Eat',
        priceEur: 0.89,
        availabilityStatus: 'IN_STOCK',
        aisleHint: 'Produce Section • Ready to Eat',
        deliveryNote: null,
      },
      // ... all other items
    ],
    // subtotalEur, taxEur, totalEur are computed values — calculate from items array.
    subtotalEur: 47.60,
    taxEur: 3.57,
    totalEur: 54.16, // subtotal + tax + deliveryFee
    availableItemCount: 19,
    unavailableItemCount: 2,
  },
  {
    id: 'carrefour',
    name: 'Carrefour',
    // ... same structure, slightly higher prices, closer location
    distanceKm: 1.4,
    deliveryFeeEur: 0, // free delivery above minimum
    minimumOrderEur: 50,
    estimatedDeliveryTime: '30–45 min',
    // ...
  },
  {
    id: 'kaufland',
    name: 'Kaufland',
    // ... same structure, lowest prices, furthest location
    distanceKm: 2.1,
    deliveryFeeEur: 3.99,
    minimumOrderEur: 25,
    estimatedDeliveryTime: 'Tomorrow by 10 AM',
    // ...
  },
];
```

**Key mock constraints:**
- Each store must have a distinct price point per item (±10–25% variance).
- At least 2 items per store must be `LIMITED`.
- At least 1 item per store must be `OUT_OF_STOCK` (different items per store).
- `subtotalEur`, `taxEur`, and `totalEur` must be arithmetically correct.
- Item `imageUrl` values must be valid Unsplash URLs (already in `remotePatterns`).
- The `LIDL` store must always be cheapest to test the "best value" badge logic.

---

### 4.4 User Location Strategy

The Shopping List uses the user's location to determine nearby stores. Two resolution paths:

**Path A — GPS (browser Geolocation API):**

In the Shopping List page client component, call `navigator.geolocation.getCurrentPosition()` with a 10-second timeout. Store the `{ lat, lng }` result in React state. Show a `"📍 Using your current location"` indicator when active. Show a prompt `"Allow location access for nearby store results"` if permission is denied or unavailable. Fallback to Path B or Path C.

**Path B — Delivery address from Preferences:**

If no GPS is available, read `ChefProfile.deliveryAddress` (see §4.5) from the `preferences.get` query. If set, show `"📍 Using delivery address: {address}"`. Pass `{ deliveryAddress }` to the tRPC query instead of `{ lat, lng }`.

**Path C — Default / No location:**

If neither GPS nor address is available, the mock returns the fixture stores with default distances. Show a banner: `"Set your delivery address in Preferences for accurate local store results."` with a link to `/preferences`. The page still functions — it just shows placeholder distances.

**Location data is passed as a tRPC query input** — it is never stored server-side without explicit user consent. The API processes it only for the duration of the grocery search request.

---

### 4.5 Preferences — Delivery Address Field

#### Database

Add to `ChefProfile` in `packages/database/prisma/schema.prisma`:

```prisma
deliveryAddress String?    // Free-text delivery address
deliveryCurrency String?   // ISO 4217 code, e.g. "EUR" — defaults to "EUR"
```

Run `pnpm db:migrate`. Run `pnpm db:generate`.

#### Backend

Extend `preferences.update` tRPC input schema to include `deliveryAddress?: string` and `deliveryCurrency?: string`. These are already handled by the existing `preferences.update` partial-update pattern.

#### Frontend

On `apps/web/src/app/(dashboard)/preferences/page.tsx`, add a new **"Shopping & Delivery"** section below the existing dietary sections:

- **Delivery Address** — `<textarea>` (2 rows), `placeholder="Your delivery address for grocery estimates"`.
- **Preferred Currency** — `<select>` with options: EUR, USD, GBP, RON. Defaults to EUR.
- On Save (existing Save button), these fields are included in the `preferences.update` call.

---

### 4.6 Database Schema Changes

No new database tables are required for T-023B. The existing `MealPlan`, `MealPlanDay`, and `Recipe` tables contain all shopping list source data. Grocery store search results are **not persisted** — they are fetched on demand (cached client-side for the session).

Changes required:

1. `ChefProfile` — add `deliveryAddress String?`, `deliveryCurrency String?` (§4.5).
2. Run `pnpm db:migrate` and `pnpm db:generate` after schema change.

---

### 4.7 tRPC Procedures

All procedures added to `apps/api/src/routers/shopping-list.router.ts` (new router):

#### `shoppingList.getForWeek` — `protectedProcedure` query

```ts
Input: z.object({
  weekOffset: z.number().int().min(-52).max(0).default(0),
  // 0 = current week, -1 = last week, -2 = two weeks ago
})
```

Returns:
```ts
{
  planId: string | null;
  weekStartDate: string;        // ISO date string
  weekEndDate: string;
  hasPlan: boolean;
  items: ShoppingListItem[];    // aggregated, deduplicated, with category
  checkedItemKeys: string[];    // Reserved for future server-side persistence; empty for now
  weekOffset: number;
}

type ShoppingListItem = {
  key: string;                  // `${planId}-${normalised-ingredient-name}` — used as localStorage key
  ingredientName: string;
  quantity: string;
  unit: string;
  category: 'produce' | 'proteins' | 'dairy' | 'grains' | 'frozen';
  recipeNames: string[];        // Which recipes use this ingredient (for tooltip)
}
```

Implementation in `apps/api/src/application/shopping-list/shopping-list.service.ts`:
- Fetch the `MealPlan` for the target week (offset from current week start date).
- If `weekOffset = 0` and no ACTIVE plan exists, try the most recent ARCHIVED plan for that week.
- Aggregate all `Recipe.ingredients[]` across all days/meals, merge duplicates, sum quantities.
- Return empty `items: []` with `hasPlan: false` if no plan found for that week.

#### `shoppingList.searchStores` — `protectedProcedure` query

```ts
Input: z.object({
  planId: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  deliveryAddress: z.string().optional(),
})
```

Returns: `GrocerySearchResult` (see §4.2).

Implementation in `apps/api/src/application/shopping-list/shopping-list.service.ts`:
- Fetch `ShoppingListItem[]` for the given `planId`.
- Fetch `ChefProfile.deliveryCurrency` for the user.
- Call `groceryAIService.searchNearbyStores(...)`.
- Return the result.

Add `shoppingListRouter` to `apps/api/src/routers/index.ts`.

---

### 4.8 Page & Component Specification

#### Page: `apps/web/src/app/(dashboard)/shopping-list/page.tsx`

This is a **client component** (`'use client'`) because it manages:
- GPS geolocation state
- Week offset navigation state
- In-store vs Delivery toggle state
- Checked item state (localStorage)
- Selected store state
- Lazy-loaded grocery search results

**Page layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ THIS WEEK                                                            │
│ Shopping List            Week of 16 Mar – 22 Mar       [Print] [📱]  │
│ ← Prev week    ○──────────────────●    Next week →                   │
├──────────────────────────────────┬───────────────────────────────────┤
│                                  │                                   │
│  [🏪 In-Store]  [🚚 Delivery]    │  STORE SELECTOR                   │
│                                  │  ┌─────────────┐ ┌────────────┐  │
│  ████████████████░░ 18/24        │  │ LIDL  €54   │ │ Carrefour  │  │
│  items checked                   │  │ ★ Best Value │ │ €61        │  │
│                                  │  └─────────────┘ └────────────┘  │
│  PRODUCE (8 items)               │  ┌────────────┐                  │
│  ┌─────────────────────────────┐ │  │ Kaufland   │                  │
│  │ [img] Avocado        [✓] │ │  │ │ €58        │                  │
│  │       0.5 medium          │ │  │  └────────────┘                  │
│  │       € 0.89  🟢 In Stock │ │  │                                  │
│  │       Produce Section     │ │  │  ORDER SUMMARY                   │
│  └─────────────────────────────┘ │  Subtotal (24 items): € 47.60    │
│  ┌─────────────────────────────┐ │  Est. Taxes:          €  3.57    │
│  │ [img] Baby Spinach   [  ] │ │  │  Delivery Fee:        €  2.99    │
│  │       1 bag               │ │  │  ─────────────────────────────   │
│  │       € 4.00  🟡 Limited  │ │  │  TOTAL ESTIMATED:     € 54.16   │
│  └─────────────────────────────┘ │  [  Order via Delivery  ]         │
│  ...                             │                                   │
│  PROTEINS (6 items)              │  💡 Chef's Tip                    │
│  DAIRY & EGGS (4 items)          │  Shallots left from last week —   │
│  GRAINS & PANTRY (4 items)       │  skip buying this week.           │
│  FROZEN (2 items)                │                                   │
└──────────────────────────────────┴───────────────────────────────────┘
```

**Component tree:**

```
ShoppingListPage (client)
├── ShoppingListHeader
│   ├── WeekNavigator           ← week prev/next buttons + label
│   ├── LocationBadge           ← "📍 Using your current location"
│   └── ActionBar               ← Print button + Send to Mobile
├── ModeToggle                  ← "In-Store" / "Delivery" pill toggle
├── ProgressBar                 ← checked / total items
├── ShoppingListMain (2-col layout)
│   ├── IngredientList (left col)
│   │   └── CategorySection[]
│   │       └── IngredientRow[]
│   │           ├── ItemImage   ← 48×48px thumbnail (next/image)
│   │           ├── ItemCheckbox
│   │           ├── ItemDetails ← name, quantity, price, aisle hint
│   │           └── AvailabilityBadge ← IN_STOCK / LIMITED / OUT_OF_STOCK
│   └── StorePanel (right col)
│       ├── StoreSelector
│       │   └── StoreTile[]     ← one per store; selected = orange border
│       ├── OrderSummary        ← subtotal, tax, delivery, total
│       ├── OrderButton         ← "Order via Delivery" (inert for MVP, see §4.8 below)
│       └── ChefsTipCard
```

#### Component: `WeekNavigator`

```tsx
// Props
interface WeekNavigatorProps {
  weekOffset: number;           // 0 = current, -1 = last, etc.
  onOffsetChange: (offset: number) => void;
  weekStart: Date;
  weekEnd: Date;
}
```

- `← Previous` arrow button — decrements `weekOffset` by 1. Disabled when `weekOffset <= -52`.
- Center label: `"Week of {dd MMM} – {dd MMM}"`.
- `Next →` arrow button — increments `weekOffset` by 1. Disabled when `weekOffset >= 0` (cannot go to future weeks).

#### Component: `IngredientRow`

```tsx
interface IngredientRowProps {
  item: ShoppingListItem;
  groceryItem?: GroceryItem;    // From selected store; undefined until store data loaded
  isChecked: boolean;
  mode: 'in-store' | 'delivery';
  onToggle: (key: string) => void;
}
```

Layout:
- Left: 48×48 px thumbnail (`next/image`, `object-cover`, rounded). Source: `groceryItem.imageUrl` when available, else Unsplash ingredient fallback.
- Centre-left: Item name (bold) + quantity.
- Centre-right: Price in selected currency (e.g. `€ 0.89`). Show `—` when store data is loading.
- Far right: `AvailabilityBadge` + checkbox.
- Below item name (in-store mode): `aisleHint` in `text-xs text-muted` (e.g. `"Produce Section • Organic"`).
- Below item name (delivery mode): `deliveryNote` in `text-xs text-muted`.
- Checked items: text gets `line-through text-muted`; availability badge replaced with `✓ BOUGHT` (grey pill).

#### Component: `AvailabilityBadge`

| Status | Colour | Label |
|---|---|---|
| `IN_STOCK` | Green pill `bg-green-100 text-green-700` | `🟢 In Stock` |
| `LIMITED` | Amber pill `bg-amber-100 text-amber-700` | `🟡 Limited` |
| `OUT_OF_STOCK` | Red pill `bg-red-100 text-red-700` | `🔴 Not Available` |

#### Component: `StoreTile`

```tsx
interface StoreTileProps {
  store: GroceryStore;
  isSelected: boolean;
  isBestValue: boolean;         // true if store has lowest totalEur
  onSelect: () => void;
}
```

- Border: `border-2 border-orange-500` when selected, `border border-neutral-200` otherwise.
- Store logo (`next/image`, 40×40).
- Store name (`font-semibold`).
- Distance: `{distanceKm} km away`.
- Total price: `€ {totalEur.toFixed(2)}` — large, bold.
- `"★ Best Value"` orange chip when `isBestValue === true`.
- Unavailable items note: `"{unavailableItemCount} items not available"` in `text-xs text-muted` when `> 0`.
- Click sets the selected store. Only one store can be selected at a time.

#### Component: `OrderSummary`

Displays for the selected store:
- Subtotal: `€ {subtotalEur.toFixed(2)}`
- Est. Taxes: `€ {taxEur.toFixed(2)}`
- Delivery Fee: `€ {deliveryFeeEur.toFixed(2)}` (or `"Free"` if 0)
- **Total Estimated**: `€ {totalEur.toFixed(2)}` — bold, larger text
- Below: `"Order via Delivery"` button (orange, full-width). For MVP this is **inert** — renders as a `<button disabled>` with `title="Coming soon — delivery ordering integration"` and a `// TODO T-023C` comment.

#### Component: `ChefsTipCard`

An amber-tinted callout card (`bg-amber-50 border-l-4 border-amber-400`):
- Icon: 💡
- Title: `"Chef's Tip"`
- Content: static tip derived from the shopping list. Logic:
  - If the user has a meal plan for the **previous week** (`weekOffset = -1`) that contains ingredients also in the current week, show: `"You may have [ingredient] left over from last week — consider skipping this."`.
  - Otherwise show a generic tip: `"Buy ingredients for meal prep on Sunday to save time during the week."`.
- This logic runs client-side using data already fetched; no extra API call.

#### Loading States

- `shoppingList.getForWeek` loading: show skeleton rows (grey rounded rectangles) in the ingredient list, with skeleton order summary on the right.
- `shoppingList.searchStores` loading: show a spinner in the StorePanel with text `"Finding nearby stores…"`. Ingredient rows show `—` for prices and grey placeholder for availability badges.
- The grocery store search is triggered **after** the shopping list items have loaded. This two-phase loading keeps the page interactive immediately (users can start checking items while store data loads).

#### Checked State Persistence

Checked items are persisted in `localStorage` keyed by `item.key` (`"{planId}-{normalised-ingredient-name}"`). Use the existing `useLocalStorage` hook at `apps/web/src/hooks/use-local-storage.ts`. Checked state automatically resets when `weekOffset` changes (different plan = different keys).

#### Empty State

When `hasPlan === false` for the selected week:
- Centred illustration + heading `"No meal plan for this week"`.
- Subtext: `"Generate a meal plan to get a personalised shopping list."`.
- Button: `"Go to Meal Planner"` → `/meal-plan`.

#### Files

| Action | File |
|---|---|
| **Modify** | `packages/database/prisma/schema.prisma` (add `deliveryAddress`, `deliveryCurrency` to `ChefProfile`) |
| **Create** | `apps/api/src/lib/grocery-ai/types.ts` |
| **Create** | `apps/api/src/lib/grocery-ai/mock.ts` |
| **Create** | `apps/api/src/lib/grocery-ai/claude.ts` (skeleton only — see §4.9) |
| **Create** | `apps/api/src/lib/grocery-ai/index.ts` |
| **Create** | `apps/api/src/lib/grocery-ai/fixtures/grocery-stores.fixture.ts` |
| **Create** | `apps/api/src/routers/shopping-list.router.ts` |
| **Create** | `apps/api/src/application/shopping-list/shopping-list.service.ts` |
| **Modify** | `apps/api/src/routers/index.ts` (add `shoppingListRouter`) |
| **Modify** | `apps/api/src/routers/preferences.router.ts` (add `deliveryAddress`, `deliveryCurrency` to update schema) |
| **Rewrite** | `apps/web/src/app/(dashboard)/shopping-list/page.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/WeekNavigator.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/ModeToggle.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/IngredientRow.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/AvailabilityBadge.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/StoreTile.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/StoreSelector.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/OrderSummary.tsx` |
| **Create** | `apps/web/src/features/shopping-list/components/ChefsTipCard.tsx` |
| **Modify** | `apps/web/src/app/(dashboard)/preferences/page.tsx` (add delivery address section) |
| **Modify** | `apps/web/.env.example` (add `GROCERY_AI_MOCK_ENABLED`) |
| **Modify** | `infrastructure.md` (update §1, §4, §7, §8, §10, §12 per CLAUDE.md rules) |
| **Modify** | `currentImplementation.md` |

---

### 4.9 Future Claude AI Integration Plan

This section is a **design document**, not an implementation task. It describes exactly how the mock will be replaced by a live Claude integration. No code in this section should be implemented now.

#### What Claude Will Do

When `GROCERY_AI_MOCK_ENABLED=false`, `ClaudeGroceryAIService` will:

1. **Geocode the user's location** using a geocoding API (e.g. Google Maps Geocoding API or OpenStreetMap Nominatim) to convert GPS coordinates or delivery address into a human-readable city/neighbourhood.

2. **Search for nearby stores** using Claude's `web_search` tool to find active grocery store locations (LIDL, Carrefour, Kaufland, or other chains relevant to the user's country) within 5 km.

3. **Fetch current prices and availability** using Claude's `web_search` tool to query each store's online shopping/delivery platform for the specific ingredient names. Claude extracts product names, prices, and availability status from the response HTML/JSON.

4. **Return a typed `GrocerySearchResult`** validated with Zod against the same schema used by the mock. If Claude's response fails Zod validation, log the error and fall back to the mock result.

#### Claude Tool Configuration (future)

```ts
// apps/api/src/lib/grocery-ai/claude.ts (skeleton — DO NOT IMPLEMENT NOW)
export class ClaudeGroceryAIService implements IGroceryAIService {
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult> {
    // TODO Phase 2: Implement using Claude claude-3-5-sonnet with tools:
    //   - tool: "web_search" for finding store locations
    //   - tool: "web_search" for fetching product prices per store
    // Parse response with Zod. Fall back to MockGroceryAIService on failure.
    throw new Error('ClaudeGroceryAIService not yet implemented — set GROCERY_AI_MOCK_ENABLED=true');
  }
}
```

#### Environment Variables (Phase 2)

| Variable | Purpose |
|---|---|
| `GROCERY_AI_MOCK_ENABLED` | `true` now; `false` in production Phase 2 |
| `ANTHROPIC_API_KEY` | Already in env; reused for grocery search |
| `GEOCODING_API_KEY` | Google Maps or similar; optional — Nominatim is free |

#### Why This Approach Is Safe

- **No breaking changes:** The `IGroceryAIService` interface is the contract. Swapping the implementation requires only changing the env flag.
- **No UI changes:** All UI components consume `GrocerySearchResult`. They cannot tell whether the data came from mock or Claude.
- **Cost protection:** Each grocery search is one Claude call. Rate-limit the `shoppingList.searchStores` query to once per plan per session (cache result in Redis or a simple `Map<planId, result>` in-memory store with a 1-hour TTL).
- **Graceful degradation:** If Claude fails, fall back to the mock result and log the error. Show a `"Store data temporarily unavailable — showing estimated prices"` banner.

---

## 5. Phase 4 — Tracking & Engagement (T-027 to T-032)

### T-027 · Calorie & Macro Tracking — Daily Log `L` `P1`

**Goal:** Allow users to confirm which planned meals they actually ate and adjust portion sizes, creating a real logged intake vs. the planned intake.

#### Database

Add to `packages/database/prisma/schema.prisma`:

```prisma
model DailyLog {
  id            String   @id @default(cuid())
  userId        String
  date          DateTime @db.Date
  loggedMeals   Json     // { recipeId, mealType, portionMultiplier: 0.5|1|1.5|2, kcal, protein, carbs, fat }[]
  totalKcal     Int
  totalProtein  Float
  totalCarbs    Float
  totalFat      Float
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, date])
  @@index([userId, date])
  @@map("daily_logs")
}
```

Run `pnpm db:migrate`. Run `pnpm db:generate`.

#### Backend

Create `apps/api/src/routers/tracker.router.ts`:

- **`tracker.getDay`** — `protectedProcedure` query. Input: `{ date: z.string() }` (ISO date `YYYY-MM-DD`). Returns the `DailyLog` row for that date, or `null` if not logged. Also returns the active plan's meals for that day (pre-population source).
- **`tracker.upsertDay`** — `protectedProcedure` mutation. Input: `{ date: string; loggedMeals: LoggedMeal[] }`. Derives `totalKcal`, `totalProtein`, `totalCarbs`, `totalFat` server-side from recipe `nutritionInfo` rows fetched from the DB (scaled by `portionMultiplier`). Upserts the `DailyLog` row.

Create `apps/api/src/application/tracker/tracker.service.ts` and `packages/database/src/repositories/daily-log.repository.ts`.

Add `trackerRouter` to `apps/api/src/routers/index.ts`.

#### Frontend

Build `apps/web/src/app/(dashboard)/tracker/page.tsx` (client component):

- **Date selector**: today's date (default) with `← Previous day` / `Next day →` arrows. Days in the future are disabled.
- **Meal list**: Pre-populated from the active plan's meals for the selected day. Each row:
  - Checkbox (checked = logged).
  - Recipe name + meal type badge.
  - Portion selector: `½×` / `1×` / `1½×` / `2×` pill toggle (default `1×`).
  - Kcal for selected portion (right-aligned, updates live).
- **Macro summary bar**: 4 inline rows (Calories, Protein, Carbs, Fat) — planned vs. logged progress bars, same style as `NutritionPanel` from T-020.
- **Save button**: Calls `tracker.upsertDay`. Disabled until at least 1 meal is checked. Shows spinner while in-flight, success toast on completion.

> **Definition of Done:** Check 3 meals with different portion sizes, Save — confirm the `daily_logs` row is created in the DB. Reload the page — confirm checked state and portion multipliers are restored from the DB (not localStorage). Navigate to the next day — confirm the page resets to that day's planned meals.

---

### T-028 · Progress Charts `M` `P1`

**Goal:** Show the user how their actual intake trends compare to their calorie target over time.

#### Backend

Add to `apps/api/src/routers/tracker.router.ts`:

- **`tracker.weeklySummary`** — `protectedProcedure` query. Returns last 7 days of `DailyLog` data + `ChefProfile.dailyCalorieTarget`. Each day: `{ date, totalKcal, totalProtein, totalCarbs, totalFat, hasLog: boolean }`.
- **`tracker.monthlySummary`** — same for last 28 days.

#### Frontend

**On `/dashboard`**, below the existing Weekly Outlook card, add a `WeeklyProgressChart` client component:

- Install `recharts` if not already present: `pnpm add recharts`.
- **Line chart**: X-axis = last 7 days. Two lines: `"Logged"` (solid orange) + `"Target"` (dashed grey). Y-axis = kcal. Tooltips on hover.
- **Stacked bar chart**: X-axis = last 7 days. 3 stacked segments per bar: Protein (blue) / Carbs (green) / Fat (yellow). Tooltip shows each macro in grams.

Build `apps/web/src/app/(dashboard)/progress/page.tsx`:

- Same two charts with the 28-day `monthlySummary` data.
- Add a third chart: **Weight trend line** (reuses data from T-029 once that's implemented; shows empty state if no weight data yet).
- Add a stat summary row: `Current streak: X days logged · Average kcal: X · Vs. target: ±X%`.

> **Definition of Done:** Log data for 3+ days via T-027. Navigate to `/dashboard` — confirm both charts render with correct values. Navigate to `/progress` — confirm charts extend to the full 28-day range. Hover a bar — confirm tooltip shows correct macro breakdown.

---

### T-029 · Weight Tracking & Goal Progress `M` `P2`

#### Database

```prisma
model WeightEntry {
  id         String   @id @default(cuid())
  userId     String
  weightKg   Float
  recordedAt DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, recordedAt])
  @@map("weight_entries")
}
```

Run `pnpm db:migrate`. Run `pnpm db:generate`.

#### Backend

Add to `tracker.router.ts`:

- **`tracker.logWeight`** — `protectedProcedure` mutation. Input: `{ weightKg: number; date?: string }`. Creates a `WeightEntry`. Returns the new entry.
- **`tracker.weightHistory`** — `protectedProcedure` query. Input: `{ days?: number }` (default 90). Returns `WeightEntry[]` sorted ascending.

#### Frontend

On `/progress`:

- **Weight log widget**: Number input (kg or lbs based on `ChefProfile.deliveryCurrency`... wait, weight units are not the same as currency. Use a `ChefProfile.weightUnit` field: `'kg'` or `'lbs'` — if not already stored, default to `'kg'` and handle conversion client-side). Button `"Log today's weight"`. Calls `tracker.logWeight`.
- **Weight chart**: Recharts line chart. X-axis = date. Y-axis = weight. Single line with data points. Goal target line (dashed) derived from `ChefProfile.goal` + starting weight (earliest `WeightEntry`).
- **Summary stats** (below chart): Starting weight · Current weight · Change (Δ kg / lbs) · Estimated weeks to goal (based on average weekly rate of change).

> **Definition of Done:** Log 2+ weight entries on `/progress`. Confirm chart renders with a trend line. Confirm summary stats show non-zero values. Switch weight unit in Preferences — confirm chart labels update.

---

### T-030 · Email Notifications — Weekly Plan Ready `M` `P2`

#### Environment

Add `RESEND_API_KEY` to `.env.example` and `apps/api/src/lib/env.ts`. If absent, email is silently skipped (no error thrown). Add `emailNotifications Boolean @default(true)` to `ChefProfile`. Run `pnpm db:migrate`. Run `pnpm db:generate`.

#### Implementation

Create `apps/api/src/lib/email/email.service.ts` wrapping the Resend SDK. Create `apps/api/src/lib/email/templates/plan-ready.tsx` using React Email:

- Subject: `"Your Chefer meal plan for {weekRange} is ready 🍽️"`
- Body: A 7-day table (day name + meal names for B/L/D/S). Orange header. White rows. Footer with unsubscribe link.

After `mealPlan.generate` commits to DB in `MealPlanService`, fire-and-forget `emailService.sendPlanReady(user, plan)`. Use `setImmediate` or `void` to prevent blocking the tRPC response.

Extend `preferences.update` to handle `emailNotifications: boolean`. Add toggle in `/preferences` under a "Notifications" section.

> **Definition of Done:** With no `RESEND_API_KEY`: generate a plan — confirm no error in the API logs. With a valid key: generate a plan — confirm the email arrives at the user's address within 30 seconds. Disable notifications in Preferences — generate again — confirm no email is sent.

---

### T-031 · Shopping List Export — PDF & Share Link `M` `P2`

#### PDF Export

Install `@react-pdf/renderer` in `apps/web`:

```bash
pnpm --filter web add @react-pdf/renderer
```

Create `apps/web/src/features/shopping-list/components/ShoppingListPDF.tsx` using `@react-pdf/renderer`. Layout: A4, Chefer header, grouped ingredient list (category headers, item rows with name + quantity). No prices in PDF (to avoid stale data issues). Footer: `"Generated by Chefer on {date}"`.

Wire a `"Download PDF"` button on the Shopping List page. On click, call `pdf(<ShoppingListPDF />).toBlob()` and trigger a browser download. This is entirely client-side — no server call needed.

#### Share Link

Add to `apps/api/src/routers/shopping-list.router.ts`:

- **`shoppingList.createShareToken`** — `protectedProcedure` mutation. Input: `{ planId: string }`. Signs a JWT (`{ planId, userId, exp: now + 24h }`) using `process.env.SESSION_SECRET`. Returns `{ token, shareUrl }` where `shareUrl = "{NEXTAUTH_URL}/share/shopping-list/{token}"`.

Build `apps/web/src/app/share/shopping-list/[token]/page.tsx` (public route — no auth required):

- Server component. Verifies JWT using `SESSION_SECRET`. Fetches shopping list via `serverClient.shoppingList.getForWeek` (using `planId` from the token). Renders a read-only version of the ingredient list (no checkboxes, no store panel, no prices). If token is invalid or expired, render `"This link has expired or is invalid."`.

Wire a `"Share"` button on the Shopping List page that calls `shoppingList.createShareToken`, copies the returned `shareUrl` to the clipboard, and shows a toast `"Link copied! Valid for 24 hours."`.

> **Definition of Done:** Click "Download PDF" — confirm file downloads and renders correctly. Click "Share" — confirm URL is copied. Open URL in incognito — confirm list renders without login. Manually modify the token — confirm the page shows the expired error.

---

### T-032 · AI Chat — Ask Your Chef `XL` `P2`

**Note:** This task uses a Next.js Route Handler (the only exception to the tRPC-only rule for streaming).

#### Backend

Build `apps/web/src/app/api/chat/route.ts`:

- Verifies `chefer_session` cookie using the same session resolution function used in `auth.middleware.ts` — extract this logic into `apps/api/src/lib/session.ts` and share it.
- Accepts POST: `{ messages: ChatMessage[]; context?: { activePlanId?: string } }`.
- Calls `aiService.chat(messages, context)` from the shared AI service factory.
- Mock mode: streams pre-written responses from `apps/api/src/lib/ai/fixtures/chat-responses.fixture.ts` word-by-word with ~30ms inter-word delay using `ReadableStream`.
- Live mode: uses the Vercel AI SDK `StreamingTextResponse` + Claude or OpenAI streaming.
- Unauthenticated requests: return `Response.json({ error: 'Unauthorized' }, { status: 401 })`.

Extend `MockAIService.chat()` in `apps/api/src/lib/ai/mock.ts` with a fixture set that covers common questions: ingredient substitutions, recipe scaling, dietary adjustments, shopping tips.

#### Frontend

Create `apps/web/src/features/chat/components/ChatWidget.tsx`:

- Fixed `position-fixed bottom-6 right-6` FAB button (orange circle, `MessageCircle` icon from lucide-react).
- Click opens a `450px × 600px` panel (slide-up CSS transition, `position-fixed bottom-24 right-6`).
- Panel header: `"Ask Your Chef 🍳"` + close `×` button.
- Message area: scrollable list of messages (user = right-aligned, assistant = left-aligned with a `C` avatar). Streams assistant responses word-by-word.
- Input bar: `<input>` + Send button. On Enter or Send click, appends user message and triggers fetch.
- Suggested prompts (shown when no messages): `"What can I substitute for chicken?"`, `"Make me a high-protein breakfast"`, `"How do I meal prep quinoa?"`.
- Chat history stored in `sessionStorage` (max 20 messages). Persists across page navigation within the session.
- Use `useChat` from the `ai` package (Vercel AI SDK): `pnpm --filter web add ai`.

Add `<ChatWidget />` to `apps/web/src/app/(dashboard)/layout.tsx` so it appears on all dashboard pages.

> **Definition of Done:** Click the FAB — confirm the panel opens. Type a message — confirm it streams back a response. Navigate to another page — confirm chat history persists. Click a suggested prompt — confirm it auto-sends. Unauthenticated request to `/api/chat` — confirm 401 response.

---

## 6. Phase 5 — Production Hardening (T-033 to T-040)

### T-033 · Responsive Design Audit & Mobile Polish `L` `P1`

**Breakpoints to test:** 375px (iPhone SE), 390px (iPhone 14 Pro), 768px (iPad), 1280px (laptop), 1440px (desktop).

**Required changes per page:**

| Page | Mobile Change |
|---|---|
| `/meal-plan` | Grid collapses to 1-day swipeable carousel. `DayRecapBar` remains visible. Day pills in header become a horizontally scrollable strip. |
| `/dashboard` | Two-column layout stacks vertically: NutritionPanel moves below left column. Recent Favourites remains horizontal scroll. |
| `/shopping-list` | Two-column layout stacks. StorePanel moves below IngredientList. |
| `/recipes` | Grid goes from 3-col to 1-col on mobile. |
| `/recipes/[id]` | Single-column layout. Hero image full-width. Ingredients and Nutrition Facts stack. |
| `/preferences` | Full single column. All form sections stack. |
| **Navigation** | Sidebar converts to a bottom tab bar (5 primary items: Dashboard, Meal Planner, Recipes, Shopping List, More). The `More` tab opens a sheet with remaining items. |

**Touch targets:** All interactive elements must be `min-h-[44px]` on mobile.

**Sidebar collapse** (`apps/web/src/features/nav/components/side-bar.tsx`): Add `useMediaQuery('(max-width: 1024px)')` hook. Below 1024px, render the bottom tab bar instead of the sidebar. The top header is hidden on mobile (avatar moves to the bottom bar's `More` sheet).

> **Definition of Done:** Open Chrome DevTools → iPhone 14 Pro (390px). Navigate each page listed — confirm no horizontal overflow. Swipe the meal plan grid — confirm it navigates days. Tap all interactive elements — confirm all are ≥ 44px tall. Run Lighthouse → Mobile → confirm score > 75.

---

### T-034 · Error Handling & Empty States `M` `P1`

**Pages requiring `loading.tsx` skeletons** (if not already added):

`/meal-plan`, `/dashboard`, `/preferences`, `/tracker`, `/history`, `/recipes`, `/progress`, `/shopping-list` — every data-fetching page must have a `loading.tsx` with proportional placeholder shapes matching the final layout.

**`apps/web/src/app/error.tsx`**: Generic error boundary. Show: Chefer logo, `"Something went wrong"` heading, error message (dev only), `"Try again"` button that calls `reset()`, `"Go to Dashboard"` link.

**`apps/web/src/app/not-found.tsx`**: 404 page. Show: a food-bowl illustration, `"Page not found"`, `"The page you're looking for doesn't exist or has been moved."`, `"← Go back home"` link.

**Per-page empty states** (ensure all are implemented):

| Page | Empty State |
|---|---|
| `/meal-plan` | No active plan: illustration + "Generate My Week" CTA |
| `/history` | No past plans: illustration + "Go to Meal Planner" CTA |
| `/recipes` (All tab) | No recipes: illustration + "Go to Meal Planner" CTA |
| `/recipes` (Saved tab) | No saved: copy + link to All tab |
| `/tracker` | No plan for today: copy + link to Meal Planner |
| `/shopping-list` | No plan: illustration + "Go to Meal Planner" CTA |
| `/progress` | No log data: copy + link to Tracker |

> **Definition of Done:** Break the API URL in `.env.local` and reload each page — confirm error boundaries render cleanly. Navigate to `/nonexistent-page` — confirm 404 page renders. Throttle to Slow 3G — confirm skeleton loaders appear before content on all data pages.

---

### T-035 · Accessibility (a11y) Baseline `M` `P1`

**Target:** 0 critical axe-core violations on all pages.

**Checklist:**

- All `<img>` elements (including `next/image`) have non-empty `alt` attributes. Exception: decorative images use `alt=""`.
- All interactive elements (`<button>`, `<a>`, `<input>`) have a visible label or `aria-label`.
- Focus ring is visible on all interactive elements: add `focus:ring-2 focus:ring-orange-500 focus-visible:outline-none` to the Tailwind base layer.
- Colour contrast ≥ 4.5:1 for body text. Run contrast check on: muted text (`text-muted`), badge text, disabled button text.
- Meal plan grid: each `MealCard` link has `aria-label="View recipe: {recipeName}, {mealType}, {kcal} kcal"`.
- Shopping list checkboxes: `aria-label="{ingredientName}, {quantity}"`.
- Skeleton loaders: add `aria-busy="true" aria-label="Loading…"` to the wrapper `<div>`.
- `StarRatingWidget` (T-026): each star button has `aria-label="{n} star"` and `aria-pressed={isSelected}`.
- Onboarding wizard steps: add `aria-live="polite"` on the step container so screen readers announce step changes.

> **Definition of Done:** Install axe DevTools browser extension. Run on `/meal-plan`, `/dashboard`, `/recipes/[id]`, `/onboarding`, `/preferences`, `/shopping-list`. Confirm 0 critical violations. Keyboard-navigate the meal plan grid — confirm Tab moves between cards and Enter navigates to the recipe detail page.

---

### T-036 · Performance — Core Web Vitals `L` `P1`

**Targets:** Lighthouse Performance > 85 (desktop), LCP < 2.5s, CLS < 0.1, FID/INP < 200ms.

**Required optimisations:**

1. **Background generation queue:** Move `mealPlan.generate` to a queue (use BullMQ + Redis, or a lightweight in-memory queue if Redis is not available). The mutation returns `{ jobId }` immediately. Add `mealPlan.getGenerationStatus` — `protectedProcedure` query: input `{ jobId }`, returns `{ status: 'pending' | 'complete' | 'failed'; plan?: ... }`. The `GenerateOverlay` component in T-018 polls this every 2 seconds until `status !== 'pending'`. This prevents tRPC requests timing out on slow LLM calls. **Note:** In mock mode, generation is instant — the queue still exists but resolves immediately.

2. **Image optimisation:** Ensure all `<Image>` components have a correct `sizes` prop. Example for recipe cards: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`.

3. **Parallel data fetching:** On `/dashboard`, confirm `dashboard.summary` is called as a single batched query (already implemented). On `/preferences`, confirm `preferences.get` and `chefProfile.get` are not waterfalled.

4. **Route segment prefetching:** Verify Next.js `<Link prefetch>` is used on the sidebar nav items so page transitions feel instant.

5. **TanStack Query stale-while-revalidate:** Set `staleTime: 60_000` on `mealPlan.getActive` and `preferences.get` in the tRPC client config — these change rarely and can be served from cache.

> **Definition of Done:** Run Lighthouse (Desktop) on `/meal-plan` — confirm score > 85. Run on `/dashboard` — same. Check the Network tab: confirm `dashboard.summary` is a single batched request. Throttle to Slow 3G — confirm no layout shift when meal plan grid loads.

---

### T-037 · End-to-End Tests with Playwright `L` `P2`

The Playwright config exists at `tests/playwright.config.ts`. All tests run with `AI_MOCK_ENABLED=true`.

**Test files to create in `tests/e2e/`:**

**`onboarding.spec.ts`**
1. Register a new user.
2. Confirm redirect to `/onboarding`.
3. Complete Step 1 (select "Lose Weight").
4. Complete Step 2 (fill all metrics, confirm calorie preview appears).
5. Complete Step 3 (select 2 diet types, add an allergy chip).
6. Complete Step 4, click Finish.
7. Assert redirect to `/dashboard`.
8. Assert sidebar renders with all 9 items.

**`meal-plan.spec.ts`**
1. Log in as `alice@chefer.dev`.
2. Navigate to `/meal-plan`.
3. Click "Regenerate Weekly Plan".
4. Wait for the overlay to appear and disappear.
5. Assert 7 column headers are visible (Mon–Sun).
6. Assert each column has ≥ 3 meal cards.
7. Click the Monday breakfast card.
8. Assert navigation to `/recipes/[id]`.
9. Assert recipe name, at least 3 ingredients, and step 1 of instructions are visible.
10. Click "← Back to Meal Planner".
11. Assert navigation back to `/meal-plan`.

**`swap.spec.ts`**
1. Log in as `alice@chefer.dev` with an active plan.
2. Navigate to `/recipes/[id]?planId=...&day=0&meal=breakfast` for any recipe.
3. Click "Swap Recipe".
4. Assert spinner appears on the button.
5. After redirect, assert the new recipe name is different from the original.

**`shopping-list.spec.ts`**
1. Log in as `alice@chefer.dev`.
2. Navigate to `/shopping-list`.
3. Assert at least 5 category sections are visible.
4. Assert at least 10 ingredient rows are present.
5. Assert the StorePanel shows 3 store tiles.
6. Click a store tile — assert it becomes selected (orange border).
7. Assert the OrderSummary shows a non-zero total.
8. Check an ingredient row checkbox.
9. Assert the progress bar increments.
10. Reload the page.
11. Assert the checked item is still checked (localStorage persistence).

**`preferences.spec.ts`**
1. Log in as `alice@chefer.dev`.
2. Navigate to `/preferences`.
3. Change the goal from current to "Gain Muscle".
4. Change the delivery address to a test address.
5. Click Save.
6. Assert a success toast appears.
7. Reload the page.
8. Assert the goal shows "Gain Muscle" and the delivery address is populated.

**`history.spec.ts`**
1. Log in as `alice@chefer.dev` (with at least 1 meal plan).
2. Navigate to `/history`.
3. Assert at least 1 plan card is visible.
4. Assert the card shows a date range and recipe preview chips.
5. Click "View" — assert navigation to `/history/[planId]`.
6. Assert the meal grid renders without Swap or Regenerate buttons.

**CI Configuration:**

Create `.github/workflows/e2e.yml`:
- Trigger: push to `main`, pull request to `main`.
- Steps: checkout, install Node, `pnpm install`, `pnpm db:push`, `pnpm db:seed`, `pnpm test:e2e`.
- Upload `playwright-report/` as a workflow artifact.

> **Definition of Done:** `pnpm test:e2e` passes all 5 suites locally. Open `playwright-report/index.html` — confirm all steps show green.

---

### T-038 · Environment Config & Deployment (Vercel) `M` `P1`

**Vercel configuration:**

1. Create a Vercel project linked to the GitHub repo.
2. Set the following env vars in Vercel project settings (Production and Preview):
   - `DATABASE_URL` — Neon PostgreSQL or Vercel Postgres connection string.
   - `SESSION_SECRET` — 32-byte random hex (generate with `openssl rand -hex 32`).
   - `AI_MOCK_ENABLED` — `false` in Production, `true` in Preview.
   - `GROCERY_AI_MOCK_ENABLED` — `true` in both (Phase 1; set to `false` in Phase 2).
   - `AI_PROVIDER` — `anthropic` or `openai`.
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — Production only.
   - `RESEND_API_KEY` — Production only (T-030).
   - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` — Production only (T-040).
3. Set the build command to: `prisma generate && pnpm --filter web build`.
4. Set the output directory to `apps/web/.next`.
5. Configure the Vercel API server for `apps/api` (use Vercel Functions or a Railway/Render deployment for the Express server; document whichever approach is chosen in `infrastructure.md`).

**Health check:** `GET /api/health` must return `{ ok: true }` on the production domain before merge to main.

> **Definition of Done:** Preview deployment URL loads the app. `/api/health` returns 200. Log in with `alice@chefer.dev` seed account. Confirm dashboard and meal plan render correctly in preview (`AI_MOCK_ENABLED=true`).

---

### T-039 · Analytics & Usage Monitoring `M` `P2`

**Client analytics (Vercel Analytics or PostHog):**

Install `@vercel/analytics` or `posthog-js`. Add the provider to `apps/web/src/app/layout.tsx`.

Track the following custom events from client components:

| Event | Trigger | Properties |
|---|---|---|
| `plan_generated` | After `mealPlan.generate` succeeds | `{ planId, weekOffset: 0 }` |
| `recipe_swapped` | After `mealPlan.swapRecipe` succeeds | `{ recipeId, mealType }` |
| `shopping_list_opened` | On `/shopping-list` page mount | `{ weekOffset }` |
| `store_selected` | When user clicks a StoreTile | `{ storeId, storeName }` |
| `recipe_favourited` | After `recipe.toggleFavourite` (saves) | `{ recipeId }` |
| `recipe_rated` | After `recipe.rate` | `{ recipeId, rating }` |
| `chat_message_sent` | After chat message submit | `{ messageCount }` |

**Server monitoring (Sentry):**

```bash
pnpm add @sentry/nextjs @sentry/node
```

Init Sentry in `apps/api/src/index.ts` and `apps/web/src/app/layout.tsx`. Capture: unhandled tRPC errors, failed AI service calls, Prisma errors. Add `SENTRY_DSN` to `.env.example`.

**Admin stats endpoint:**

Add to `apps/api/src/routers/` a new `admin.router.ts`:

- **`admin.stats`** — `adminProcedure` query (already protected to ADMIN role). Returns:
  - `totalUsers: number`
  - `plansGeneratedToday: number`
  - `plansGeneratedThisWeek: number`
  - `plansGeneratedAllTime: number`
  - `avgRecipesPerPlan: number`
  - `topRatedRecipes: { name, avgRating }[]` (top 5)

> **Definition of Done:** Generate a plan — confirm `plan_generated` event appears in the analytics dashboard. Log in as `admin@chefer.dev`, call `trpc.admin.stats` from browser console — confirm stats return. Trigger a deliberate error — confirm it appears in Sentry.

---

### T-040 · Subscription & Paywall — Future-Ready Stub `XL` `P2`

#### Database

Add to `User` in schema:

```prisma
enum SubscriptionPlan { FREE PRO }
subscriptionPlan SubscriptionPlan @default(FREE)
```

Run `pnpm db:migrate`. Run `pnpm db:generate`.

#### Subscription Guards

Create `apps/api/src/lib/subscription/subscription.guard.ts`:

```ts
export function requirePro(ctx: Context, feature: string): void {
  if (ctx.user.subscriptionPlan === 'FREE') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${feature} requires a PRO subscription.`,
    });
  }
}
```

Apply to:
- `mealPlan.generate` — throw `FORBIDDEN` if FREE user has already generated 1 plan this week.
- `mealPlan.list` — truncate result to 4 most recent weeks for FREE users.
- `/api/chat` route — return 403 for FREE users.

#### Upgrade Modal

Create `apps/web/src/features/subscription/components/UpgradeModal.tsx`:

- A `Dialog` (from `packages/ui` or a Radix UI `Dialog` primitive).
- Feature comparison table: FREE vs PRO columns. Key features: plan generations per week, history access, AI chat, priority support.
- `"Upgrade to PRO"` orange button → calls `subscription.createCheckoutSession` → redirects to Stripe Checkout URL.

#### Stripe Integration

Add `subscription.createCheckoutSession` — `protectedProcedure` mutation:
- Uses Stripe SDK to create a Checkout Session in `subscription` mode.
- Returns `{ checkoutUrl: string }`.

Build `apps/web/src/app/api/stripe-webhook/route.ts`:
- Verifies Stripe signature using `STRIPE_WEBHOOK_SECRET`.
- Handles `checkout.session.completed`: updates `User.subscriptionPlan` to `PRO`.

> **Definition of Done:** Log in as `alice@chefer.dev` (FREE). Generate 1 plan — confirm success. Try to generate a second plan — confirm the upgrade modal appears. Click "Upgrade to PRO" — confirm Stripe Checkout opens with test mode. Use test card `4242 4242 4242 4242` — confirm user is upgraded to PRO and all restrictions are removed.

---

## 7. Effort & Priority Summary

| Task | Description | Effort | Priority | Phase |
|---|---|---|---|---|
| T-023B | Smart Shopping List (full redesign + grocery AI) | XL (10–14h) | P0 | 3 |
| T-024 | Meal plan history & archives | M (3–4h) | P1 | 3 |
| T-026 | Meal ratings & feedback loop | M (3–4h) | P2 | 3 |
| T-027 | Calorie & macro tracking | L (5–8h) | P1 | 4 |
| T-028 | Progress charts | M (3–4h) | P1 | 4 |
| T-029 | Weight tracking | M (3–4h) | P2 | 4 |
| T-030 | Email notifications | M (3–4h) | P2 | 4 |
| T-031 | Shopping list PDF & share | M (3–4h) | P2 | 4 |
| T-032 | AI chat | XL (8–12h) | P2 | 4 |
| T-033 | Responsive design | L (5–8h) | P1 | 5 |
| T-034 | Error handling & empty states | M (3–4h) | P1 | 5 |
| T-035 | Accessibility | M (3–4h) | P1 | 5 |
| T-036 | Performance | L (5–8h) | P1 | 5 |
| T-037 | E2E tests | L (5–8h) | P2 | 5 |
| T-038 | Deployment | M (3–4h) | P1 | 5 |
| T-039 | Analytics & monitoring | M (3–4h) | P2 | 5 |
| T-040 | Subscription & paywall | XL (8–12h) | P2 | 5 |
| **Total** | | **~100–140h** | | |

**Recommended execution order:**
1. T-023B (Shopping List redesign — highest visibility, P0)
2. T-024 (History — completes Phase 3)
3. T-027 → T-028 (Tracker + Charts — closes the product feedback loop)
4. T-033 → T-035 → T-034 → T-036 (Production quality)
5. T-038 (Deploy — needed before any P2 features)
6. T-026, T-029, T-030, T-031, T-032, T-037, T-039, T-040 (in any order)

---

## 8. Complete Test Plan

This section documents every scenario a Staff Engineer must verify after completing each task. Run all scenarios with `AI_MOCK_ENABLED=true` and `GROCERY_AI_MOCK_ENABLED=true` unless noted.

---

### Scenario Group A — Shopping List (T-023B)

**A-1: Basic render**
1. Log in as `alice@chefer.dev` (with an active meal plan).
2. Navigate to `/shopping-list`.
3. ✅ Page title shows "Shopping List" and eyebrow "THIS WEEK".
4. ✅ Week label shows the current week's date range (e.g. "Week of 16 Mar – 22 Mar").
5. ✅ At least 5 ingredient category sections are visible.
6. ✅ Each ingredient row shows: thumbnail image, name, quantity, price, and availability badge.
7. ✅ The StorePanel on the right shows exactly 3 store tiles (LIDL, Carrefour, Kaufland).
8. ✅ LIDL tile shows a "★ Best Value" badge.
9. ✅ The OrderSummary shows a subtotal, tax, delivery fee, and total for the selected store.
10. ✅ ChefsTipCard is visible with a non-empty tip.

**A-2: Week navigation**
1. Click `← Previous` — week label changes to the prior week.
2. ✅ If a plan exists for that week, ingredient rows update.
3. ✅ If no plan exists for that week, empty state renders with "No meal plan for this week".
4. Click `Next →` — returns to current week.
5. ✅ `Next →` is disabled when on the current week (weekOffset = 0).
6. ✅ `← Previous` is disabled after 52 steps back.

**A-3: In-Store / Delivery toggle**
1. Default mode: In-Store.
2. ✅ Aisle hints are visible below each ingredient name (e.g. "Produce Section • Organic").
3. Click "Delivery" toggle.
4. ✅ Aisle hints are replaced by delivery notes (e.g. "Ships within 2 hours").
5. ✅ OrderSummary shows delivery fee line (> €0 for LIDL).
6. Click "In-Store" toggle.
7. ✅ Aisle hints return. Delivery fee line disappears.

**A-4: Store selection**
1. Click the Carrefour tile.
2. ✅ Carrefour tile gets an orange border.
3. ✅ LIDL tile loses its border.
4. ✅ OrderSummary updates to show Carrefour prices (different from LIDL).
5. ✅ Prices on each ingredient row update to Carrefour prices.
6. Click Kaufland.
7. ✅ Kaufland tile is selected. Prices update again.

**A-5: Availability badges**
1. ✅ At least 2 items show "🟡 Limited" badge.
2. ✅ At least 1 item shows "🔴 Not Available" badge.
3. ✅ "Not Available" items still render in the list (they are not hidden).
4. ✅ The OrderSummary shows `"{n} items not available"` note when > 0.

**A-6: Checkbox & persistence**
1. Check 3 ingredient rows.
2. ✅ Progress bar increments from `0/{total}` to `3/{total}`.
3. ✅ Checked items get strikethrough text.
4. ✅ Checked items show a grey "✓ BOUGHT" pill replacing the availability badge.
5. Reload the page.
6. ✅ All 3 items are still checked (localStorage persistence).
7. Navigate to the previous week and back.
8. ✅ Current week's checked items are still persisted.

**A-7: Location resolution**
1. Allow browser location permission.
2. ✅ A "📍 Using your current location" badge appears in the page header.
3. ✅ Store distances update (mock: always shows fixture distances).
4. Deny location permission.
5. Set a delivery address in `/preferences` (e.g. "Str. Exemplu 12, Sector 1, București").
6. Navigate to `/shopping-list`.
7. ✅ Badge shows "📍 Using delivery address: Str. Exemplu 12...".
8. Clear both location and address.
9. ✅ A banner prompts the user to set a delivery address in Preferences.

**A-8: Loading states**
1. Throttle network to Slow 3G in Chrome DevTools.
2. Navigate to `/shopping-list`.
3. ✅ Skeleton rows appear in the ingredient list before content loads.
4. ✅ StorePanel shows spinner with "Finding nearby stores…" before store data loads.
5. ✅ Ingredient rows show `—` for prices while store search is in-flight.
6. ✅ After both requests complete, full data renders without layout shift.

**A-9: Empty state**
1. Log in as a user with no active or recent meal plan.
2. Navigate to `/shopping-list`.
3. ✅ Empty state illustration and heading "No meal plan for this week" render.
4. ✅ "Go to Meal Planner" CTA button is visible and navigates to `/meal-plan`.

**A-10: Preferences delivery address**
1. Navigate to `/preferences`.
2. ✅ A "Shopping & Delivery" section is visible below the existing dietary sections.
3. Enter a delivery address and select a currency.
4. Click Save.
5. ✅ Success toast appears.
6. Reload `/preferences`.
7. ✅ The delivery address and currency are pre-populated.

---

### Scenario Group B — Meal Plan History (T-024)

**B-1: History list**
1. Generate 2+ plans for `alice@chefer.dev`.
2. Navigate to `/history`.
3. ✅ At least 2 plan cards render with date ranges and recipe preview chips.
4. ✅ The active plan shows an "ACTIVE" orange badge.
5. ✅ Archived plans show a grey "ARCHIVED" badge.
6. ✅ Each card shows the average daily kcal/protein/carbs/fat.

**B-2: Restore a plan**
1. Click "Restore" on an archived plan.
2. ✅ A spinner appears on the button while the mutation is in-flight.
3. ✅ A success toast appears after completion.
4. ✅ The restored plan shows an "ACTIVE" badge.
5. ✅ The previously active plan now shows "ARCHIVED".
6. Navigate to `/meal-plan`.
7. ✅ The restored plan's recipes are displayed in the week grid.

**B-3: Read-only view**
1. Click "View" on any plan.
2. ✅ Navigate to `/history/[planId]`.
3. ✅ The full 7-day meal grid renders correctly.
4. ✅ No "Regenerate" button is visible.
5. ✅ No "Swap Recipe" button is visible on the meal cards.
6. ✅ A "← Back to History" link is visible and navigates correctly.
7. ✅ The `DayRecapBar` is visible but the tracker chevron link is absent.

**B-4: Pagination**
1. Generate 12+ plans (or seed the DB with extra plan rows).
2. Navigate to `/history`.
3. ✅ The first 10 cards render.
4. Click "Load more".
5. ✅ The next page of plans appends to the list.
6. ✅ The "Load more" button disappears when all plans are loaded.

---

### Scenario Group C — Meal Ratings (T-026)

**C-1: Rating widget visibility**
1. Navigate to `/recipes/[id]?day=0` where day 0 was in the past (e.g. Monday and today is Wednesday).
2. ✅ The `StarRatingWidget` is visible at the bottom of the page.
3. Navigate to `/recipes/[id]?day=6` (Sunday, future day).
4. ✅ The `StarRatingWidget` is NOT visible.
5. Navigate to `/recipes/[id]` (no day param).
6. ✅ The `StarRatingWidget` is NOT visible.

**C-2: Submit a rating**
1. Click 4 stars in the widget.
2. Optionally enter notes.
3. Click "Save Rating".
4. ✅ Success toast appears.
5. Reload the page.
6. ✅ 4 stars are pre-selected.
7. ✅ Notes field is pre-populated.

**C-3: Recipe list badges**
1. After rating a recipe 4+ stars, navigate to `/recipes`.
2. ✅ The rated recipe card has a gold star badge in its top-left corner.
3. Rate a different recipe 1 star.
4. ✅ That recipe does NOT have a gold star badge.

---

### Scenario Group D — Calorie Tracker (T-027)

**D-1: Pre-populated meals**
1. Navigate to `/tracker`.
2. ✅ Today's date is shown in the header.
3. ✅ Today's planned meals from the active plan are pre-populated.
4. ✅ Each row shows: checkbox, recipe name, meal type badge, portion selector, kcal.

**D-2: Log meals**
1. Check 2 meal rows.
2. Change one portion to `2×`.
3. ✅ The macro summary bar updates (kcal for the 2× meal doubles).
4. Click Save.
5. ✅ Success toast appears.
6. Reload the page.
7. ✅ Both meals are pre-checked with their saved portion sizes.
8. ✅ Macro bars reflect the saved totals.

**D-3: Day navigation**
1. Click `← Previous day` from today.
2. ✅ Yesterday's planned meals are pre-populated.
3. ✅ If yesterday was already logged, checked state reflects the saved log.
4. Click `Next day →`.
5. ✅ Returns to today.
6. Attempt to navigate to tomorrow.
7. ✅ `Next day →` button is disabled for future dates.

---

### Scenario Group E — Progress Charts (T-028)

**E-1: Dashboard charts**
1. Log tracker data for 3 days.
2. Navigate to `/dashboard`.
3. ✅ A weekly calorie line chart is visible with 2 lines (Logged + Target).
4. ✅ The logged line shows data for the days logged; flat/zero for unlogged days.
5. ✅ A macros stacked bar chart is visible.
6. Hover a bar — ✅ tooltip shows kcal/macro values for that day.

**E-2: Progress page charts**
1. Navigate to `/progress`.
2. ✅ Both charts show 28-day range.
3. ✅ Days without logged data are shown as zero/flat.
4. ✅ A weight chart is visible (may be empty with a "Log your first weight" state).

---

### Scenario Group F — End-to-End (T-037)

Run `pnpm test:e2e` and confirm all the following pass:

| Test File | Expected Result |
|---|---|
| `onboarding.spec.ts` | ✅ All 8 steps pass |
| `meal-plan.spec.ts` | ✅ All 11 steps pass |
| `swap.spec.ts` | ✅ All 5 steps pass |
| `shopping-list.spec.ts` | ✅ All 11 steps pass |
| `preferences.spec.ts` | ✅ All 8 steps pass |
| `history.spec.ts` | ✅ All 6 steps pass |

---

### Scenario Group G — Production Readiness (T-033 to T-040)

**G-1: Mobile responsiveness**
1. Open Chrome DevTools → iPhone 14 Pro (390px).
2. ✅ `/meal-plan` shows a 1-day carousel, not a 7-column grid.
3. ✅ Swiping left/right changes the displayed day.
4. ✅ `/dashboard` stacks into a single column.
5. ✅ `/shopping-list` stacks (ingredient list above store panel).
6. ✅ Bottom tab bar is visible on all pages (replaces sidebar).
7. ✅ All tap targets are ≥ 44px.

**G-2: Accessibility**
1. Run axe DevTools on `/meal-plan`, `/dashboard`, `/recipes/[id]`, `/shopping-list`, `/onboarding`.
2. ✅ 0 critical violations on each page.
3. Tab through `/shopping-list` — ✅ focus ring visible on all interactive elements.

**G-3: Error boundaries**
1. Break the API URL in `.env.local` (set to a non-existent port).
2. Navigate to `/meal-plan`.
3. ✅ Error boundary renders with "Something went wrong" and a retry button.
4. Click retry.
5. ✅ The page retries the API call (still fails, but the retry button works).
6. Restore the URL.
7. ✅ Page loads correctly after retry.

**G-4: Performance**
1. Run Lighthouse (Desktop) on `/meal-plan` and `/dashboard`.
2. ✅ Score > 85 on both pages.
3. ✅ LCP < 2.5s.
4. ✅ CLS < 0.1.

**G-5: Deployment health**
1. Push to `main`.
2. Vercel preview deployment completes.
3. Navigate to `{preview-url}/api/health`.
4. ✅ Returns `{ ok: true, timestamp }`.
5. Log in with `alice@chefer.dev` credentials.
6. ✅ Dashboard, Meal Planner, Shopping List all load without errors.

---

## 9. Environment Variables Reference

All variables should be added to `.env.example` and validated with Zod in `apps/api/src/lib/env.ts`.

| Variable | Default | Phase | Purpose |
|---|---|---|---|
| `DATABASE_URL` | (required) | 0 | PostgreSQL connection string |
| `SESSION_SECRET` | (required) | 0 | JWT signing for sessions and share tokens |
| `NEXTAUTH_URL` | `http://localhost:3000` | 0 | App base URL |
| `AI_MOCK_ENABLED` | `true` | 2 | `true` = use fixture data; `false` = call real LLM |
| `AI_MOCK_DELAY_MS` | `0` | 2 | Artificial delay for mock responses (UX testing) |
| `AI_PROVIDER` | `anthropic` | 2 | `anthropic` or `openai` — ignored when mocked |
| `OPENAI_API_KEY` | (omit locally) | 2 | OpenAI API key — only when `AI_MOCK_ENABLED=false` |
| `ANTHROPIC_API_KEY` | (omit locally) | 2 | Anthropic API key — only when `AI_MOCK_ENABLED=false` |
| `GROCERY_AI_MOCK_ENABLED` | `true` | 3 (T-023B) | `true` = fixture stores; `false` = Claude web search |
| `GEOCODING_API_KEY` | (omit locally) | 3 (T-023B future) | Google Maps / Nominatim — for Phase 2 grocery AI |
| `RESEND_API_KEY` | (omit locally) | 4 | Transactional email — silently skipped if absent |
| `SENTRY_DSN` | (omit locally) | 5 | Sentry error tracking |
| `STRIPE_SECRET_KEY` | (omit locally) | 5 | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | (omit locally) | 5 | Stripe webhook signature verification |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | (optional) | — | Cloudinary image CDN (future migration from Unsplash) |

---

*This document supersedes the Shopping List section of `PersonalChef_PRD.md` (T-023). All other tasks from `PersonalChef_PRD.md` remain authoritative for their respective implementation details. This document adds the T-023B redesign and fills in the remaining task specifications at Staff Engineer detail level.*
