import { mealPlanRepository, type IMealPlanRepository, type Recipe } from '@chefer/database';

/**
 * Who may see a recipe.
 *
 * MANUAL recipes — written or imported by a user — are private to their
 * creator. AI and CURATED recipes are open: they carry no personal content,
 * and older AI rows are shared between users' plans by design. A recipe that
 * already sits in one of the user's own plans stays visible whoever made it,
 * so a plan never shows a dish its owner can't open.
 *
 * Before this check, any signed-in user could read, favourite, rate, pin or
 * copy another user's private recipe by id (audit F-REC-2-1, F-REC-2-2,
 * F-X-4-1, F-PLAN-3-1).
 */
export function isRecipeOpenTo(
  recipe: Pick<Recipe, 'source' | 'creatorId'>,
  userId: string,
): boolean {
  return recipe.source !== 'MANUAL' || recipe.creatorId === userId;
}

/**
 * Loads a recipe if the user may see it. Returns null both when it doesn't
 * exist and when it's someone else's private recipe, so callers answer
 * NOT_FOUND either way and ids can't be probed.
 */
export async function findRecipeVisibleTo(
  userId: string,
  recipeId: string,
  repo: Pick<IMealPlanRepository, 'findRecipeById' | 'isRecipeInUserPlans'> = mealPlanRepository,
): Promise<Recipe | null> {
  const recipe = await repo.findRecipeById(recipeId);
  if (!recipe) return null;
  if (isRecipeOpenTo(recipe, userId)) return recipe;
  return (await repo.isRecipeInUserPlans(userId, recipeId)) ? recipe : null;
}

// ─── Replace picker candidates (T-08.10, bug B-50) ─────────────────────────────
// Server half: dedupe by id and drop the meal being replaced; the picker
// list is already safety-filtered upstream by `RecipeService.list({
// forTable: true })` (T-01.2). L-PLAN's `meal-plan.router.ts` calls this
// with the rows `recipe.list({ forTable: true })` returns, the slot's meal
// type (when the picker should offer only that slot's kind — B-50's "no
// slot filter") and the id of the recipe currently occupying the slot
// (never re-offer the meal you're replacing).

export interface ReplaceCandidateLike {
  id: string;
  /** Present on recipes that carry a meal-type hint (curated pool rows). Absent ones always pass the slot filter. */
  mealType?: string | null | undefined;
}

export interface FilterReplaceCandidatesOptions {
  /** Only offer candidates for this slot's meal type; omit to skip the filter. */
  slotType?: string | undefined;
  /** The recipe currently in the slot — never re-offered as its own replacement. */
  excludeRecipeId?: string | undefined;
}

/**
 * Dedupes a Replace-picker candidate list by id, drops the recipe currently
 * occupying the slot, and (when `slotType` is given) keeps only candidates
 * whose own `mealType` matches it or that don't carry one at all (a manual/
 * imported recipe has no fixed meal type, so it's never wrongly excluded).
 */
export function filterReplaceCandidates<T extends ReplaceCandidateLike>(
  candidates: readonly T[],
  opts: FilterReplaceCandidatesOptions = {},
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const candidate of candidates) {
    if (opts.excludeRecipeId && candidate.id === opts.excludeRecipeId) continue;
    if (seen.has(candidate.id)) continue;
    if (opts.slotType && candidate.mealType && candidate.mealType !== opts.slotType) continue;
    seen.add(candidate.id);
    result.push(candidate);
  }
  return result;
}
