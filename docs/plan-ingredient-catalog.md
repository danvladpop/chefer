# Implementation Plan: Canonical Ingredient Catalog and Computed Recipe Nutrition

Status: **planned (2026-10-01); all §2 decisions made by the owner on 2026-10-01** · Owner: Dan · Audience: implementation agents in separate Claude sessions.

Read this whole document before starting any phase. Read §2 before starting: it lists the decisions the owner made on 2026-10-01. They are final; build exactly what they say. Every phase ends with the documentation updates required by `CLAUDE.md` and with the Platform Parity check.

---

## 0. Goal and non-negotiable invariants

**The owner's goal:** a recipe's calories and macros are **computed** from its ingredients and their quantities. They are never guessed or estimated by an LLM. Every ingredient comes from one curated, comprehensive, shared **global catalog**. At first, users may add **private** ingredients that the catalog lacks. Once a week, a Claude session reviews those private ingredients, promotes the relevant ones into the global catalog, and relinks the users' recipes to the global row. Over time the need for private ingredients shrinks.

These invariants are the acceptance criteria for the whole project. Every one must have an automated test or a verifier script.

| #   | Invariant                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | For every recipe with `nutritionStatus = COMPUTED`, `nutritionInfo` is **exactly** `computeRecipeNutrition(lines, catalog)` under the rounding rules in §5.4. `pnpm ingredients:verify` recomputes every such recipe and reports zero diffs. |
| I2  | No number written by an LLM ever reaches `Recipe.nutritionInfo` for a recipe created after cut-over. The LLM produces ingredient references and quantities only.                                                                             |
| I3  | Every line of a COMPUTED recipe references an `ACTIVE` ingredient. That ingredient is either global or a private ingredient owned by the recipe's owner.                                                                                     |
| I4  | A private ingredient is never readable by, and never influences the computation of, another user's data. Today it does: see §1, finding F6.                                                                                                  |
| I5  | Every global catalog row has a nutrition source reference (§4.3) and passes the validators in §4.5.                                                                                                                                          |
| I6  | Unit conversion never silently guesses. A line whose grams cannot be determined makes the recipe `PARTIAL`. It is never filled in by a default such as "150 g per piece".                                                                    |
| I7  | API changes are additive. Old mobile binaries in the field keep working (§9).                                                                                                                                                                |

---

## 1. Current state: verified findings that this plan fixes

Chefer already has a partial catalog. **Do not build a second, parallel one. Evolve this one.**

- **Catalog table:** `IngredientPrice` (`packages/database/prisma/schema.prisma`).
  - The `ingredientName` PK is the normalized name.
  - Columns: per-100 g macros, `gramsPerPiece`, prices, and `creatorId` (null means global, set means private).
  - `source` is one of `AI_ESTIMATE | USER | ADMIN`.
  - Prod had ~490 global rows at the 2026-08-23 audit; dev has 764.
- **Recipe storage:** `Recipe.ingredients` is Json `{name, quantity, unit}[]` holding free-text names. `Recipe.nutritionInfo` is Json per serving.
- **Shared types:** none for recipe lines or nutrition exist in `@chefer/types`. They live in `apps/api/src/lib/ai/types.ts`.
- **Dev data snapshot (2026-10-01):**
  - 650 recipes: 561 AI, 64 CURATED, 25 MANUAL.
  - **765 distinct free-text ingredient names.**
  - Synonym sprawl: `spinach` / `baby spinach`, `red pepper` / `bell pepper`.
  - Compound lines: `salt and black pepper` (×36).
  - Units carrying prep text: `g, chopped`, `cloves, minced`, `medium, diced`, `pitted`, `lemon`.
- **Prod demand snapshot (P0, 2026-10-01, `scripts/ingredients/export-demand.sh`):**
  - 551 recipes (476 AI, 64 CURATED, 11 MANUAL), 2,988 lines, **674 distinct names**, 974 distinct `(name, unit)` pairs, 71 distinct units (73 lines have an empty unit).
  - 47 names cover 50% of lines, 202 cover 80%, 525 cover 95%. 356 names occur exactly once.
  - 673 global `ingredient_prices` rows: **672 `AI_ESTIMATE`**, 1 `ADMIN`. All but 2 demand names have a global row, which confirms F1: the global vocabulary is the recipe names, with AI macros. 2 private rows.

Findings. Each one is a defect against the goal:

| #   | Finding                                                                                                                                                                                                                                                                                                                                                               | Where                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Catalog macros are themselves LLM estimates.** The `IngredientPriceWorker` auto-creates a **global** row for _any_ name any recipe uses, with Gemini-estimated macros. "Computed" is therefore currently computed from guesses.                                                                                                                                     | `apps/api/src/workers/ingredient-price.worker.ts` (`collectVocabulary`, upsert), prompt in `apps/api/src/lib/ai/prompts.ts`           |
| F2  | **AI recipes keep AI-stated nutrition** unless `macro-reconcile` decides to rescale. It keeps the AI numbers when catalog coverage is below 70% or the difference is within ±25%. When it does scale, it scales _quantities_ to hit the _AI-stated_ kcal, which treats the guess as ground truth.                                                                     | `apps/api/src/application/meal-plan/macro-reconcile.ts`                                                                               |
| F3  | **Manual recipes store whatever the client sends.** The web _new_ form can call `ingredients.computeNutrition`. The web _edit_ form and the mobile form are free text plus typed macros. The server never recomputes.                                                                                                                                                 | `apps/api/src/routers/recipe.router.ts`, `apps/web/src/app/(dashboard)/recipes/[id]/edit/page.tsx`, `apps/mobile/app/recipe-form.tsx` |
| F4  | **Imports (Cheferize and video) store AI nutrition.** `crossCheckMacros` is advisory only and runs on the _original_, not the adapted, recipe.                                                                                                                                                                                                                        | `apps/api/src/application/recipe-import/recipe-import.service.ts`, `video-import/video-recipe.service.ts`                             |
| F5  | **The 64 curated recipes carry hand-written nutrition** and are never reconciled.                                                                                                                                                                                                                                                                                     | `apps/api/src/lib/curated-recipes/`, `apps/api/src/lib/ai/fixtures/`                                                                  |
| F6  | **Privacy leak:** the vocabulary loads used by reconcile, the import cross-check and plan cost **do not filter by `creatorId`**. One user's private row can change another user's numbers.                                                                                                                                                                            | `meal-plan.service.ts` (vocab load), `recipe-import.service.ts` (vocab load), `shared/plan-cost.ts`                                   |
| F7  | **A private name squats the global name.** `ingredientName` is a global PK. When a user creates private "tahini", a global "tahini" can never exist. The worker treats that row as fresh, and every other user's "tahini" stays unmatched forever.                                                                                                                    | `ingredients.service.ts` `createCustom`, schema PK                                                                                    |
| F8  | **Unit conversion is wrong for nutrition.** <br>• `1 ml = 1 g` for everything: 1 cup of flour computes as 240 g but is really ~125 g, and oil is 0.92 g/ml. <br>• Count units are pricing heuristics: `clove` = 0.15 × gramsPerPiece ≈ **0.75 g** of garlic, about 1/7 of reality; `can` = 1.5 × gramsPerPiece. <br>• Unknown units fall back to "count × 1 × 150 g". | `apps/api/src/lib/ingredient-prices/index.ts` (`UNIT_TABLE`, `normalizeUnit`, `quantityToGrams`, `DEFAULT_GRAMS_PER_PIECE`)           |
| F9  | **Name matching is exact-only** (lowercase/trim/collapse). There is no alias table. Other matchers exist in separate places: shopping-list `canonicalIngredientName` and pantry `namesMatch`.                                                                                                                                                                         | `lib/ingredient-prices/index.ts` `normalizeIngredientName`, `shopping-list/aggregate.ts`, `pantry/pantry-match.ts`                    |
| F10 | `upsertRecipes`'s update branch never updates `ingredients`/`nutritionInfo` on an existing id. Recomputation must use its own write path.                                                                                                                                                                                                                             | `packages/database/src/repositories/meal-plan.repository.ts`                                                                          |
| F11 | The server accepts any unit string. Dev contains a fuzz-test unit `lightyears` ×300 from MANUAL recipes.                                                                                                                                                                                                                                                              | recipe zod schema                                                                                                                     |

