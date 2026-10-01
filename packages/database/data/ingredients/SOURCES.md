# Ingredient catalog: data sources

`catalog.json` in this folder is built by `scripts/ingredients/build-catalog.ts` from the datasets below (plan: `docs/plan-ingredient-catalog.md` §4). Every nutrient value, portion weight and density is **read from these files by script**. None is typed by a person or a model. The only hand-written input is `scripts/ingredients/catalog-draft.json`. It holds names, slugs, categories, aliases and a pointer to one source record per row.

Re-download the raw files with `scripts/ingredients/fetch-sources.sh`. They go to the git-ignored folder `scripts/ingredients/out/sources/`. When you bump a release, update the script, this file and the release constants in `scripts/ingredients/lib/sources.ts` together.

## Datasets

| Dataset                                              | Release                                                   | URL                                                                                                                                                                                                                                                                                    | Licence                                                                | Used for                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| USDA FoodData Central: **Foundation Foods** (CSV)    | 2026-04-30                                                | https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip                                                                                                                                                                                              | **CC0 1.0 Universal** (public domain)                                  | First choice for nutrients (`fdc:<fdc_id>`, `data_type = foundation_food`)                                                |
| USDA FoodData Central: **SR Legacy** (CSV)           | 2018-04 (final release)                                   | https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip                                                                                                                                                                                                  | **CC0 1.0 Universal** (public domain)                                  | Nutrients when Foundation lacks the food or a core nutrient; most portion weights and densities                           |
| ANSES **CIQUAL** French food composition table (XML) | Ciqual 2025, files dated 2025-11-03, published 2025-11-19 | Recherche Data Gouv, doi:[10.57745/RDMHWY](https://doi.org/10.57745/RDMHWY). Files: `alim`, `alim_grp`, `compo`, `const`, `sources` (`*_2025_11_03.xml`), datafile ids 666252, 666250, 666249, 666246 and 666248 at `https://entrepot.recherche.data.gouv.fr/api/access/datafile/<id>` | **Licence Ouverte / Open Licence 2.0 (Etalab 2.0)**, SPDX `etalab-2.0` | EU and Romanian items USDA lacks, such as smântână, urdă, cașcaval-type cheeses and fermented bran (`ciqual:<alim_code>`) |

Licence verification, done 2026-10-01:

- **FDC.** The FoodData Central home page (https://fdc.nal.usda.gov/) states that the data "are in the public domain and they are not copyrighted. They are published under CC0 1.0 Universal (CC0 1.0)". No permission is needed. USDA asks that FoodData Central be listed as the source. Suggested citation: _U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. https://fdc.nal.usda.gov/_.
- **CIQUAL.** The Recherche Data Gouv dataset record gives the licence as `etalab 2.0` (https://spdx.org/licenses/etalab-2.0.html). The Licence Ouverte 2.0 allows free reuse, including commercial reuse, adaptation and redistribution. The only condition is attribution: name the source and the date it was last updated. Required attribution: _Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025. https://doi.org/10.57745/RDMHWY (mise à jour du 19/11/2025)_. Show this attribution wherever the app shows CIQUAL-sourced nutrition, for example on the ingredients page source badge or the about/licences screen.
- **LABEL** rows (`label:<url>`) cite the URL of a manufacturer's EU nutrition declaration. Each one is listed below under "Label rows" and needs owner review. A label's numbers are facts, not copyrightable expression, but the row cites its source all the same.

## Extraction rules (deterministic)

### Nutrients from FDC (`nutritionSource: USDA_FDC`, `sourceRef: fdc:<fdc_id>`)

| Catalog field     | FDC nutrient id(s)                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kcalPer100g`     | **1008** Energy (kcal), as published. A Foundation food that has no 1008 uses **2048** (Atwater Specific Factors), then **2047** (Atwater General Factors). `sourceNote` records the fallback. Energy is never derived from the macros.         |
| `proteinPer100g`  | 1003                                                                                                                                                                                                                                            |
| `fatPer100g`      | 1004                                                                                                                                                                                                                                            |
| `fiberPer100g`    | 1079 Fiber, total dietary                                                                                                                                                                                                                       |
| `carbsPer100g`    | **EU available carbohydrate (D2)**: `max(0, 1005 Carbohydrate by difference − 1079 fiber)`. When 1005 is absent, **1050** Carbohydrate by summation is used unchanged, because it is already available carbohydrate. `sourceNote` records that. |
| `sugarPer100g`    | 2000 Total Sugars, else 1063 Sugars, Total                                                                                                                                                                                                      |
| `satFatPer100g`   | 1258                                                                                                                                                                                                                                            |
| `sodiumMgPer100g` | 1093                                                                                                                                                                                                                                            |

### Nutrients from CIQUAL (`nutritionSource: CIQUAL`, `sourceRef: ciqual:<alim_code>`)

| Catalog field     | CIQUAL `const_code`                                                              |
| ----------------- | -------------------------------------------------------------------------------- |
| `kcalPer100g`     | **328** Energy, Regulation EU No 1169/2011 (kcal/100 g)                          |
| `proteinPer100g`  | 25000 Protein, N × Jones' factor                                                 |
| `carbsPer100g`    | 31000 Glucides. This is already available carbohydrate, so it is used unchanged. |
| `fatPer100g`      | 40000                                                                            |
| `fiberPer100g`    | 34100                                                                            |
| `sugarPer100g`    | 32000                                                                            |
| `satFatPer100g`   | 40302                                                                            |
| `sodiumMgPer100g` | 10110                                                                            |

**CIQUAL value strings: the one rule** (`parseCiqualValue` in `scripts/ingredients/lib/sources.ts`):

| Published `teneur`                  | Value used                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `12,3`                              | `12.3`. A comma is the decimal separator.                                                                                             |
| `traces`                            | `0`                                                                                                                                   |
| `< 0,5`                             | `0.25`, which is **half the stated limit**. This is the usual "middle-bound" convention for values below the limit of quantification. |
| `-` (not analysed or not available) | **missing**. It is never zero. A missing core value is a validator error (`missing-nutrient`), except for the fiber rule below.       |

Any other string makes the build fail loudly.

### Fiber in foods of animal origin

Fiber does not occur in animal tissue. Some FDC and CIQUAL records for meat, fish, eggs and plain dairy leave fiber blank instead of publishing 0. For rows in the categories `BEEF, PORK, LAMB_GOAT, POULTRY, GAME, FISH, SEAFOOD, EGG, DAIRY_MILK, DAIRY_CHEESE, DAIRY_YOGURT_CREAM`, an unpublished fiber value is set to **0**. `sourceNote` records that ("fiber not published; 0 for animal-origin food"). No other missing value is ever filled in.

### Portions (`IngredientPortion`)

Portions come from FDC `food_portion.csv`, in both Foundation and SR Legacy, for the row's own FDC food plus any foods listed in the draft's `portionsFrom`. That list is how a CIQUAL row, or a Foundation row without portion data, gets portions from a same-food FDC entry. Each record's measure (the `measure_unit` name, else the first word of `modifier`) is mapped to a canonical, singular unit: `piece, small, medium, large, extra-large, clove, slice, can, jar, bunch, sprig, leaf, head, stalk, fillet, breast, thigh, drumstick, wing, scoop, bar, sheet, cube, packet, ear, wedge, stick`.

- Synonyms: `cloves` → `clove`, `slices`/`strip` → `slice`, `filet` → `fillet`, `leaves` → `leaf`, `bulb` → `head`, `extra large` → `extra-large`. Food-named counts such as `fruit`, `each`, `whole`, `egg`, `pepper`, `spear`, `link` or `tortilla` map to `piece`. The full table is `canonicalPortionUnit` in `scripts/ingredients/lib/portions.ts`.
- `grams` = `gram_weight / amount`, so it is the edible grams for **one** unit.
- The row's own food takes priority over `portionsFrom` foods. Within one food, the first record wins, ordered by `seq_num` and then by id.
- `source` = `fdc-portion:<food_portion.id>`.
- A draft may pin one FDC record to one unit (`portionAs`). That is used when FDC phrases a common unit as a fraction, for example "0.5 breast" meaning one breast fillet. `sourceNote` records that.

### Density (`densityGPerMl`)

Density = grams of one FDC volume measure ÷ its volume. The volumes are 1 cup = 236.6 ml, 1 tbsp = 14.79 ml, 1 tsp = 4.93 ml, 1 fl oz = 29.57 ml, and ml/l as stated. The measures are tried in that order. A measure with no qualifier ("1 cup") is preferred over a qualified one ("1 cup, chopped"). The draft's `densityFrom` names the food to use. Otherwise the row's own food is used first, then its `portionsFrom` foods. `sourceNote` records the FDC portion used. No reference-table densities are used in v1. A row in a volume-measured category without FDC volume data is left without density and appears in the gap report.

## Label rows

None in v1.
