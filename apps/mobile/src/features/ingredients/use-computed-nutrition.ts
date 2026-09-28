import { useEffect, useState } from 'react';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { useIsOnline } from '../recipes/form/use-is-online';

export type ComputedNutritionResult = RouterOutputs['ingredients']['computeNutrition'];

export interface ComputedNutritionIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface UseComputedNutritionResult {
  /** Last known result — kept across a re-compute (shimmer) and while offline. */
  data: ComputedNutritionResult | undefined;
  /** A NEW computation is in flight — the caller shows the OLD numbers dimmed, not a spinner. */
  isComputing: boolean;
  hasIngredients: boolean;
  online: boolean;
}

const DEBOUNCE_MS = 600;

/**
 * T-40.9 (UX-40 slice 2): debounced wrapper over `ingredients.computeNutrition`
 * — the web model (`apps/web/src/app/(dashboard)/recipes/new/page.tsx`'s own
 * 600 ms debounce + `placeholderData: (p) => p`). `enabled` is the nutrition
 * section's own "computed" mode switch — pass false while the form is in
 * manual mode so this never fetches needlessly. Offline: the query is
 * disabled (never refetches) but React Query keeps serving the last
 * successful `data`, so the last computed numbers simply stay on screen.
 */
export function useComputedNutrition(
  ingredients: ComputedNutritionIngredient[],
  servings: number,
  enabled: boolean,
): UseComputedNutritionResult {
  const online = useIsOnline();
  const [debounced, setDebounced] = useState(ingredients);

  const key = JSON.stringify(ingredients);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(ingredients), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `ingredients` is a fresh array every render; the JSON key is the real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const hasIngredients = debounced.length > 0;
  const query = trpc.ingredients.computeNutrition.useQuery(
    { ingredients: debounced, servings: Math.max(1, Math.round(servings) || 1) },
    {
      enabled: enabled && online && hasIngredients,
      staleTime: 30_000,
      placeholderData: (prev) => prev,
    },
  );

  return {
    data: query.data,
    isComputing: enabled && hasIngredients && query.isFetching,
    hasIngredients,
    online,
  };
}