---

## 2. Owner decisions

All decisions were made by the owner on 2026-10-01. Every decision is the recommended default. D3 was briefly set to "discard old recipes", then changed the same day to: migrate every recipe to the new format, fully compatible.

| #   | Decision                                                                 | Decision                                                                                                                                                                                                                                                                                                                                                                                              | Status             |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| D1  | Primary nutrition source for global rows                                 | **USDA FoodData Central** (Foundation Foods first, then SR Legacy). Public domain (CC0); the agent re-verifies the licence at build time. **CIQUAL (ANSES, France)** for EU/Romanian items USDA lacks: telemea, cașcaval, urdă, smântână, zacuscă. `LABEL` (a cited EU nutrition label of a typical product) only as a last resort. **Never an LLM.**                                                 | decided 2026-10-01 |
| D2  | Carbohydrate convention                                                  | **EU "available carbohydrate"**: fiber excluded and stored separately. Users read EU labels when they create private ingredients, so the catalog must match. USDA values are converted: `carbs = carbohydrate_by_difference − fiber`. Energy is taken as published by the source and never re-derived.                                                                                                | decided 2026-10-01 |
| D3  | Existing recipes (pre-catalog)                                           | **Migrate every recipe to the new format; delete nothing.** Every line is mapped to a catalog ingredient: by exact name or alias first, then by a reviewed mapping file for the long tail (§7). Every recipe's nutrition is recomputed. There is no legacy state and no "Estimated" label. A line that truly cannot be mapped (test or fuzz junk) leaves its recipe `PARTIAL`, fixable in the editor. | decided 2026-10-01 |
| D4  | Old mobile binaries that send free-text lines and typed macros           | The server resolves the names. If every line resolves, it **computes and ignores the typed numbers**. Otherwise it stores the typed numbers as `USER_ENTERED`, labelled "entered by you".                                                                                                                                                                                                             | decided 2026-10-01 |
| D5  | Private-ingredient macros                                                | The user types per-100 g values from the package label. All five core fields are required. Premium users can get an optional AI pre-fill, but it is labelled, editable, and the stored source is `USER`. A recipe built on private ingredients is still `COMPUTED`: the numbers are computed from data the user supplied.                                                                             | decided 2026-10-01 |
| D6  | User notification when the weekly merge relinks their private ingredient | Silent relink and recompute, plus one in-app notice per user per review: "3 of your ingredients now use Chefer's verified data." No email.                                                                                                                                                                                                                                                            | decided 2026-10-01 |
| D7  | Source of truth for global rows                                          | **Git.** `packages/database/data/ingredients/catalog.json` holds the catalog. A deterministic, idempotent sync upserts it by `slug`. The admin UI may still edit **price and image** of global rows, but no longer **nutrition** fields: nutrition changes go through a PR with a source reference.                                                                                                   | decided 2026-10-01 |
| D8  | Cooked vs raw                                                            | Separate catalog rows for nutritionally different states: `rice, white, dry` vs `rice, white, cooked`; `chickpeas, dry` / `canned, drained` / `cooked`. Recipes quantify ingredients in the state they are measured. The AI prompt requires raw or dry state for meat, grains and legumes unless a cooked or canned item is explicitly intended.                                                      | decided 2026-10-01 |
| D9  | Catalog v1 size                                                          | **~1,200 global rows** following the taxonomy in §4.2. Larger catalogs hurt picker UX and LLM prompt size. Smaller ones push users to create private rows.                                                                                                                                                                                                                                            | decided 2026-10-01 |
| D10 | Breaking-change budget                                                   | None (I7). Every change in this plan is additive.                                                                                                                                                                                                                                                                                                                                                     | decided 2026-10-01 |

---

## 3. Target data model

All changes are additive. Schema deploys use `prisma db push` through the compose `migrate` service, so there are **no migration files**. Data changes are separate idempotent scripts (§7). Do **not** rename `IngredientPrice`: a rename under `db push` is a drop and recreate.

```prisma
enum IngredientStatus   { ACTIVE MERGED DEPRECATED }
enum NutritionSource    { USDA_FDC CIQUAL LABEL USER ADMIN }
enum NutritionStatus    { COMPUTED PARTIAL USER_ENTERED }
enum IngredientCategory { VEGETABLE FRUIT HERB_FRESH SPICE_DRIED LEGUME GRAIN_CEREAL FLOUR_BAKING PASTA_NOODLE BREAD_BAKERY
                          NUT_SEED BEEF PORK LAMB_GOAT POULTRY GAME PROCESSED_MEAT FISH SEAFOOD EGG DAIRY_MILK DAIRY_CHEESE
                          DAIRY_YOGURT_CREAM PLANT_PROTEIN PLANT_MILK OIL_FAT CONDIMENT_SAUCE VINEGAR SWEETENER
                          CANNED_JARRED PICKLED_FERMENTED STOCK_BROTH BEVERAGE ALCOHOL_COOKING SUPPLEMENT SNACK_PREPARED OTHER }

model Ingredient {
  id                String             @id @default(cuid())
  slug              String             // "chicken-breast-raw"; unique among globals (see note)
  name              String             // display: "Chicken breast, raw"
  category          IngredientCategory
  status            IngredientStatus   @default(ACTIVE)
  mergedIntoId      String?            // set when MERGED (private → global)
  ownerId           String?            // null = global; set = private to that user
  // Nutrition per 100 g EDIBLE portion, EU convention (carbs exclude fiber; see D2)
  kcalPer100g       Float
  proteinPer100g    Float
  carbsPer100g      Float
  fatPer100g        Float
  fiberPer100g      Float
  sugarPer100g      Float?
  satFatPer100g     Float?
  sodiumMgPer100g   Float?
  // Conversion
  densityGPerMl     Float?             // required if the ingredient may be measured by volume
  edibleFraction    Float   @default(1) // bone-in / unpeeled purchase-weight rows only
  // Provenance
  nutritionSource   NutritionSource
  sourceRef         String?            // e.g. "fdc:171077", "ciqual:12345", label URL
  sourceNote        String?
  imageUrl          String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  owner     User?               @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  aliases   IngredientAlias[]
  portions  IngredientPortion[]
  lines     RecipeIngredient[]

  @@unique([ownerId, slug])     // see note on NULLs
  @@index([ownerId])
  @@index([status])
  @@map("ingredients")
}

model IngredientAlias {          // normalized lookup keys → ingredient
  id           String  @id @default(cuid())
  ingredientId String
  alias        String           // normalized (see §6.1)
  locale       String  @default("en") // "en" | "ro"
  ownerId      String?           // null for global aliases
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  @@unique([ownerId, alias])
  @@index([alias])
  @@map("ingredient_aliases")
}

model IngredientPortion {        // count/household units → grams, per ingredient
  id           String  @id @default(cuid())
  ingredientId String
  unit         String           // canonical portion unit: "piece","small","medium","large","clove","slice","can","cup","bunch","sprig",…
  grams        Float            // edible grams for ONE unit
  source       String           // "fdc-portion:…", "label", "admin"
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  @@unique([ingredientId, unit])
  @@map("ingredient_portions")
}

model RecipeIngredient {
  id           String   @id @default(cuid())
  recipeId     String
  position     Int
  ingredientId String?           // null only for unresolved legacy/old-client lines
  rawName      String            // what the author/AI/importer wrote — never lost
  quantity     Float
  unit         String            // canonical unit (§5.1)
  grams        Float?            // resolved edible grams; null ⇒ line unresolved
  note         String?           // prep text: "minced", "diced", "drained"
  optional     Boolean  @default(false) // "to serve" garnish — included in totals unless optional
  recipe       Recipe      @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  ingredient   Ingredient? @relation(fields: [ingredientId], references: [id])
  @@index([recipeId])
  @@index([ingredientId])
  @@map("recipe_ingredients")
}

// Recipe — additive columns
//   nutritionStatus     NutritionStatus @default(PARTIAL)
//   nutritionComputedAt DateTime?
//   nutritionTotal      Json?   // whole-recipe totals (same shape as nutritionInfo) for audit
//   lines               RecipeIngredient[]
```

