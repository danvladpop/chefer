# WP-11 · Shop, pantry, recipes, cook mode, and one units and formatting system (audit §6.4)

|                   |                                                                            |
| ----------------- | -------------------------------------------------------------------------- |
| Wave / priority   | 3 / P2 (during beta, OTA)                                                  |
| Size              | L: about 1.5 days                                                          |
| Branch / worktree | `fix/shop-recipes-cook-units` / `../chefer-wp11`                           |
| DB / ports        | `chefer_wp11` / 3211, 3311, 8111                                           |
| Depends on        | Wave 1 merged. WP-01 made the portion helper; reuse it for Shop quantities |
| Can run alongside | WP-09, WP-10 or WP-12                                                      |

## Structural fix first (lane A)

- **`useUnits()`** on mobile and web is backed by a freshly fetched `preferredUnits`. WP-01 already stopped the gym→food
  sync.
- **Shared parser in `@chefer/utils`:** `parseQuantity("2 lb chicken thighs")` → `{ qty: 2, unit: 'lb', name: 'chicken
thighs' }`, with lb, oz, cup, tbsp, tsp, fl oz, can, pack, g, kg, ml, l, pcs.
- **Shared formatter set:** `formatQty`, `formatPriceRange`, `formatDate`, `formatKcal`, using the **device locale** (this
  covers X-15). It replaces the hard-coded `en-GB` / `en-US`.
- **Purchasable rounding:** `roundToPurchasable(item)` turns 0.8 avocado into 1, 5.5 cloves into 6, and merges
  zest + juice into lemons.

## Items

| Area            | IDs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shop            | SHOP-01 (imperial add-item via the parser), SHOP-03 (rounding, eggs → Dairy & Eggs, "For N" from the days covered), SHOP-04 (merge on `ingredientId` with unit normalisation, one price source), SHOP-02 (Undo on remove, persisted expansion, optimistic offline insert; WP-02 already did the errors), SHOP-06 (persist `shoppingList.getForWeek`, `mealPlan.getForWeek` and `recipe.get` with a 7-day maxAge for a cold start offline)                                                                                                                                |
| Pantry          | SHOP-05 (remove on Free or auto-expire, qty > 0, edit sheet with "use by", Undo, user units, an entry point from Shop/More), SHOP-07                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Recipes         | REC-04 (`recipe.deleteMine` soft delete, plus an owner ⋯ menu: Edit, Duplicate, Share, Delete + Undo), REC-05 (infinite cookbook, tab definitions), REC-07 (video source link, `replace` to the new recipe, keep spoon units), REC-08 ("Add to my week", add ingredients to the list, native Share), REC-09 (empty Discover explains its filters), REC-10 (image placeholder, sticky header), REC-11 (qty decimal pad; "Cooking for 2 (recipe makes 1)"), REC-12 (block Save while the photo uploads), REC-13, REC-14, REC-15 (editable review for link and text import) |
| Cook            | COOK-01 (timers as `endsAt` at screen level, header chips, haptic + local notification), COOK-04 (amounts in steps, a meal-slot chooser on "Log this meal"), COOK-05 (pass servings, `h-11` stepper, the same max)                                                                                                                                                                                                                                                                                                                                                       |
| Units elsewhere | GYM-17, GYM-19 ("kg each"); PLAN-07 formatting via `formatPriceRange` if WP-10 hasn't done it; check the live coordination file                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Check the API changes: `recipe.deleteMine` is new, so it's additive. Soft delete must hide the recipe from plans and lists
without breaking old clients that hold its id. Return a tombstone, never a 500.

## Lanes

| Lane                         | Items                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| A, units + formatters + Shop | structural fix, SHOP-01..07, X-15                                                       |
| B, recipes + import          | REC-04, 05, 07..15                                                                      |
| C, cook + web parity         | COOK-01, 04, 05, GYM-17, GYM-19, plus the web ports of the shared parser and formatters |

## Kickoff prompt

```
You are the orchestrator for WP-11 "Shop, recipes, cook, units". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-11-shop-recipes-cook-units.md
3. CLAUDE.md
Then execute it end to end under the operating rules. Read only each item's block in the audit.
- Lane A (the shared units and formatters) merges first.
- Sonnet lanes, at most 3 at a time; OTA-safe; additive API; a regression test per fix; the full ladder;
- iOS plus ONE Android emulator; web parity;
- ONE PR to master, never merged.
Finish by updating the live coordination file and the audit Fix status rows, then give the final summary.
```
