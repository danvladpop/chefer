import { useMemo, useRef } from 'react';
import {
  computeRecipeNutrition,
  nutritionIngredientFromDetail,
  type NutritionIngredient,
  type NutritionLineInput,
  type RecipeNutritionResult,
} from '@chefer/utils';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { useIsOnline } from '../recipes/form/use-is-online';

export type CatalogIngredientDetail = RouterOutputs['ingredients']['getMany'][number];

export interface UseComputedNutritionResult {
  /** The shared engine over the form's lines; undefined until there is a line to compute. */
  result: RecipeNutritionResult | undefined;
  /** Rows the form's lines link to, by id — names, portions and density for the unit picker. */
  details: ReadonlyMap<string, CatalogIngredientDetail>;
  /** Catalog rows are loading for a newly linked line — the card dims the old numbers (MO-06). */
  isComputing: boolean;
  hasIngredients: boolean;
  online: boolean;
}

/**
 * Live nutrition preview (plan-ingredient-catalog §10): the SAME engine the
 * server stores with (`computeRecipeNutrition` in @chefer/utils), over the
 * catalog rows `ingredients.getMany` returns for the lines' `ingredientId`s.
 * Only new ids cost a request; quantities, units and servings recompute
 * locally on every keystroke, so there is no debounce.
 *
 * Rows already fetched are kept in a per-screen cache, so adding a line never
 * blanks the others while the new row loads, and offline the last known rows
 * keep computing. A line whose row is unknown counts as PARTIAL — the server
 * recomputes on save regardless (§6.2).
 */
export function useComputedNutrition(
  lines: readonly NutritionLineInput[],
  servings: number,
): UseComputedNutritionResult {
  const online = useIsOnline();
  const cache = useRef(new Map<string, CatalogIngredientDetail>());

  const idsKey = [...new Set(lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])))]
    .sort()
    .join(',');
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  const missing = ids.filter((id) => !cache.current.has(id));

  const query = trpc.ingredients.getMany.useQuery(
    { ids: missing.length > 0 ? missing : ids },
    {
      enabled: online && missing.length > 0,
      staleTime: 5 * 60_000,
    },
  );
  for (const row of query.data ?? []) cache.current.set(row.id, row);

  const details = cache.current;
  const knownKey = ids.filter((id) => details.has(id)).join(',');
  const linesKey = JSON.stringify(lines);
  const roundedServings = Math.max(1, Math.round(servings) || 1);
  const result = useMemo(() => {
    if (lines.length === 0) return undefined;
    const lookup = new Map<string, NutritionIngredient>();
    for (const id of ids) {
      const d = details.get(id);
      if (d) lookup.set(id, nutritionIngredientFromDetail(d));
    }
    return computeRecipeNutrition(lines, lookup, roundedServings);
    // `lines` is a fresh array each render; its JSON and the known-row ids are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, knownKey, roundedServings]);

  return {
    result,
    details,
    isComputing: online && missing.length > 0 && query.isFetching,
    hasIngredients: lines.length > 0,
    online,
  };
}