Notes for the schema agent:

- **NULL uniqueness.** Postgres treats NULLs as distinct, so `@@unique([ownerId, slug])` does **not** stop two globals from sharing a slug. Enforce global slug uniqueness in the sync script and in a unit test. Alternatively, store `ownerId` as `""` for globals. Pick one approach and document it in `infrastructure.md` §6.
- **The JSON stays.** `Recipe.ingredients` (Json) is kept as a **mirror** of `RecipeIngredient` in the old `{name, quantity, unit}` shape. Every existing consumer and old mobile client keeps reading it unchanged: shopping list, pantry, cook mode, images, Carrefour. A single repository function writes both, inside one transaction. Consumers migrate to `RecipeIngredient` later, opportunistically.
- **`IngredientPrice` stays for prices.** Add a nullable `ingredientId` to it. Its macro columns become **deprecated, read by nothing new**. Keep writing them only until all readers have moved, then stop.
- **`IngredientImage` and `CarrefourPriceCache`** stay keyed by name for now. They can move to `ingredientId` later.

**As built in P1 (2026-10-01):**

- **Discrepancy with "no migration files":** deploys do use `db push`, but recent schema PRs (wave 0, Following) also commit a named history migration. P1 follows that convention: `prisma/migrations/20261001160000_ingredient_catalog/`.
- **NULL-uniqueness decision:** global slug and alias uniqueness is enforced by the validators and `ingredients:sync`, not by the database. `ownerId = ""` would break the foreign key to `User`. Prisma 5 can express neither partial indexes nor `NULLS NOT DISTINCT`, and `db push` drops indexes it does not know about. This is documented in `infrastructure.md` §6.
- **`RecipeIngredient.ingredientId` is `onDelete: SetNull`.** Deleting an account cascades its private ingredients, and the lines that pointed at them become unresolved instead of blocking the delete.
- **Recipe columns:** `nutritionStatus` defaults to `PARTIAL`, so every existing recipe is `PARTIAL` until the §7 migration writes its lines.
- **Dual write:** `RecipeLineRepository.writeLines` in `packages/database`. The Json mirror name is `mirrorName ?? rawName`, so the caller decides when names become catalog display names (§7 step 5).

---

## 4. Catalog v1: research and data build (agent-executable)

### 4.1 Granularity rules (the most important part of this section)

One catalog row per **nutritionally distinct, brand-free** item.

| Case                             | Rule                                                                                     | Examples                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Different **state**              | separate rows                                                                            | rice dry / cooked; chickpeas dry / canned-drained; spinach raw / frozen               |
| Different **fat level or cut**   | separate rows                                                                            | ground beef 5% / 10% / 20%; milk 0.1% / 1.5% / 3.5%; chicken thigh skinless / skin-on |
| Same item, different **size**    | one row, several portions                                                                | egg: `small` 40 g / `medium` 50 g / `large` 60 g                                      |
| **Prep** (diced, minced, sliced) | not a row. It goes in `RecipeIngredient.note`.                                           | "garlic, minced" → garlic + note "minced"                                             |
| **Synonyms or translations**     | alias, not a row                                                                         | courgette / zucchini / dovlecel; scallion / green onion / ceapă verde                 |
| **Colour or variety**            | a row only if nutrition differs materially (>10% kcal or macro). Otherwise use an alias. | red / yellow / green bell pepper → one row plus aliases; sweet potato ≠ potato        |
| **Compound lines**               | forbidden. One ingredient per line.                                                      | "salt and black pepper" → two lines                                                   |
| **Brands**                       | never global. They stay private unless the weekly review generalises them.               | "Lidl Pilos skyr" → private, or mapped to global "skyr, plain"                        |
| **Prepared dishes**              | avoid. A small `SNACK_PREPARED` set is allowed for common building blocks only.          | puff pastry, tortilla wrap, hummus, pesto, zacuscă                                    |

### 4.2 Taxonomy and target counts (~1,200)

Coverage is driven by three inputs, all of which must be satisfied:

1. **Demand:** every distinct name in prod recipes, ranked by frequency (§4.4 step 1).
2. **The existing catalog:** the prod `IngredientPrice` global rows.
3. **This checklist**, with Romanian market staples called out explicitly. The target market is Romania (Lidl, Kaufland, Carrefour, Mega Image).

