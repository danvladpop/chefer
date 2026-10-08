'use client';

import { trpc } from '@/lib/trpc';

/**
 * The "How you cook" setting (1 = just me, 2 = two of us), or null when unset.
 * With `useHousehold().scaledMembers` it tells the recipe page and cook mode
 * how big the table is (`defaultCookServings` → `portionsFor`); a plan slot's
 * portion stays the user's own (UX-PLAN-02). Mirrors mobile's `useCookingFor`.
 */
export function useCookingFor(): number | null {
  const { data: shape } = trpc.mealPlan.getShape.useQuery(undefined, { staleTime: 60_000 });
  return shape?.cookingFor ?? null;
}
