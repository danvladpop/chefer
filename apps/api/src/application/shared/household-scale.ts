// ─── Household portion scaling (backlog P2-3, audit F-PM-5) ───────────────────
// A premium household's list and week cost are sized for the whole table:
// every recipe's ingredients scale from the servings they were written for
// to the household's portion sum. A recipe generated for the table already
// (servings = portions) gets factor 1; a single-portion curated recipe gets
// ×portions. Free households and solo users pass no portions → factor 1.

/** Ingredient multiplier for one recipe; 1 when there is nothing to scale. */
export function householdScaleFactor(
  recipeServings: number | null | undefined,
  portions: number | null | undefined,
): number {
  if (portions == null || !(portions > 0)) return 1;
  return portions / Math.max(1, recipeServings ?? 1);
}