| Category                                | Target | Must include (non-exhaustive)                                                                                                                                 |
| --------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vegetables (fresh + frozen)             |    150 | all common + kapia pepper, gogoșari, celeriac, parsnip, kohlrabi, leurdă (wild garlic), urzici (nettle), ștevie (sorrel)                                      |
| Fruits (fresh + frozen + dried)         |     95 | common + quince (gutui), sour cherry (vișine), sea buckthorn (cătină), dried plums, dates, dried apricots                                                     |
| Fresh herbs                             |     25 | dill (mărar), lovage (leuștean), tarragon (tarhon), parsley, coriander, basil, mint, thyme, rosemary, chives                                                  |
| Spices & dried herbs                    |     70 | incl. salt, black pepper, sweet/smoked/hot paprika, cumin, turmeric, cinnamon, chili flakes, bay leaf, nutmeg, cloves, vanilla pod/extract                    |
| Legumes (dry / canned-drained / cooked) |     45 | beans (white, red, black, pinto), chickpeas, lentils (red, green, brown, beluga), split peas, edamame, mung, soy                                              |
| Grains & cereals                        |     60 | rice varieties (dry + cooked), oats, buckwheat, quinoa, bulgur, couscous, millet, barley, polenta/mălai, semolina (griș)                                      |
| Flours & baking                         |     40 | wheat 000/650, whole-wheat, rye, corn, almond, coconut, rice, oat; baking powder/soda, yeast, cocoa, gelatin, cornstarch                                      |
| Pasta & noodles                         |     25 | dry wheat pasta, whole-wheat pasta, egg noodles, rice noodles, soba, lasagna sheets, gnocchi                                                                  |
| Bread & bakery                          |     30 | white / whole-wheat / rye bread, baguette, pita, tortilla, burger bun, crackers, rice cakes, breadcrumbs, puff pastry, phyllo                                 |
| Nuts, seeds & butters                   |     50 | almonds, walnuts, hazelnuts, cashews, pistachios, peanuts, pine nuts; chia, flax, sesame, sunflower, pumpkin, hemp; peanut / almond butter, tahini            |
| Beef / pork / lamb / veal / game        |     80 | cuts by fat level; minced variants; liver; mici meat mix                                                                                                      |
| Poultry                                 |     40 | chicken breast / thigh / drumstick / wing / whole / liver, turkey breast / mince, duck                                                                        |
| Processed meat & charcuterie            |     40 | bacon, ham, salami, prosciutto, chorizo, cârnați, pastramă, slănină, parizer, smoked pork loin (cotlet afumat)                                                |
| Fish                                    |     50 | salmon (fresh, smoked), tuna (fresh, canned in water / oil), cod, hake, mackerel, sardines, trout, carp, pike-perch (șalău), herring                          |
| Seafood                                 |     20 | shrimp, prawns, mussels, squid, octopus, crab, scallops                                                                                                       |
| Eggs                                    |      8 | whole, white, yolk, quail egg                                                                                                                                 |
| Milk, cream & yogurt                    |     45 | milk by fat %, kefir, buttermilk (sană, lapte bătut), Greek yogurt 0/2/10%, skyr, smântână 12/20%, sour cream, heavy cream, butter, ghee                      |
| Cheese                                  |     45 | telemea (cow/sheep), cașcaval, brânză de vaci, urdă, feta, mozzarella, parmesan, cheddar, ricotta, cottage, cream cheese, halloumi, burduf                    |
| Plant protein & plant milks             |     30 | tofu (firm/silken), tempeh, seitan, TVP; oat / almond / soy / coconut / rice milk (unsweetened + sweetened)                                                   |
| Oils & fats                             |     25 | olive, extra-virgin olive, sunflower, rapeseed, coconut, sesame, avocado oil, lard, margarine                                                                 |
| Condiments, sauces, pastes              |     80 | tomato paste, passata, ketchup, mustard, mayo, soy sauce, fish sauce, sriracha, harissa, miso, pesto, hummus, salsa, BBQ, Worcestershire, horseradish (hrean) |
| Vinegars                                |     10 | wine, apple cider, balsamic, rice, white                                                                                                                      |
| Sweeteners                              |     20 | sugar (white/brown/powdered), honey, maple syrup, agave, date syrup, erythritol, stevia, jam                                                                  |
| Canned, jarred, pickled, fermented      |     45 | canned tomatoes, corn, olives, capers, pickled cucumbers (castraveți murați), sauerkraut (varză murată), kimchi, roasted peppers, zacuscă, artichokes         |
| Stocks & broths                         |     10 | chicken / beef / vegetable stock (liquid), bouillon cube/powder, borș (fermented bran)                                                                        |
| Beverages & cooking alcohol             |     20 | water, coffee, tea, coconut water, orange juice, white/red wine, beer, rum                                                                                    |
| Supplements & sports                    |     15 | whey protein (concentrate, isolate), casein, plant protein powder, creatine (0 kcal), collagen. Relevant to the gym workstream.                               |
| Other / prepared building blocks        |     27 | dark chocolate 70/85%, milk chocolate, cocoa nibs, nutritional yeast, puffed rice, granola, muesli                                                            |

Every global row also gets:

- **≥1 English alias**, plus the **Romanian name** as an `ro` alias wherever one exists. This lets the picker match what Romanian users type.
- **Portions** for every unit a recipe could reasonably use. Prefer USDA FDC portion data. Garlic must have `clove` = 3–5 g, not 0.75 g.
- **`densityGPerMl`** for anything measured by volume: liquids, oils, flours, sugar, rice, oats, grated cheese, yogurt.

### 4.3 Provenance

`nutritionSource` + `sourceRef` are mandatory on every global row:

- `fdc:<fdcId>`
- `ciqual:<code>`
- `label:<url or product description>`

The builder **records which source dataset and release** it used (e.g. FDC SR Legacy April 2018, Foundation Foods 2025-12) in `packages/database/data/ingredients/SOURCES.md`.

### 4.4 Build pipeline

This pipeline is deterministic and re-runnable. Scripts live in `scripts/ingredients/`.

1. **Demand export (read-only).**
   - Dump every distinct normalized ingredient name, with its frequency, from **prod** `recipes.ingredients`. Also dump all global `ingredient_prices` names.
   - Access prod via `ssh chefer` + `docker compose exec` + `psql`, read-only. See the memory/infra notes for the access pattern.
   - Save the output to `scripts/ingredients/out/demand.tsv`. This file is git-ignored because it may contain private names.
2. **Draft list.**
   - Cluster the demand names: normalize, strip prep words and units, singularize, map synonyms.
   - Merge the clusters with the §4.2 checklist into `catalog.draft.json` entries `{slug, name, category, aliases[]}`.
   - An LLM **may** help cluster and propose aliases and Romanian names: that is naming, not nutrition. Its output is reviewed in step 5.
3. **Nutrition mapping.**
   - Download FDC bulk CSVs: Foundation + SR Legacy. No API key is needed for the bulk files.
   - For each draft row, pick the best FDC food and record `fdcId`.
   - Extract the five core nutrients plus sugar, saturated fat and sodium, and convert carbs per D2.
   - Pull FDC portion weights into `IngredientPortion`.
   - For rows with no good FDC match, use CIQUAL. Failing that, use a cited label.
   - **An LLM may propose the FDC candidate. The script then reads the numbers from the dataset.** No nutrient value ever comes from model output.
4. **Density and portions gap-fill.**
   - Densities come from FDC portion data: a "1 cup = X g" entry gives density = X / 236.6.
   - Where FDC has none, use a cited reference table, and note the citation in `sourceNote`.
5. **Validation and review.**
   - Run the validators in §4.5.
   - Generate `catalog-review.html`: a table grouped by category with a link to each source record. The owner spot-checks ~5% of rows.
6. **Commit** `packages/database/data/ingredients/catalog.json`, sorted by slug for clean diffs, plus `SOURCES.md`.
7. **Sync.** `pnpm ingredients:sync` upserts by slug: rows, aliases and portions.
   - It never deletes.
   - A slug removed from the file becomes `DEPRECATED` if it is still referenced, and is deleted otherwise.
   - It runs automatically after `db push` in deploy, as part of the compose `migrate` service.

### 4.5 Validators

These run in CI (`packages/database` test) and inside `ingredients:sync`:

- Ranges: kcal 0–900; each macro 0–100 g; `protein + carbs + fat + fiber ≤ 100.5`; sodium 0–40000 mg.
- Energy check (EU factors):
  - `|kcal − (4P + 4C + 9F + 2Fiber)|` ≤ 15% or ≤ 15 kcal.
  - Allow-list for alcohol-bearing rows, polyols and spices, each with a `sourceNote` explaining why.
- Every row has `sourceRef`; slugs are unique; every alias maps to exactly one global row; no alias equals another row's slug.
- Every `VEGETABLE`/`FRUIT`/`EGG`/`BREAD_BAKERY` row has at least one count portion.
- Every row whose category is commonly measured by volume has `densityGPerMl`.
- Every portion is in grams > 0 and plausible (< 2000 g).

---

