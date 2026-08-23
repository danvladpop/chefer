import type { WeekPlanResponse } from '../../lib/ai/types.js';

// ─── "Cook once, eat twice" leftovers pairing (F3, pure) ─────────────────────
// Deterministic post-processing for the leftovers generation option
// (premium_plan.md §5 W2-E.5): pair up to MAX_LEFTOVER_PAIRS dinner →
// next-day-lunch slots. The paired dinner is doubled (2× servings AND 2×
// ingredient quantities — you cook twice the food), and the next day's lunch
// becomes the same dish labeled via the MealSlot's optional `leftoverOf`
// field ("Leftovers from Tuesday") — Json only, no schema change.
//
// Wiring (integrator, household-owned meal-plan.service.ts): when the
// generation input has `leftoversMode`, run the AI result through
// `pairLeftovers(weekPlan)` before persisting, and carry each slot's
// `leftoverOf` into the persisted meal Json + DTO.

export const MAX_LEFTOVER_PAIRS = 3;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Pairs dinners with next-day lunches (never chaining two pairs on adjacent
 * days, so the week keeps fresh lunches too). Returns a NEW plan — the input
 * is not mutated. Pairing is skipped for days without a dinner or a next-day
 * lunch; with fewer than 1 eligible pair the plan comes back unchanged.
 */
export function pairLeftovers(
  plan: WeekPlanResponse,
  maxPairs: number = MAX_LEFTOVER_PAIRS,
): WeekPlanResponse {
  const result = structuredClone(plan);
  const daysByIndex = new Map(result.days.map((d) => [d.dayOfWeek, d]));

  let paired = 0;
  let dayIndex = 0;
  while (dayIndex < 6 && paired < maxPairs) {
    const today = daysByIndex.get(dayIndex);
    const tomorrow = daysByIndex.get(dayIndex + 1);
    const dinner = today?.meals.find((m) => m.type === 'dinner');
    const lunchIdx = tomorrow?.meals.findIndex((m) => m.type === 'lunch') ?? -1;

    if (dinner && tomorrow && lunchIdx >= 0) {
      // Double the dinner: 2× servings, 2× ingredients. Clone the recipe so a
      // fixture-shared object used elsewhere in the week is untouched.
      const doubled = {
        ...dinner.recipe,
        servings: dinner.recipe.servings * 2,
        ingredients: dinner.recipe.ingredients.map((ing) => ({
          ...ing,
          quantity: Math.round(ing.quantity * 2 * 100) / 100,
        })),
      };
      dinner.recipe = doubled;
      tomorrow.meals[lunchIdx] = {
        type: 'lunch',
        recipe: doubled,
        leftoverOf: DAY_NAMES[dayIndex] ?? `day ${dayIndex}`,
      };
      paired += 1;
      dayIndex += 2; // skip a day — not every lunch should be leftovers
    } else {
      dayIndex += 1;
    }
  }

  return result;
}
