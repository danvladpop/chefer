'use client';

import { useMemo } from 'react';
import { toNutritionIngredient } from '@/features/ingredients/lib/picked-ingredient';
import { trpc } from '@/lib/trpc';
import type { LineProblem, NutritionFacts } from '@chefer/types';
import { computeRecipeNutrition, type NutritionIngredient } from '@chefer/utils';
import { isCompleteRow, lineRowQuantity, type LineRow } from '../lib/recipe-lines';

// ─── Live nutrition preview (plan-ingredient-catalog §10) ─────────────────────
// The same engine the server runs (`computeRecipeNutrition` in @chefer/utils),
// over the picked rows' full catalog data from `ingredients.getMany`. The
// server recomputes on save; this only previews it. Nothing is estimated: an
// unlinked row or a unit that cannot convert makes the result PARTIAL.

export interface LiveNutrition {
  status: 'EMPTY' | 'COMPUTED' | 'PARTIAL';
  perServing: NutritionFacts;
  /** Complete, non-optional rows counted. */
  lineCount: number;
  /** Complete, non-optional rows that contribute no grams. */
  missingCount: number;
  /** Problem per row key (complete rows only). */
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
    const complete = rows.filter(isCompleteRow);
    if (complete.length === 0) {
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
    const result = computeRecipeNutrition(
      complete.map((r) => ({
        ingredientId: r.ingredient?.id ?? null,
        quantity: lineRowQuantity(r) ?? 0,
        unit: r.unit,
        optional: r.optional,
      })),
      lookup,
      servings,
    );
    const problems = new Map<string, LineProblem>();
    let missing = 0;
    let loading = false;
    for (const [i, row] of complete.entries()) {
      const line = result.lines[i];
      if (!line?.problem) continue;
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
      lineCount: complete.filter((r) => !r.optional).length,
      missingCount: missing,
      problems,
      loading: loading || (isFetching && ids.some((id) => !lookup.has(id))),
    };
  }, [rows, details, servings, isFetching, ids]);
}