### 4.6 As built in P3 (2026-10-01)

- **The catalog.** v1 is `packages/database/data/ingredients/catalog.json`: 1,085 rows. 826 come from FDC SR Legacy, 99 from FDC Foundation (2026-04-30) and 160 from CIQUAL 2025. There are no label rows.
- **Validation.** The validators report 0 errors. 94.4% of prod demand lines resolve by slug or alias. An independent cross-check matched every FDC and CIQUAL nutrient value, density and portion to the raw files.
- **Owner decisions** (recorded in `SOURCES.md`):
  - the energy allow-list also covers vinegars (acetic acid) and cocoa/carob (FDC specific factors);
  - the 31 proxy rows are accepted;
  - FDC's "½ fillet" and "½ breast" records count as one fillet or breast as sold;
  - FDC `can` portions are dropped because they are US sizes;
  - v1 ships below the ~1,200 target.
- **Where the data contradicts §4:**
  - Foundation records often lack energy or fiber, so SR Legacy fills in for those rows.
  - No row has an `edibleFraction`, because the FDC CSVs carry no refuse data.
  - FDC lard (902 kcal) fails the 0–900 range, so CIQUAL lard is used.
  - Where an FDC specific-factor energy fails the EU energy check and CIQUAL has the same food, CIQUAL is used.
- **Count-portion and density gaps are warnings, not errors** (90 and 22 rows). The engine marks the affected lines PARTIAL instead of blocking the sync.
- **CI gate.** `pnpm ingredients:catalog` writes the file, and `src/catalog/catalog-file.test.ts` gates it in CI.

### 4.7 As built in P4 (2026-10-01)

- **Entry points.** `packages/database/src/catalog/sync.ts` holds `planCatalogSync` (pure) and `applyCatalogSync` (one transaction). `sync-cli.ts` is the command line, run by `pnpm ingredients:sync [--dry-run]`.
- **Deploy.** The compose `migrate` service now runs `prisma db push && tsx src/catalog/sync-cli.ts`. A sync failure fails the deploy, the same as a `db push` failure.
- **Removed slugs (§4.4 step 7).** A removed slug that is still referenced becomes DEPRECATED. "Referenced" means any recipe line, `IngredientPrice.ingredientId` or merged private row points at it. A DEPRECATED row loses its aliases, so it stops resolving, but keeps its portions so its existing lines can be recomputed. A returning slug becomes ACTIVE again.
- **`pg_trgm`** is created by the sync with `CREATE EXTENSION IF NOT EXISTS`. The trigram indexes themselves belong to P5, with the resolver.
- **CI gate (§4.5).** `src/catalog/catalog-file.test.ts` runs in CI's `pnpm test` and fails on any validator error in the committed file. The sync re-validates before writing.

## 5. Computation engine (shared, pure)

**Location:** `packages/utils/src/nutrition/`. It is pure TypeScript with no I/O, so web, mobile and API all use the same code: server truth plus client live preview. **Types and zod schemas** for `RecipeLine`, `NutritionFacts` and `NutritionStatus` go in `@chefer/types`.

### 5.1 Units

Canonical units:

- Mass: `g`, `kg`, `oz`, `lb`
- Volume: `ml`, `l`, `tsp` (4.93 ml), `tbsp` (14.79 ml), `cup` (236.6 ml)
- Tiny amounts: `pinch` = 0.36 g, `dash` = 0.6 g, `to taste` = 0 g, flagged as negligible
- Portion units: whatever `IngredientPortion` defines for that ingredient

A `normalizeUnit` helper maps synonyms and plurals to the canonical units: `grams` → `g`, `cloves` → `clove`. It splits trailing prep text off into `note`: `"g, chopped"` → `g` + note `chopped`.

### 5.2 Line → grams

```
mass unit            → grams = qty × factor
volume unit          → grams = qty × ml × ingredient.densityGPerMl   (no density ⇒ UNRESOLVED)
portion unit         → grams = qty × portion.grams                    (no portion ⇒ UNRESOLVED)
"to taste"           → grams = 0 (counted as resolved)
unknown unit         → UNRESOLVED (never a default)
edible grams         = grams × edibleFraction
```

### 5.3 Recipe → nutrition

`computeRecipeNutrition(lines, lookup, servings)` returns:

```ts
{ status: 'COMPUTED' | 'PARTIAL', total: Facts, perServing: Facts,
  lines: [{ position, grams, facts, problem?: 'NO_INGREDIENT'|'NO_DENSITY'|'NO_PORTION'|'BAD_UNIT'|'BAD_QTY' }] }
```

- `COMPUTED` means every non-optional line resolved.
- `PARTIAL` means at least one line has a problem. `perServing` is still returned, but the UI must say "incomplete". Lines marked `optional` are excluded from totals; a garnish is an example.

### 5.4 Rounding

Sum at full precision and round only `perServing`:

- kcal: integer
- protein / carbs / fat / fiber: 1 decimal

Store both `nutritionInfo` (per serving, the existing shape, rounded) and `nutritionTotal`.

### 5.5 Tests

These tests are the core quality gate:

- Golden tests against hand-computed USDA examples, at least 15 recipes. For example, 200 g chicken breast raw + 100 g rice dry + 10 g olive oil, checked against FDC values to ±0.5.
- Unit table tests: 1 cup flour ≈ 125 g, 1 tbsp oil ≈ 13.6 g, 2 cloves garlic ≈ 6–10 g.
- Unresolved paths, the edible fraction, the optional flag, and servings = 1 or N.

---

### 5.6 As built in P2 (2026-10-01)

- **Location and names.** `packages/utils/src/nutrition/` exports `normalizeRecipeUnit`, `lineGrams`, `computeRecipeNutrition` and `roundNutritionFacts`. Names carry the nutrition prefix because `@chefer/utils` already exports a generic `round`.
- **Edible fraction (clarifies §3 vs §5.2).** §3 defines `IngredientPortion.grams` as edible grams, so the engine applies `edibleFraction` to mass and volume quantities only. Applying it to portions as well would count it twice.
- **Empty unit.** A bare count with an empty unit ("2 eggs", 73 prod lines) normalizes to `piece`. Its grams still come only from the ingredient's `piece` portion, otherwise the line is `NO_PORTION`.
- **Ingredient-defined portions.** A unit outside the shared portion list, such as `serving` or `bar`, resolves only when that ingredient defines a portion of exactly that name. Otherwise it is `BAD_UNIT`.
- **Golden data.** The golden tests use FDC SR Legacy values extracted by `scripts/ingredients/golden-fixture.mjs`, and 16 recipes are covered.

## 6. Resolution (free text → catalog row)

### 6.1 Resolver

`apps/api/src/application/ingredients/ingredient-resolver.ts` implements `resolve(rawName, unit, ownerId) → { match?: Ingredient, confidence: 'EXACT'|'ALIAS'|'CANDIDATES'|'NONE', candidates: Ingredient[] }`.

1. Normalize:
   - lowercase, NFKD-strip diacritics (_so "mărar" ≈ "marar"_), collapse whitespace;
   - strip quantities, units and prep words (reuse/merge `canonicalIngredientName` from `shopping-list/aggregate.ts`; delete the duplicate);
   - singularize.
2. Look up in order: exact slug, then global alias, then the owner's private alias or name.
3. Otherwise return ranked **candidates**: trigram similarity via `pg_trgm` on name and aliases, which needs a migration-free `CREATE EXTENSION` in the sync script. Fuzzy candidates are **never auto-applied on write**. They are only suggestions for a human or for the LLM repair round.

