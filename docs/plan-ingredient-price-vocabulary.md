# Implementation Plan — Ingredient Price Vocabulary (store-agnostic)

Status: **planned** · Scope: baseline ingredient price estimates ("1 banana ≈ €0.30")
independent of any store, a periodic refresh job, persisted + premium-gated shopping
list regeneration, and the unit-mismatch merge bug fix.

## Goal

Before chasing per-store live prices, build the **vocabulary**: every ingredient the
app has ever seen, with an honest baseline price estimate in EUR. Store-specific
accuracy (scrapers, price books per chain) comes later and reuses this vocabulary.

## Price model — quantity-aware from day one

A single "price per banana" doesn't scale a 250 g spinach line. Prices are stored
per **base unit family**, and recipe quantities are converted:

```prisma
model IngredientPrice {
  ingredientName String   @id   // normalized lowercase
  pricePer100gEur  Float?      // mass-based ingredients
  pricePer100mlEur Float?      // volume-based
  pricePerPieceEur Float?      // count-based (1 medium banana, 1 egg, …)
  source         String   @default("AI_ESTIMATE")
  estimatedAt    DateTime @default(now())
}
```

Recipe units map to a family + factor (g/kg → mass; ml/l/tbsp≈15ml/tsp≈5ml/cup≈240ml
→ volume; piece/medium/large/clove/slices/can… → count). Item estimate =
`convertedQty × pricePerBase`; unknown units fall back to per-piece, else no price.

## Data flow

1. **Estimation** — new `IAIService.estimateIngredientPrices(names[])` returns the
   applicable per-base prices per ingredient (typical Romanian supermarket, EUR).
   Gemini implementation uses structured output (batches of ≤40); Mock returns
   deterministic hash-based prices so dev works offline. Logged as a new
   `AiCallType.INGREDIENT_PRICES`.
2. **Vocabulary build & refresh** — new `IngredientPriceWorker`:
   - On start: collects distinct ingredient names from **all recipes in the DB**
     (the vocabulary is self-building — every generated plan enriches it) and
     prices the missing ones.
   - Periodic sweep (every 12 h): re-estimates entries older than
     `PRICE_REFRESH_DAYS = 7` (weekly cadence for now; monthly = change constant).
   - `wake()` — called by the shopping-list service when it encounters unpriced
     ingredients, so new vocabulary gets priced within seconds, not next sweep.
3. **Serving** — `shoppingList.getForWeek` joins the vocabulary and returns
   `estimatedPriceEur` per item + `estimatedTotalEur`; the UI shows a per-item
   price chip and a week total, labeled as estimates.

## Also in this change (carried over from the review)

- **Persist regenerated lists** — new `ShoppingList` model (`planId` unique,
  `items Json`, `aiGenerated`). `regenerate` stores its result; `getForWeek`
  returns the stored AI list when one exists for the plan (re-resolving images
  and prices). No more paying for a Gemini call whose output evaporates on reload.
- **Premium-gate `shoppingList.regenerate`** (`premiumProcedure`) — consistent
  with the tier model; free users keep the deterministic merge.
- **Fix the unit-mismatch merge bug** — merge key becomes `name|unit`, so
  "olive oil 2 tbsp" + "olive oil 15 ml" produces two lines instead of silently
  dropping one.

## Files

- `packages/database/prisma/schema.prisma` — `IngredientPrice`, `ShoppingList`,
  `AiCallType.INGREDIENT_PRICES`
- `apps/api/src/lib/ai/{types,gemini,mock,prompts}.ts` — price estimation method
- `apps/api/src/lib/ingredient-prices/index.ts` — unit conversion + estimation lib
- `apps/api/src/workers/ingredient-price.worker.ts` — build + weekly refresh
- `apps/api/src/application/shopping-list/shopping-list.service.ts` — wiring
- `apps/api/src/routers/shopping-list.router.ts` — premium gating
- `apps/web/src/app/(dashboard)/shopping-list/page.tsx` — price chips + total
- Docs: `infrastructure.md` §6–§8, `business_flow.md`

## Later (out of scope now)

- Per-store price books reusing this vocabulary (Carrefour scraper feeds
  store-specific overrides; LLM estimates fill the gaps per store).
- Package-size awareness (ceil to whole packages).
- Currency conversion from the user's `deliveryCurrency`.
