'use client';

import { useMemo } from 'react';
import { toNutritionIngredient } from '@/features/ingredients/lib/picked-ingredient';
import { trpc } from '@/lib/trpc';
import type { LineProblem, NutritionFacts } from '@chefer/types';
import {
  computeRecipeNutrition,
  formNutritionLines,
  type NutritionIngredient,
} from '@chefer/utils';
import { lineRowName, lineRowQuantity, type LineRow } from '../lib/recipe-lines';

// ─── Live nutrition preview (plan-ingredient-catalog §10) ─────────────────────
// The same engine the server runs (`computeRecipeNutrition` in @chefer/utils),
// over the picked rows' full catalog data from `ingredients.getMany`. The
// server recomputes on save; this only previews it. Nothing is estimated: an
// unlinked row or a unit that cannot convert makes the result PARTIAL.
// F2: lines come from the shared `formNutritionLines` (as on mobile), so a
// named row with no amount counts as BAD_QTY — the save rule rejects it too.

export interface LiveNutrition {
  status: 'EMPTY' | 'COMPUTED' | 'PARTIAL';
  perServing: NutritionFacts;
  /** Named, non-optional rows counted. */
  lineCount: number;
  /** Named, non-optional rows that contribute no grams. */
  missingCount: number;
  /** Problem per row key (named rows only). */
  problems: Map<string, LineProblem>;
  /** Catalog data for some picked rows is still loading. */
  loading: boolean;
}

const ZERO: NutritionFacts = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export function useLiveNutrition(rows: readonly LineRow[], servings: number): LiveNutrition {
  const ids = useMemo(
    () => [...new Set(rows.flatMap((r) => (r.ingredient ? [r.ingredient.id] : [])))].sort(),
    [rows],
  );
  const { data: details, isFetching } = trpc.ingredients.getMany.useQuery(
    { ids },
    { enabled: ids.length > 0, staleTime: 5 * 60_000, placeholderData: (prev) => prev },
  );

  return useMemo(() => {
    const { lines, rowOf } = formNutritionLines(
      rows.map((r) => ({
        name: lineRowName(r),
        quantity: lineRowQuantity(r),
        unit: r.unit,
        ingredientId: r.ingredient?.id ?? null,
        optional: r.optional,
      })),
    );
    if (lines.length === 0) {
      return {
        status: 'EMPTY',
        perServing: ZERO,
        lineCount: 0,
        missingCount: 0,
        problems: new Map(),
        loading: false,
      };
    }
    const lookup = new Map<string, NutritionIngredient>(
      (details ?? []).map((d) => [d.id, toNutritionIngredient(d)] as const),
    );
    const result = computeRecipeNutrition(lines, lookup, servings);
    const problems = new Map<string, LineProblem>();
    let missing = 0;
    let loading = false;
    for (const [k, line] of result.lines.entries()) {
      const row = rows[rowOf[k] ?? -1];
      if (!row || !line.problem) continue;
      // A picked row whose data has not arrived yet is loading, not missing.
      if (line.problem === 'NO_INGREDIENT' && row.ingredient && !lookup.has(row.ingredient.id)) {
        loading = true;
        continue;
      }
      problems.set(row.key, line.problem);
      if (!line.optional) missing += 1;
    }
    return {
      status: missing > 0 ? 'PARTIAL' : 'COMPUTED',
      perServing: result.perServing,
      lineCount: lines.filter((l) => !l.optional).length,
      missingCount: missing,
      problems,
      loading: loading || (isFetching && ids.some((id) => !lookup.has(id))),
    };
  }, [rows, details, servings, isFetching, ids]);
}