### 6.1.1 As built in P5 (2026-10-01)

- **Code.** The resolver is `apps/api/src/application/ingredients/ingredient-resolver.ts`. Reads go through `IngredientRepository` in `packages/database`, and the lookup keys come from `ingredientLookupKeys` / `ingredientBaseKey` in `@chefer/utils` (`nutrition/ingredient-name.ts`).
- **One set of name rules.** The shopping list's `canonicalIngredientName` now delegates to `ingredientBaseKey`, and the catalog build's coverage report uses the same functions. An API test keeps the key form identical to the catalog's `normalizeAlias`.
- **Fuzzy candidates use no trigram index yet.** At about 4.4k aliases a sequential `similarity()` scan is fast. Prisma can declare a `gin_trgm_ops` index, but `db push` would fail on a database without the extension, and the extension is only created by the sync that runs after `db push`.
- **`ingredients.search` name field.** Its legacy `name` is the alias the query matched, so an old client's free-text line resolves back to the same row.
- **Private ingredients created before the catalog** get their `Ingredient` twin lazily per user (`ensurePrivateTwins`). That covers §7 step 2 for anyone who opens search, resolve or compute; P8 still runs it for everyone.
- **`createCustom`** keeps writing the linked legacy price row while that name is free, so the price consumers keep working. A name taken by another row no longer blocks creation (F7).
- **D7 for global rows.** `update` changes only price and image; macro fields in the input are ignored.

### 6.2 Where resolution is applied

| Write path                                                                           | Behaviour                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI meal plan, swap, chat swap** (`meal-plan.service.ts`, `chat.service.ts`)        | Strict mode, §6.3                                                                                                                                                                                                                                                                                                                              |
| **Manual create/update**: web new, web edit, mobile form                             | New clients send `ingredientId` per line, picked from the catalog. The server ignores client nutrition and **always recomputes**. Old clients send names: the server resolves with EXACT/ALIAS only. If anything is unresolved, D4 applies.                                                                                                    |
| **Cheferize / video import** (`recipe-import.service.ts`, `video-recipe.service.ts`) | The AI extracts lines and the resolver maps them. The **review form shows each unresolved line with candidates**: the user picks one or "create private ingredient". Save is blocked until every line is resolved, or the user explicitly accepts `PARTIAL`. AI nutrition is dropped. `crossCheckMacros` is deleted, because it is superseded. |
| **Curated pool** (`lib/curated-recipes`, `lib/ai/fixtures`)                          | Rewrite the fixtures to reference slugs. Nutrition is computed at build/seed time. A unit test asserts every fixture resolves 100%.                                                                                                                                                                                                            |
| **Video curated dataset** (recipe-dataset workstream)                                | Same as import, with an admin review.                                                                                                                                                                                                                                                                                                          |

### 6.2.1 As built in P6 (2026-10-01)

- **Manual saves.**
  - `RecipeService.create`/`update` go through `RecipeNutritionService.prepareSave`. D4 is applied as: an old client (no line has an `ingredientId`), an unresolved line, and numbers typed by hand (`nutritionInfo.source` not `computed`/`none`, kcal > 0) → USER_ENTERED. Any other unresolved case → PARTIAL.
  - The recipe and its lines are written in one transaction (`ManualRecipeLines` on `createManualRecipe`/`updateManualRecipe`). The Json mirror keeps the typed name and unit (`mirrorName`/`mirrorUnit`).
- **Import and video import.**
  - The preview's `nutritionInfo` is computed, and `resolution` plus `nutritionStatus` are added. `macroCheck` stays for installed clients (D10), derived from the computation; `crossCheckMacros` is deleted.
  - Save always computes. `acceptPartial` is tri-state: `false` blocks, while `true` or omitted (old clients) saves PARTIAL, because blocking would break installed binaries.
  - The video draft goes through the same path.
- **Copies (I3/I4, not listed in §6.2).** A new "Add to my week" copy gets the source's lines recomputed for the viewer, and links to the source author's private rows are dropped.
- **Curated pool.**
  - Every fixture line has a `slug`, and nutrition is computed from `catalog.json` when the module loads; no database is needed.
  - The curated DB rows get their lines from `ensureCuratedRecipes`. The fixture is authoritative for CURATED rows, the write is idempotent, and it waits if the catalog isn't synced yet.
  - Test gate: all 64 recipes COMPUTED.
  - Compared with the old hand-written numbers: median +4%, p10 −17%, p90 +43%, range −54% to +96%. Several recipes are bigger than their labels claimed, for example Red Lentil Curry at 1,176 kcal for `servings: 1` as written. ⚠ Owner decision pending: adjust `servings` on recipes clearly written for two.
  - Explicit fixture proxies: halloumi → `cheese-average`, Italian seasoning → `oregano-dried`, fajita seasoning → `chili-powder`, ciabatta roll → `kaiser-roll`.
  - Recipe edits: balsamic glaze → balsamic vinegar; edamame in pods → shelled edamame at half the weight; compound lines split.
  - Catalog: falafel gained FDC's "patty" portion (17 g) as `piece`.
- **Price worker (F1).** It prices only names that resolve to a global catalog row, links every price row (`ingredientId`), takes `gramsPerPiece` from the catalog portion, and never creates unknown names or writes macros.
  - `estimateIngredientPrices` gained `{ nutrition }`. The worker's prompt is price-only; only the premium private-ingredient auto-fill (D5) asks for nutrition.
- **Not done in P6.** The video curated-dataset script (`recipes:from-video`) still emits drafts without slugs. The curated gate catches any draft promoted into the pool without slugs, and P9's review UI is where slugs will be picked.

### 6.3 AI generation: strict, catalog-constrained

- **Prompt.**
  - Give the model a compact list of catalog slugs, filtered by the user's dietary exclusions and allergies. That is ~1,000 slugs × ~6 tokens ≈ 6k tokens, which can use prompt caching where the provider supports it.
  - Require one slug per line, with quantity in a canonical or portion unit.
  - **Remove calories and macros from the output schema entirely** (`lib/ai/schemas.ts`, `types.ts`, `prompts.ts`, every provider in `lib/ai/`).
  - The AI may still state a _target_ it aimed for, but that value is never stored.
- **Validate.** Every slug must exist and every unit must be valid for that ingredient.
- **Repair round (max 1).** Re-ask with the offending lines plus the resolver's top-3 candidates per line.
- **Fail.** If lines are still unresolved, drop that recipe and regenerate the slot. Fall back to a curated recipe if the second attempt also fails. Never store an AI recipe as PARTIAL.
- **Hit the plan's targets by scaling.** Repurpose `macro-reconcile`:
  - compute the true nutrition;
  - if per-serving kcal is outside ±10% of the **slot target** (from the user's plan, not the AI's claim), scale quantities by `target / computed`, clamped to 0.6–1.8×;
  - round with `roundQuantity`, then **recompute**. Stored numbers are always the recomputed ones.
- **Eval harness.** Update `lib/ai/eval/scorer.ts`. Remove the AI-nutrition checks and add a resolution rate metric: % of lines resolved without repair. Target ≥ 95%.

### 6.3.1 As built in P7 (2026-10-01)

