import { randomUUID } from 'node:crypto';
import type { WeekPlanResponse } from '../../lib/ai/index.js';

/**
 * Replaces the LLM-chosen recipe ids in a generated week with server-minted
 * ones, keeping every slot that shared an id pointing at the same new id.
 *
 * LLM ids are name slugs ("baked-cod-with-lemon"), and recipes are stored
 * under their id. A slug that already existed — the same dish generated for
 * another user, or an unrelated dish that slugged the same — hit the upsert's
 * update branch, which keeps the stored ingredients and nutrition. The plan
 * then showed a recipe that was never checked against this user's allergies
 * (audit F-PLAN-1-1 / F-X-4-3). Fresh ids make every generated recipe a new
 * row owned by the user it was generated for.
 */
export function withServerRecipeIds(
  plan: WeekPlanResponse,
  newId: () => string = randomUUID,
): WeekPlanResponse {
  const ids = new Map<string, string>();
  const remap = (id: string): string => {
    let next = ids.get(id);
    if (!next) {
      next = newId();
      ids.set(id, next);
    }
    return next;
  };

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: day.meals.map((slot) => ({
        ...slot,
        recipe: { ...slot.recipe, id: remap(slot.recipe.id) },
      })),
    })),
  };
}
