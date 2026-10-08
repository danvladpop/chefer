import { slotPortion } from './meal-portion';
import { formatFractionalQuantity } from './scaled-quantity';

// ─── Portions: "what I eat" vs "what we cook" (UX-PLAN-02, UX-REC-02) ─────────
// Three different numbers used to share one field. The plan slot's `portion`
// is the EATER's calorie-driven share of one serving — what the signed-in user
// eats and logs. The table is everyone who eats from the same pot: the user's
// own portion plus each household member's `portionFactor` (or, with no
// members, a "cooking for N" setting meaning N − 1 standard-sized extra
// people). Shop and cook mode scale to the table; nutrition, "I ate this" and
// the day totals never do.
//
// One helper so the planner, the dashboard, recipe page, cook mode and the
// shopping list cannot drift apart again (audit §6.5).

export type PortionsInput = {
  /** The signed-in user's own portion of one serving (a plan slot's `portion`). Default 1. */
  eaterPortion?: number | null | undefined;
  /** Household members (`portionFactor` is each member's share of one serving). */
  members?: readonly { portionFactor: number }[] | null | undefined;
  /**
   * The "How you cook" setting (1 = just me, 2 = two of us …). Only used when
   * there are no members — members describe the table exactly, so they win.
   * Each extra person is a standard (1×) portion.
   */
  cookingFor?: number | null | undefined;
  /**
   * Servings the recipe's ingredient list was written for. Only matters for a
   * members table (premium household scaling), where Shop scales
   * `cookServings ÷ recipeServings` — a recipe already sized to the table
   * needs no further scaling.
   */
  recipeServings?: number | null | undefined;
};

export type Portions = {
  /** The user's own portion — what they eat, log and count towards their targets. */
  eaterPortion: number;
  /** Servings the whole table eats (eater + everyone else). Round only for display. */
  cookServings: number;
  /** Multiplier Shop (and the cost estimate) scales the recipe's ingredient quantities by. */
  shopMultiplier: number;
  /** Portions the people other than the user eat (0 when cooking just for one). */
  othersServings: number;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Servings the people other than the eater eat. */
function othersServings(
  members: PortionsInput['members'],
  cookingFor: PortionsInput['cookingFor'],
): number {
  if (members && members.length > 0) {
    return members.reduce((sum, m) => sum + Math.max(0, m.portionFactor), 0);
  }
  if (typeof cookingFor === 'number' && Number.isFinite(cookingFor) && cookingFor >= 2) {
    return Math.floor(cookingFor) - 1;
  }
  return 0;
}

export function portionsFor(input: PortionsInput = {}): Portions {
  const eaterPortion = slotPortion(input.eaterPortion);
  const others = round2(othersServings(input.members, input.cookingFor));
  const cookServings = round2(eaterPortion + others);
  const hasMembers = (input.members?.length ?? 0) > 0;
  const shopMultiplier =
    hasMembers && input.recipeServings != null
      ? round2(cookServings / Math.max(1, input.recipeServings))
      : cookServings;
  return { eaterPortion, cookServings, shopMultiplier, othersServings: others };
}

/** "You 2× · Mia ½ · Noah 1 = 3½" — the breakdown shown next to the servings stepper. */
export function tableBreakdown(
  eaterPortion: number,
  members: readonly { name: string; portionFactor: number }[],
): string | null {
  if (members.length === 0) return null;
  const { cookServings } = portionsFor({ eaterPortion, members });
  const formatNumber = formatFractionalQuantity;
  const parts = [
    `You ${formatNumber(slotPortion(eaterPortion))}`,
    ...members.map((m) => `${m.name} ${formatNumber(m.portionFactor)}`),
  ];
  return `${parts.join(' · ')} = ${formatNumber(cookServings)}`;
}
