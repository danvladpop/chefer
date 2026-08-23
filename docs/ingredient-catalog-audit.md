# Ingredient catalog audit — images + macros (2026-08-23)

Prompted by the /ingredients page showing repeated and mismatched thumbnails
(four almond products sharing one raw-almonds photo, a generic salad-plate
photo on unrelated rows, avocado showing sushi). Method: full contact sheet of
every `ingredient_images` row (dev 373, prod 368) reviewed visually, plus SQL
sanity checks on every global `ingredient_prices` row.

## Findings

### Macros — healthy, no action

- **0 range violations** (kcal 0–950, macros within physical bounds) and
  **0 missing macro sets** across dev (422 global rows) and prod (490).
- The only rows failing a 4/4/9 Atwater energy check are **spices and
  extracts** (black pepper, cinnamon, dried herbs, vanilla extract, …) whose
  labeled calories legitimately diverge — fiber contributes less than 4 kcal/g
  and vanilla's energy is alcohol. Values match USDA figures; they are
  correct as stored. **No macro fixes needed** — the admin Edit flow on
  /ingredients remains the tool for any future one-off correction.

### Images — ~90 rows repaired

Two failure classes in the `ingredient_images` cache (which persists whatever
resolved first):

1. **Legacy shared fallbacks (dev only):** 21 rows across 5 URLs — the
   pre-prod-followups-#6 category stock photos (8 grain-family rows on one
   photo, 7 rows on the infamous salad plate) plus a few Unsplash collisions.
2. **Wrong Unsplash top hits (dev + prod):** ~60 names whose search result
   does not show the ingredient. Highlights: avocado → sushi rolls, dijon
   mustard → a branded pancake-syrup bottle, pine nuts → pine cones, olive
   oil → a cosmetics bottle, dill → cucumbers, corn → a corn field, one wok
   photo covering all six ground meats, branded yogurt/mayo product shots.
   Two Pollinations renders were also off-prompt (blueberries, canned
   tomatoes) and were reseeded.

## Fix — one-time repair script

`scripts/fix-ingredient-images.ts` (see its header for usage) emits idempotent
SQL that **overwrites** each flagged name with the deterministic per-ingredient
Pollinations product shot — the same URL the resolver's keyless fallback
generates — and NULLs matching global `ingredient_prices.imageUrl`. Overwriting
(not deleting) matters: an env with `UNSPLASH_ACCESS_KEY` (dev) would otherwise
re-resolve the same wrong top hit. Custom (creatorId) rows are untouched.
`--extra-file` feeds per-DB additions (used for dev's 21 shared-URL rows).

Applied 2026-08-23 to dev (92 names) and prod (72 names); the replacement URLs
were CDN-warmed and visually re-reviewed. ~15 hard cases (spices, minced
meats, sauces) missed the generic prompt on the first render and carry a
literal per-name `PROMPT_OVERRIDES` subject instead ("ground cumin spice
powder in a small ceramic bowl"); the two off-prompt originals were reseeded
(` v2` seed suffix).

Future-proofing: the resolver already generates per-ingredient product shots
when no Unsplash key is present. If Unsplash mismatches keep appearing for
newly-cached names, the cheap structural fix is dropping the Unsplash step
entirely (delete the key / the fetch branch) — quality was the argument for
Unsplash, and this audit shows the generated product shots are more reliable.
