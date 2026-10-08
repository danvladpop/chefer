import { portionsFor } from '@chefer/utils';

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

// ─── The table a slot is cooked for (UX-PLAN-02, UX-REC-02) ───────────────────
// A plan slot's `portion` is the EATER's share only. Shop, the cost chip and
// the pantry savings scale it to the table through `portionsFor`:
//   • members (premium household scaling) — the eater's portion + each member;
//   • otherwise "How you cook: two of us" — the eater's portion + a standard
//     portion per extra person.
// `null` = nothing to scale beyond the eater's own portion.

export type PortionTable = {
  members: readonly { portionFactor: number }[];
  cookingFor: number | null;
};

/** Ingredient multiplier for one plan slot cooked for `table` (the slot's portion is the eater's). */
export function slotShopFactor(
  slotPortion: number | null | undefined,
  recipeServings: number | null | undefined,
  table: PortionTable | null | undefined,
): number {
  return portionsFor({
    eaterPortion: slotPortion,
    members: table?.members ?? [],
    cookingFor: table?.cookingFor ?? null,
    recipeServings,
  }).shopMultiplier;
}
