import type { LoggedMealEntry } from '@chefer/database';

/** A planned-recipe entry (as opposed to a custom quick-add or scan). */
export function isRecipeEntry(m: LoggedMealEntry): m is LoggedMealEntry & { recipeId: string } {
  return typeof m.recipeId === 'string' && !m.custom;
}

/**
 * Merges a client's tracker save into the stored day.
 *
 * `tracker.upsertDay` used to replace the whole day with what the client
 * sent, and the tracker only renders today's planned meals. So a meal logged
 * from cook mode whose recipe later left the plan (regenerate or swap) was
 * invisible on the page and deleted by the next save (audit F-PM-1), and a
 * stale tab's copy of the custom entries overwrote entries added elsewhere
 * (F-TRK-1-2). Now:
 *
 * - Custom entries (quick-add, photo scan) are server-owned: added by
 *   logCustomMeal, removed by deleteCustomMeal, never by a day save. Whatever
 *   custom entries the client echoes back are ignored.
 * - Planned-recipe entries the client could see (today's planned recipes, or
 *   any recipe it sends) are replaced by the client's list — that is how the
 *   tracker ticks and unticks meals.
 * - Every other stored recipe entry is kept: the client never saw it, so it
 *   can't have meant to remove it.
 */
export function mergeLoggedMeals(
  stored: LoggedMealEntry[],
  incoming: LoggedMealEntry[],
  plannedRecipeIds: ReadonlySet<string>,
): LoggedMealEntry[] {
  const incomingRecipes = incoming.filter(isRecipeEntry);
  const clientManaged = new Set<string>([
    ...plannedRecipeIds,
    ...incomingRecipes.map((m) => m.recipeId),
  ]);
  const keptRecipes = stored.filter(
    (m) => m.recipeId && !m.custom && !clientManaged.has(m.recipeId),
  );
  const customs = stored.filter((m) => m.custom);
  return [...incomingRecipes, ...keptRecipes, ...customs];
}
