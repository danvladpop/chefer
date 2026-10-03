import { trpc } from '../lib/trpc';

/**
 * The "How you cook" setting (1 = just me, 2 = two of us), or null when unset.
 * With `useHousehold().scaledMembers` it tells recipe/cook screens how big the
 * table is (`defaultCookServings` → `portionsFor`); a plan slot's portion stays
 * the user's own (UX-PLAN-02). Mirrors apps/web/src/hooks/useCookingFor.ts.
 */
export function useCookingFor(): number | null {
  const { data: shape } = trpc.mealPlan.getShape.useQuery(undefined, { staleTime: 60_000 });
  return shape?.cookingFor ?? null;
}
