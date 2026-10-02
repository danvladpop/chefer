# WP-14 · Recipe variety for the beta (UX-PO-06)

|                   |                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------- |
| Wave / priority   | 3 / P2. It becomes P1 once testers are past week 2: variety is the predicted complaint |
| Size              | M: content plus pipeline. About 1 day                                                  |
| Branch / worktree | `feat/curated-recipe-variety` / `../chefer-wp14`                                       |
| DB / ports        | `chefer_wp14` / 3214, 3314, 8114                                                       |
| Depends on        | WP-01 merged (REC-01's diet rules decide which recipes count as paleo, keto and so on) |
| Can run alongside | anything; it touches content files and the curated-recipe pipeline only                |

## Goal

The free curated pool covers multi-week plans for restricted diets and includes Romanian staples:

- **at least 14 dinners** for each of: omnivore, vegetarian, vegan, pescatarian, gluten-free, dairy-free, and vegan +
  gluten-free (as far as practical);
- at least 10 breakfasts and 10 lunches per common diet;
- **10–15 Romanian staples**: ciorbă de legume/perișoare, sarmale, tocăniță, mămăligă dishes, fasole bătută, zacuscă,
  salată de vinete and so on, including vegetarian and vegan variants.

Today the pool has 64 recipes. Vegan has 6 dinners, and vegan + GF has 4.

## How

- Use the existing curated-recipe pipeline and ingredient catalogue: computed nutrition, safety tags derived from
  ingredients, price vocabulary.
  - Memory and docs: `docs/plan-ingredient-catalog.md`, `apps/api/src/lib/curated-recipes/`.
  - There is also the recipe-dataset workstream.
- Recipes are written or adapted by agents. **No real AI calls in the pipeline run**: agents author the structured
  recipe data directly, and nutrition is computed from the catalogue.
- Each recipe must pass the safety suite and the computed-nutrition checks (no AI PARTIAL), and get prices.
- Add a coverage test that fails if any common diet drops below the targets above.

## Lanes

| Lane | Items                                                 |
| ---- | ----------------------------------------------------- |
| A    | coverage test + gap analysis (counts per diet × slot) |
| B    | Romanian staples                                      |
| C    | diet gap-fill (vegan, GF, pescatarian dinners first)  |

## Kickoff prompt

```
You are the orchestrator for WP-14 "Recipe variety". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-14-recipe-variety.md
3. CLAUDE.md
4. The curated-recipe pipeline code and docs
Then execute it end to end:
- start with the gap analysis;
- author recipes as structured data with no AI calls; computed nutrition only;
- run the safety suite and the coverage test;
- ONE PR to master, never merged.
Finish by updating the live coordination file, then give the final summary with the counts before and after.
```