- **Code.** `application/meal-plan/ai-recipe-catalog.ts` holds the slug list, `computeAiRecipe`, `slotTargets` and `fitToSlotTarget`. `ai-recipe-finisher.ts` holds `AiRecipeFinisher`: compute → repair → regenerate → curated fallback or drop → fit → `persistLines`. A new `IAIService.repairRecipeLines` is implemented for Gemini, OpenAI-compatible, mock and failover (the `swap` workload).
- **Slug list size.** About 5k tokens unfiltered, 3.4k for vegan and 4.3k for gluten-free. No explicit prompt caching yet: the list goes first in the user message, so identical lists share a prefix for providers that cache implicitly. Token use before vs after still needs measuring in `AiCallLog` on prod (§12).
- **Slot targets did not exist in code** (only in the prompt text). The shares are now the prompt's midpoints, normalised per day. A swap targets the replaced dish's computed kcal.
- **Fallback order.** "Regenerate the slot" uses `generateRecipeSwap`. If the AI is down or still wrong, a safe curated recipe; if none, the slot is dropped, the same as the safety pass.
- **Plausibility ceiling (§12 risk) not built yet.** For example "more than 400 g of cooked rice per serving → repair". The slot-target fit already bounds portions to 0.6–1.8×.
- **The eval** now scores computed kcal plus `catalogResolution`. Only the mock provider was run here (`catalogResolution` 1.0); a live-provider eval run is pending (it costs AI calls).
- **Live check** with the mock AI on a dev clone: a generated week of 15 AI recipes came out all COMPUTED with lines, days within about 1,700–2,000 kcal of a ~2,000 target, and the AI swap was COMPUTED with lines.

### 6.4 Stop the self-growing global vocabulary (F1)

- `IngredientPriceWorker` **must not create global rows** any more. It only prices existing `Ingredient` rows via the `IngredientPrice.ingredientId` link.
- It never writes macros.
- The AI price prompt drops the nutrition fields.
- New global rows come **only** from `catalog.json` via sync.

---

## 7. Migration of existing data to the new format (D3)

**Every recipe is migrated. Nothing is deleted, and nothing stays in the old format.** After the migration, every recipe has `RecipeIngredient` rows, recomputed nutrition, and a JSON mirror rewritten from those rows.

Write one idempotent script, `pnpm ingredients:migrate [--dry-run] [--env prod]`. Run it on dev, then on a prod snapshot restored locally, then on prod. Take a fresh backup immediately before the prod run.

1. **Global import.** For each existing global `IngredientPrice` row, resolve it against the new catalog by exact name, then alias, then the mapping file (step 3). Set `IngredientPrice.ingredientId`. Rows that map to nothing are AI-created vocabulary (F1): leave them unlinked. Their prices stay readable by name for the existing price consumers.
2. **Private import.** Each private `IngredientPrice` row becomes `Ingredient { ownerId, nutritionSource: USER }` with its macros.
   - Rows missing a core macro are imported anyway, with the missing values flagged. Their recipes are `PARTIAL` until the owner fills them in.
   - This also fixes F7: the global name is free again.
3. **Mapping the long tail: `legacy-mapping.json`.** This is the step that makes "migrate everything" possible.
   - **Collect.** Gather every distinct `(normalized name, raw unit)` pair across all recipes that EXACT/ALIAS resolution misses. On dev that is a few hundred pairs out of 765 names.
   - **Propose.** Write the proposed mapping to `scripts/ingredients/legacy-mapping.json`. Each entry has one of these shapes:
     - `{ rawName, rawUnit } → { slug, unit, note?, quantityFactor? }`
     - split: `"salt and black pepper"` → two slugs
     - `DROP_LINE`, only for non-food junk such as fuzz-test lines
   - **An LLM may propose the mappings.** This is naming and unit choice, not nutrition: no numbers come from the model.
   - **Review the file in its PR**, with the owner or a review agent checking at least the 100 most frequent entries.
   - **Promote real gaps.** A name with no good catalog equivalent means the catalog is missing an item. Add it to `catalog.json` with source provenance (§4), and do not force a bad match.
   - **Add aliases.** Every reviewed mapping that is a true synonym also becomes a catalog alias, so future free text resolves without the file.
4. **Unit conversion** follows §5.2 exactly.
   - Legacy count units ("medium", "clove", "can") need a portion on the target ingredient. The data build (§4) must add portions for every ingredient the mapping uses with a count unit.
   - Legacy volume units need a density.
   - The migration report lists every `(slug, unit)` pair that lacks one. Fix the catalog and re-run. Do **not** fall back to a default.
5. **Write the new format.** For every recipe:
   - write the `RecipeIngredient` rows, keeping `rawName` and moving prep text into `note`;
   - recompute nutrition and overwrite `nutritionInfo` and `nutritionTotal`;
   - set `nutritionStatus`;
   - rewrite the JSON mirror from the rows, so names become catalog display names.
6. **Exit criteria.**
   - 100% of recipes have `RecipeIngredient` rows.
   - ≥ 99% are `COMPUTED`.
   - The `PARTIAL` remainder is listed by recipe id with the offending line. The only acceptable cause is junk test data or a private ingredient with missing macros.
   - The 64 curated recipes come from rewritten fixtures (§6.2) and must all be `COMPUTED`.
   - `pnpm ingredients:verify` passes (I1).
7. **Report.** The migration report shows:
   - counts per source (AI, CURATED, MANUAL);
   - the kcal-change distribution, old vs new per serving, for example "median −4%, p95 +31%";
   - the 20 largest changes, for the owner to sanity-check. A large change is expected wherever the old AI guess was wrong. A wildly implausible one points to a bad mapping.
8. **History is untouched.** `DailyLog` stores its own totals and is never rewritten. Active meal plans read recipe nutrition live, so recomputed values appear in the _planned_ view. That is intended.

---

## 8. Private ingredients and the weekly review

### 8.1 Private ingredient rules

- Creation sources: the picker's "Create '…' as my ingredient", on web and mobile, and the import review form.
- Required fields: the five core macros per 100 g. Optional fields: portions (e.g. "1 bar = 45 g") and density.
- **Before creation, the resolver runs.** If a global EXACT/ALIAS match exists, the UI offers it ("Chefer already has **Skyr, plain**") and creation needs an explicit "No, mine is different".
- Private rows are visible to the owner only, in the picker, the ingredients page and computation. Fix F6 everywhere: every catalog load takes `ownerId` and filters `ownerId IS NULL OR ownerId = :me`. Add a test that creates a private row for user A and asserts it has no effect on user B's reconcile, import, plan cost or compute calls.
- Editing a private ingredient recomputes all of the owner's recipes that use it.

### 8.2 Weekly review: tooling the future Claude session uses

**`pnpm ingredients:review-report --since <date> [--env prod]`** is read-only. It writes `scripts/ingredients/out/review-<date>.md` and `.json`, both git-ignored. The report contains:

- every ACTIVE private ingredient created or used since the last review;
- clusters by normalized name across users, with the number of users and recipes;
- the resolver's top global candidates with a nutrition delta (% kcal/protein/carbs/fat difference);
- macro sanity flags from the §4.5 validators;
- the user-supplied macros (as a hint only) and the user id. **No emails.**

**Decisions file.** `review-<date>.decisions.json` is written by the Claude session in that week's conversation. Each entry is one of:

- `MAP { privateIds[], globalSlug, addAlias?: string }`: equivalent to an existing global, which might gain an alias.
- `PROMOTE { privateIds[], newRow: <catalog.json entry with sourceRef> }`: a new global. It is added to `catalog.json` **with FDC/CIQUAL/label provenance, never with the user's numbers**.
- `KEEP { privateIds[], reason }`: brand-specific, too niche, or ambiguous.
- `REJECT_DATA { privateIds[], reason }`: implausible macros. The user is flagged for an in-app "please check this ingredient" notice.

