# Implementation Plan — Meal-Plan Image Fixes & Create Recipe Revamp

Status: **planned**

## Part A — Meal-plan image bugs (diagnosed)

### Symptoms

1. Unrelated images on some meals (e.g. Chicken and Veggie Skewers, Lamb Kofta).
2. Some cards show "Preparing photo…", others show a bare placeholder with no text.
3. Generated photos don't appear to stream in.

### Root causes (confirmed against the DB)

- **Stale-image resurrection via ID collision.** Gemini generates deterministic
  slug IDs (`recipe_<name>`). Rows created in **March 2026** — an early era when
  recipes were saved with hand-assigned/hallucinated Unsplash URLs (several
  different dishes literally share one photo ID) — get _updated_ by today's
  upsert, which intentionally preserves `imageUrl`/`imageStatus`. Result: months-old
  wrong photos marked DONE. These cards never subscribe to SSE (nothing pending),
  hence "photos don't stream in".
- **FAILED rows render a bare placeholder** (by design after the placeholder
  redesign) — indistinguishable from "waiting", which reads as broken.
- SSE itself is sound (flushes resolved state on connect, streams the rest).

### Fixes

1. `gemini.ts` — **null out `imageUrl`** on all recipes parsed from the live LLM
   (meal plan + swap). Only our pipeline and fixtures may supply image URLs.
2. `meal-plan.repository.upsertRecipes` — on the update path, when the incoming
   **name differs** from the stored name (ID collision with a different dish),
   reset the image fields (or apply the caller-resolved image). Same-name
   regenerations keep their image as before.
3. **One-time data repair**: AI-source `recipe_*` rows with Unsplash URLs →
   `imageUrl = null, imageStatus = PENDING`; FAILED rows → PENDING with reset
   retries. The worker then regenerates real photos via the normal pipeline.
4. `RecipeImage` — FAILED/broken-image placeholder gets a small "Photo
   unavailable" hint so it is distinguishable from "Preparing photo…".

## Part B — Create Recipe revamp

### B1. Ingredient catalog (extends the price vocabulary)

`IngredientPrice` grows into the single ingredient catalog:

| New column                                                                   | Purpose                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `caloriesPer100g/proteinPer100g/carbsPer100g/fatPer100g/fiberPer100g Float?` | macros for auto-nutrition                                          |
| `gramsPerPiece Float?`                                                       | count-unit → grams conversion ("1 medium banana ≈ 118 g")          |
| `imageUrl String?`                                                           | catalog thumbnail (custom ingredients)                             |
| `creatorId String?`                                                          | `null` = global vocabulary; set = user's private custom ingredient |

- `estimateIngredientPrices` (Gemini + mock) also returns macros + gramsPerPiece;
  the weekly worker treats macro-less rows as stale, so the existing 285
  price-only rows get macros on the next sweep.

### B2. New API surface

- `ingredients.search { query }` — prefix/substring match over global + own
  custom catalog rows (name, imageUrl, hasMacros).
- `ingredients.createCustom { name, imageUrl?, generateAiImage?, macros…, gramsPerPiece? }`
  — private catalog row (`creatorId`, source `USER`); `generateAiImage` builds a
  deterministic Pollinations URL from the name.
- `ingredients.computeNutrition { ingredients[], servings }` — server-side unit
  conversion (existing unit table + gramsPerPiece) × per-100g macros → per-serving
  `NutritionInfo`, plus the list of unmatched ingredient names (UI shows a
  coverage hint; unmatched names wake the price worker).
- `POST /api/uploads/image` — session-authenticated raw-body upload (≤ 5 MB,
  image/_), stored under `apps/api/uploads/`, served statically at `/uploads/_`.
  No new dependencies (no multipart — client sends raw bytes).
- `recipe.create/update` — unchanged shape; `imageUrl` can now be an uploaded
  `/uploads/...` URL or a generated Pollinations URL.

### B3. Form UX (`/recipes/new`)

- **Cuisine**: preset single-select chips (Italian, Mediterranean, Mexican, Asian,
  Thai, Japanese, Chinese, Indian, French, American, Middle Eastern, Romanian) +
  "Other…" free-text.
- **Dietary tags**: preset multi-select chips (vegan, vegetarian, gluten-free,
  dairy-free, keto, paleo, low-carb, high-protein, pescatarian, nut-free) +
  free-text add.
- **Image**: Upload from device (file picker — works from phone camera roll) or
  "Generate with AI" (deterministic Pollinations image from name + cuisine);
  live preview; raw URL field removed.
- **Ingredients**: searchable picker per row (debounced `ingredients.search`
  dropdown); "Create custom ingredient" modal when nothing matches (name, image
  upload/AI, per-100g macros, optional grams-per-piece); **unit becomes a
  dropdown** of the canonical units (g, kg, ml, l, tsp, tbsp, cup, piece, small,
  medium, large, clove, slice, can, bunch, pinch).
- **Nutrition**: auto-computed (read-only) from ingredients + servings via
  `computeNutrition`, with a coverage note when some ingredients are unrecognised
  and an "enter manually" fallback toggle.
- The edit page (`/recipes/[id]/edit`) keeps the old form for now — revamping it
  is a follow-up (same components can be lifted in).

## Verification

- Meal plan: repaired cards regenerate real photos and stream in via SSE; no
  duplicate/unrelated images; FAILED shows "Photo unavailable".
- Create recipe: search-pick ingredients, custom ingredient with AI image,
  auto-nutrition fills, upload works, recipe saves and renders.
