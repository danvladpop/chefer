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
// T-08.10 (bug B-50): the Replace picker dedupes by id, drops the meal being
// replaced and narrows to the slot's meal type. The candidate rows come from
// `recipe.list({ forTable: true })`, already safety-filtered by
// `RecipeService.list` (T-01.2). The filter itself is shared with the mobile
// and web pickers, so it lives in `@chefer/utils` (`recipe-picker.ts`); the
// API re-exports it rather than keeping a second copy.
export {
  filterReplaceCandidates,
  type FilterReplaceCandidatesOptions,
  type ReplaceCandidateLike,
} from '@chefer/utils';
