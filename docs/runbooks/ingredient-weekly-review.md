# Runbook: weekly private-ingredient review

The weekly ritual from [plan-ingredient-catalog §8.2](../plan-ingredient-catalog.md). Users' private ingredients that really are catalog foods get relinked to the verified global row. Real gaps become new catalog rows with FDC/CIQUAL/label provenance, never with the user's numbers. A Claude session runs it, and the owner merges any catalog PR.

**Time:** about 15 minutes, plus a catalog PR when something is promoted.
**Writes to prod:** only step 5 (`--apply`), and only after a fresh backup.

## 0. Prerequisites

- `ssh chefer` works (VM access, see infrastructure.md §12).
- The API container on the VM is `chefer-api`. Its image holds the API sources and `tsx`, so the scripts run inside it against prod's `DATABASE_URL`. Nothing goes over the network except the files you copy.
- Locally: a checkout of `master`. Output goes to `scripts/ingredients/out/`, which is git-ignored because it holds users' ingredient names.

## 1. Report (read-only)

```bash
SINCE=$(date -v-7d +%F)   # or the date of the last review
ssh chefer "docker exec chefer-api sh -c 'cd apps/api && npx tsx src/scripts/ingredients-review-report.ts --since $SINCE --out /tmp/review'"
ssh chefer "docker exec chefer-api tar -C /tmp -c review" | tar -x -C scripts/ingredients/out
```

This gives you `scripts/ingredients/out/review/review-<today>.md` and `.json`. The report has:

- each ACTIVE private ingredient created, edited or used since `$SINCE`, with owner **id** (no emails), recipe count and the user's per-100 g values (a hint only);
- the resolver's top-3 global candidates. Each candidate shows its confidence (EXACT / ALIAS / fuzzy CANDIDATE), the % difference per field, and whether a merge would pass the tolerance (≤ 25% kcal, ≤ 30% per macro, with floors of 15 kcal and 2 g);
- §4.5 sanity flags: energy that doesn't match the macros, macros that add up to more than 100 g, negative values, more than 900 kcal;
- clusters of the same name across users. A name several users created is the strongest signal that the catalog is missing something.

## 2. Decide

Write `scripts/ingredients/out/review/review-<today>.decisions.json`:

```json
{
  "review": "2026-10-08",
  "decisions": [
    {
      "action": "MAP",
      "privateIds": ["…"],
      "globalSlug": "skyr-plain",
      "addAlias": "skyr natural"
    },
    {
      "action": "PROMOTE",
      "privateIds": ["…", "…"],
      "newRow": { "slug": "protein-bar-generic", "sourceRef": "fdc:…" }
    },
    { "action": "KEEP", "privateIds": ["…"], "reason": "brand-specific" },
    { "action": "REJECT_DATA", "privateIds": ["…"], "reason": "macros add up to 180 g/100 g" }
  ]
}
```

Heuristics (plan §4.1):

- **MAP** when the private row is the same food as a global row and its numbers are within tolerance. That is usually an EXACT/ALIAS candidate. Add `addAlias` when the user's name is a true synonym worth teaching the catalog. It is only reported: aliases ship through `catalog.json` (D7), so put it in the next catalog PR.
- **PROMOTE** when several users created the same generic food and the catalog lacks it. Find it in FDC (SR Legacy/Foundation) or CIQUAL with `scripts/ingredients/search-sources.ts`, add it to `catalog-draft.json`, and rebuild with `build-catalog.ts`; the validators must pass. Open the PR. **Apply only after it is merged and deployed**, because the deploy's sync creates the global row. Until then, apply reports "not synced yet" and skips it.
- **KEEP** for brand-specific products, home recipes saved as an ingredient, or anything ambiguous. When in doubt, keep.
- **REJECT_DATA** for implausible numbers (sanity flags). The owner gets an in-app "please check this ingredient" notice. Their row and recipes are left as they are.
- A merge outside tolerance is refused. Override it with `"force": true, "reason": "…"` only when you are sure the user's label is wrong or stated per serving and not per 100 g.

## 3. Ship catalog changes (only if PROMOTE / addAlias)

Open a branch named `feat/catalog-review-<date>` with the `catalog.json` change. In the PR body, list the new rows with `sourceRef` and the aliases. CI runs the validators; the owner merges, and deploy-on-push syncs the rows.

## 4. Dry run against prod

```bash
F=scripts/ingredients/out/review/review-<today>.decisions.json
cat $F | ssh chefer "docker exec -i chefer-api sh -c 'cat > /tmp/decisions.json'"
ssh chefer "docker exec chefer-api sh -c 'cd apps/api && npx tsx src/scripts/ingredients-review-apply.ts /tmp/decisions.json'"
```

The default is a dry run. Check every "skipped" line: a refused merge (tolerance) or a missing target is your cue to fix the decision, not to force it.

## 5. Apply

```bash
ssh chefer "/home/ubuntu/chefer/infrastructure/scripts/backup-db.sh"
ssh chefer "docker exec chefer-api sh -c 'cd apps/api && npx tsx src/scripts/ingredients-review-apply.ts /tmp/decisions.json --apply'"
```

For each merged row, apply does the following:

- relinks the owner's recipe lines to the global row;
- recomputes those recipes, re-deriving grams through the global row's portions and density;
- keeps the numbers of USER_ENTERED recipes that still don't compute (D4);
- marks the row MERGED;
- moves its owner aliases and linked price rows to the global row, so the owner's free text keeps resolving;
- writes one in-app notice per user per review (D6, no email).

It prints a summary such as "3 merged, 37 recipes recomputed, max kcal change −12%". Re-running it is safe: merged rows are skipped.

## 6. Verify

```bash
ssh chefer "docker exec chefer-api sh -c 'cd apps/api && npx tsx src/scripts/ingredients-verify.ts'"
```

It must report 0 problems (I1: stored numbers equal a fresh computation; I3: no COMPUTED line on a missing, inactive or foreign row). Then delete `/tmp/review` and `/tmp/decisions.json` in the container, and record in that week's session what was merged, promoted and kept.

## Notes

- The notices are served by `ingredients.notices` / `ingredients.dismissNotice`. As of P10, neither the web nor the mobile client displays them yet; see the plan §8.3 follow-up.
- The tooling only reads and writes through the API's repositories and services, the same paths the app uses. Never edit `ingredients` rows with SQL.
- First dry run: on 2026-10-01, against a local restore of that night's prod backup (after the P8 migration on the copy), the report found 2 private ingredients. Apply merged one within tolerance, refused the other (its numbers are far from the nearest row), and held a PROMOTE until the row is synced. The re-run was a no-op, and verify passed.
