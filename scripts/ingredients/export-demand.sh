#!/usr/bin/env bash
# P0 demand export (docs/plan-ingredient-catalog.md §4.4 step 1).
# Read-only: every query runs with default_transaction_read_only=on.
# Output goes to scripts/ingredients/out/ (git-ignored: it may contain private names).
#
#   scripts/ingredients/export-demand.sh            # prod (ssh chefer)
#   scripts/ingredients/export-demand.sh --env dev  # local chefer-postgres / chefer_dev
set -euo pipefail

ENV=prod
[[ "${1:-}" == "--env" ]] && ENV="${2:-prod}"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
[[ "$ENV" == prod ]] || OUT="$OUT/$ENV"
mkdir -p "$OUT"

if [[ "$ENV" == prod ]]; then
  run() { ssh chefer "docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' chefer-postgres psql -U chefer -d chefer -X -q -A -F \$'\t' -P footer=off"; }
else
  run() { docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' chefer-postgres psql -U postgres -d chefer_dev -X -q -A -F $'\t' -P footer=off; }
fi

# Same normalization as normalizeIngredientName (lowercase, trim, collapse whitespace).
NORM="lower(regexp_replace(btrim(l->>'name'), '\s+', ' ', 'g'))"
UNORM="lower(regexp_replace(btrim(coalesce(l->>'unit', '')), '\s+', ' ', 'g'))"
LINES="from recipes r, jsonb_array_elements(r.ingredients) l where jsonb_typeof(r.ingredients) = 'array'"

# demand.tsv: name, line count, recipe count, per-source recipe counts
run > "$OUT/demand.tsv" <<SQL
select $NORM as name, count(*) as lines, count(distinct r.id) as recipes,
       count(distinct r.id) filter (where r.source = 'AI') as ai,
       count(distinct r.id) filter (where r.source = 'CURATED') as curated,
       count(distinct r.id) filter (where r.source = 'MANUAL') as manual
$LINES group by 1 order by 2 desc, 1;
SQL

# name-units.tsv: distinct (name, raw unit) pairs, needed by §7 legacy mapping
run > "$OUT/name-units.tsv" <<SQL
select $NORM as name, $UNORM as unit, count(*) as lines,
       min((l->>'quantity')::text) as min_qty, max((l->>'quantity')::text) as max_qty
$LINES group by 1, 2 order by 3 desc, 1, 2;
SQL

# units.tsv: distinct raw units overall
run > "$OUT/units.tsv" <<SQL
select $UNORM as unit, count(*) as lines $LINES group by 1 order by 2 desc;
SQL

# global-prices.tsv: every global ingredient_prices row (current macros are AI estimates, F1)
run > "$OUT/global-prices.tsv" <<SQL
select "ingredientName", source, "caloriesPer100g", "proteinPer100g", "carbsPer100g",
       "fatPer100g", "fiberPer100g", "gramsPerPiece"
from ingredient_prices where "creatorId" is null order by 1;
SQL

# private-prices.tsv: private rows, names + owner count only (no ids, no emails)
run > "$OUT/private-prices.tsv" <<SQL
select "ingredientName", count(distinct "creatorId") as owners
from ingredient_prices where "creatorId" is not null group by 1 order by 1;
SQL

# summary
run > "$OUT/summary.tsv" <<SQL
select 'recipes', count(*)::text from recipes
union all select 'recipes_' || source, count(*)::text from recipes group by source
union all select 'lines', count(*)::text $LINES
union all select 'distinct_names', count(distinct $NORM)::text $LINES
union all select 'distinct_name_unit_pairs', count(distinct ($NORM, $UNORM))::text $LINES
union all select 'distinct_units', count(distinct $UNORM)::text $LINES
union all select 'global_prices', count(*)::text from ingredient_prices where "creatorId" is null
union all select 'private_prices', count(*)::text from ingredient_prices where "creatorId" is not null;
SQL

echo "wrote $(ls "$OUT" | wc -l | tr -d ' ') files to $OUT ($ENV)"