**`pnpm ingredients:review-apply <decisions.json> [--dry-run] [--env prod]`** runs _after_ any PROMOTE rows have shipped via a merged PR and a sync. In one transaction per decision it:

- repoints `RecipeIngredient.ingredientId` from the private row to the global row;
- re-derives grams, converting through the global row's portions and density, and marks the line PARTIAL if a unit has no equivalent;
- sets the private row to `MERGED` with `mergedIntoId`;
- recomputes the affected recipes;
- writes the D6 notice.

It must be idempotent and print a diff summary, e.g. "37 recipes recomputed, max kcal change −12%".

**Guard: merge tolerance.** `MAP` and `PROMOTE` refuse a private row whose user-supplied macros differ from the global row by more than 25% kcal or 30% on any macro, unless the decision carries `force: true` with a reason. This stops the merge from silently changing a user's numbers for a product that really is different.

**Runbook.** `docs/runbooks/ingredient-weekly-review.md` holds the exact commands for prod access, the decision heuristics in §4.1, the PR template for PROMOTE rows, and the verify step (`pnpm ingredients:verify --env prod`, I1).

---

## 9. API surface (all additive)

| Procedure                       | Change                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingredients.search`            | Returns `Ingredient` rows: `{id, slug, name, category, owner: 'global'                                                                                                                                             | 'mine', portions[], hasDensity}`. Matches on name, aliases and diacritic-free text. Shape stays backward-compatible: new fields are optional. |
| `ingredients.getMany` (new)     | Takes ids and returns full nutrition, portions and density, for client-side live preview with `@chefer/utils`.                                                                                                     |
| `ingredients.resolve` (new)     | Takes `{rawName, unit}[]` and returns resolver results. Used by import review and by legacy-recipe edit.                                                                                                           |
| `ingredients.createCustom`      | Writes `Ingredient{ownerId}`. Requires macros. Runs the duplicate-of-global check. Input stays compatible.                                                                                                         |
| `ingredients.computeNutrition`  | Delegates to the shared engine. Accepts optional `ingredientId` per line.                                                                                                                                          |
| `ingredients.update` / `delete` | Global rows can no longer have nutrition edited (D7); price and image remain editable. Private rows can be fully edited, and an edit triggers recompute.                                                           |
| `recipe.create` / `update`      | Lines accept optional `ingredientId` and `note`. Client `nutritionInfo` becomes optional and is **ignored** when every line resolves (D4). The response adds `nutritionStatus` and per-line `grams` and `problem`. |
| `recipe.get*`                   | Adds `nutritionStatus` and `lines[]` (with `ingredientId`, `grams` and per-line facts). `ingredients` JSON is unchanged.                                                                                           |

Update `infrastructure.md` §8 with every new or changed procedure.

---

## 10. UI (web + mobile; parity required)

- **Ingredient picker.** Use it in every recipe-line editor: web new, **web edit**, **mobile form**, and import/video review.
  - Search with category chips.
  - Unit dropdown limited to `g`/`ml`/canonical volume units plus that ingredient's portions.
  - "Create '…' as my ingredient" opens the private-ingredient sheet. On web it is the existing `IngredientFormModal`, reworked. On mobile it is a new sheet with the same fields.
  - Use `Sheet` / `useMenu` per `CLAUDE.md`. Accessibility labels are required.
- **Live nutrition preview** in the forms, using the shared engine. The manual-macros toggle goes away on new clients.
- **Recipe detail.** "Nutrition is computed from N ingredients" is expandable into a per-ingredient breakdown: grams, kcal and protein per line. This is the visible proof of the owner's requirement.
  - `PARTIAL`: shows "Incomplete — 2 ingredients need data" with an inline fix.
  - `USER_ENTERED`: shows "Entered by you".
- **Ingredients page** (web). Shows a source badge (USDA / CIQUAL / Label / Mine), aliases and portions. Global nutrition becomes read-only.
- **Mobile.** No ingredients page exists today, so add a **`mobile_parity_backlog.md` entry** for a "My ingredients" screen. The picker and the private-ingredient sheet inside the recipe form are **in scope** because the recipe form already exists on mobile.
- Mobile must handle `PARTIAL` and `USER_ENTERED` recipes.

---

## 11. Phases and agent assignment

The agent assignment is designed so that independent phases can run in parallel worktrees.

| Phase | Work                                                                                                                                            | Depends on | Parallel with |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------- |
| P0    | Prod demand export (§4.4 step 1); §2 already signed off 2026-10-01                                                                              | —          | —             |
| P1    | Schema (§3) + `@chefer/types` schemas, repository write function (dual-write JSON mirror), privacy filter fix F6 (ship early: it is a live bug) | P0         | P2, P3        |
| P2    | Shared engine + units + golden tests (§5)                                                                                                       | types only | P1, P3        |
| P3    | Catalog v1 data build (§4): the long pole                                                                                                       | P0         | P1, P2        |
| P4    | Sync script, validators in CI, deploy hook                                                                                                      | P1, P3     | P5            |
| P5    | Resolver + `ingredients.*` procedures                                                                                                           | P1, P2     | P4            |
| P6    | Write paths: manual (server recompute), import/video review, curated fixtures rewrite, worker change F1                                         | P4, P5     | P7            |
| P7    | AI strict generation + reconcile repurpose + eval update (§6.3)                                                                                 | P4, P5     | P6            |
| P8    | Migration (§7): build and review `legacy-mapping.json`, run on dev, then a prod snapshot, then prod; `ingredients:verify`                       | P6, P7     | P9            |
| P9    | UI web + mobile (§10)                                                                                                                           | P5         | P8            |
| P10   | Weekly review tooling + runbook (§8.2); first dry run on a prod snapshot                                                                        | P8         | —             |

**Definition of done for every phase:**

- `pnpm lint`, `typecheck` and `test` pass.
- Docs are updated per the `CLAUDE.md` table: §6 schema, §7 services, §8 procedures, §10 env (if any), §12 deploy hook, `business_flow.md` recipe/nutrition flow.
- The mobile ladder from `mobile_native_plan.md` §4 passes for P9.
- Playwright mobile sweep passes for web layout changes.
- Conventional commit scopes are used: `database`, `api`, `web`, `utils`, `types`.

---

## 12. Risks

| Risk                                                                                                          | Mitigation                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM picks wrong-but-valid slugs: "rice, white, cooked" used with dry quantities                               | The prompt mandates states (D8). Add a plausibility check: a per-serving grams-per-category ceiling (e.g. >400 g cooked rice per serving fails and triggers repair). |
| Catalog prompt bloats cost and latency                                                                        | Diet-filtered slug list plus prompt caching. Measure tokens in `AiCallLog` before and after.                                                                         |
| Users abandon the form because the picker lacks an item                                                       | One-tap private creation, Romanian aliases, and the weekly review driving the miss rate down. Track the `ingredient_private_created` event.                          |
| Recomputation changes numbers users already saw                                                               | This is the honest outcome. The status badges explain it, and history (`DailyLog`) is untouched.                                                                     |
| "Computed" still carries error: raw-weight variance, cooking oil absorption, label tolerance (EU allows ±20%) | Document in-app ("computed from standard food data") and never claim lab precision.                                                                                  |
