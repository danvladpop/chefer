# Implementation Plan — Recipe Image Generation Performance

Status: **implemented** · Scope: backend Tier 1 + Tier 2 image-pipeline improvements and UI improvements 1–4.

> Implementation note: browser testing revealed Pollinations' anonymous tier
> returns **429** on concurrent generation requests. HTTP 429 is now mapped to
> `ImagenRateLimitError` (worker backs off `Retry-After`/15 s without burning
> the recipe's retry budget) and worker concurrency was set to 3. Effective
> first-generation throughput is capped by Pollinations (~1 image / 15-20 s
> anonymously); the name-based CDN reuse remains the main win for repeats.
> For true parallel throughput, register for a Pollinations token or move to a
> paid Flux host (fal.ai / Together).

## Problem

Regenerating a meal plan creates ~21 recipes with `imageStatus: PENDING`. The
`RecipeImageWorker` processes **one** recipe per 5-second poll tick, and each job
blocks on a Pollinations pre-warm fetch (10–30 s). Full board ≈ 5–12 minutes.
The client SSE hook gives up after 3 minutes and paints remaining cards FAILED.
Every regenerate also produces fresh LLM-invented recipe IDs, so identical dishes
regenerate their image from scratch (seed is derived from recipe ID).

## Backend changes

### 1. Deterministic, content-based image URLs (Tier 2)

**Files:** `apps/api/src/lib/image-gen/pollinations.ts`, `apps/api/src/lib/image-gen/prompt.ts`

- Derive the Pollinations `seed` from `hash(normalize(recipeName) + '|' + normalize(cuisineType))`
  instead of `recipeId`.
- Build the prompt from **name + cuisine only** (drop the free-text description) so the
  full URL is stable across regenerations. Same dish ⇒ same URL ⇒ Pollinations CDN
  cache hit ⇒ near-instant.
- Reduce image size 800×600 → 512×384 (cards render ~200 px wide; Flux time scales
  with pixel count, ~2.4× fewer pixels ⇒ meaningfully faster first-generation).

### 2. Reuse images already in our DB (Tier 2)

**Files:** `packages/database/src/repositories/meal-plan.repository.ts` (+ compiled d.ts/js),
`apps/api/src/application/meal-plan/meal-plan.service.ts`

- `CreateRecipeData` gains optional `imageUrl`; repository `create` block persists
  `imageUrl: r.imageUrl ?? null` (currently hardcoded `null`).
- New repo method `findRecipeImagesByNames(names: string[])` → latest
  `{ name, imageUrl }` for recipes with `imageStatus: DONE` and a non-null URL.
- In `MealPlanService.generate`, before `upsertRecipes`:
  - If the AI/fixture recipe already carries an `imageUrl` → persist it with `imageStatus: DONE`.
  - Else if a DONE recipe with the same (case-insensitive) name exists → copy its URL, `DONE`.
  - Else → `PENDING` as today.
- `toRecipeDto` stops hardcoding `PENDING` and reflects the resolved status/URL, so
  reused images render instantly after generate.

### 3. Parallel, self-draining worker (Tier 1)

**File:** `apps/api/src/workers/recipe-image.worker.ts`

- `CONCURRENCY = 5`. Per drain pass: atomically claim up to 5 PENDING recipes
  (per-row `updateMany` guard stays, so it remains horizontal-scale safe), process with
  `Promise.allSettled`.
- Drain loop: after a batch, immediately claim the next batch until no PENDING remain
  or rate-limit back-off engages. The 5 s interval remains only as discovery fallback.
- `wake()` method: triggers an immediate tick; called by `MealPlanService.generate`
  (and `swapRecipe`) right after persisting, so images start with zero poll delay.
- Order the queue by new `imagePriority` (asc) then `createdAt`.

### 4. Priority column (feeds UI improvement 3)

**Files:** `packages/database/prisma/schema.prisma`, meal-plan service

- `Recipe.imagePriority Int @default(100)`.
- `generate()` computes per-recipe priority = distance in days from today for the
  slot's day (min across slots), so today's meals generate first, then tomorrow, etc.

**Expected outcome:** first images visible in ~10–15 s (today's meals), full board
≈ 60–90 s on first-ever generation, and near-instant for any dish generated before.

## UI changes (`apps/web`)

### 1. Intentional placeholders

**File:** `src/features/recipes/components/RecipeImage.tsx` (+ callers pass `cuisineType`)

- Replace the grey shimmer with a deterministic cuisine-tinted gradient + food emoji
  (hash of recipe name picks the gradient variant; cuisine picks the emoji).
- PENDING/GENERATING shows the gradient with a subtle pulse + small "Preparing photo"
  hint; FAILED shows the same gradient without the hint (looks intentional, not broken).

### 2. Progress pill

**File:** `src/app/(dashboard)/meal-plan/page.tsx`

- While any images are pending: pill next to Regenerate — "N of M photos ready",
  driven by the existing SSE overrides state. Disappears when all resolved.

### 3. Prioritised ordering

- Covered by `imagePriority` on the backend; no extra UI work.

### 4. Graceful SSE timeout

**File:** `src/hooks/useRecipeImageStream.ts`

- Raise client timeout 3 → 6 min.
- On timeout, do **not** fabricate FAILED. Close the stream and invoke a new optional
  `onTimeout` callback; the meal-plan page refetches the plan so statuses come from
  the DB (self-heals: still-pending recipes re-open a fresh SSE subscription).

## Out of scope (documented decisions)

- No BullMQ/Redis queue — DB polling + atomic claims is adequate at current scale.
- No provider switch — Pollinations stays; fal.ai/Together Flux schnell is the paid
  upgrade path if reliability becomes a problem.

## Verification

- Free path: curated plans have preset URLs — no generation at all.
- Premium regenerate (1 real AI call): confirm placeholders render immediately,
  progress pill counts up, today's column resolves first, no FAILED flashes,
  repeat dishes appear instantly.
