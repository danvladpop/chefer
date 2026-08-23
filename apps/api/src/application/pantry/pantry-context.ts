import { pantryItemRepository, type IPantryItemRepository } from '@chefer/database';
import type { MealPlanInput } from '../../lib/ai/types.js';
import { buildPantryMatcher } from './pantry-match.js';

// ─── Pantry generation context provider (F3) ─────────────────────────────────
// The seam between the pantry and the household-owned meal-plan loader
// (premium_plan.md §5): pantry never edits meal-plan.service.ts — the
// integrator wires exactly two calls into the premium generate path:
//
//   1. BEFORE the AI call, when building `aiInput`:
//        useFirstIngredients: await getUseFirstIngredients(userId)
//      (an empty array keeps the prompt byte-identical — the section builder
//      no-ops on empty.)
//
//   2. AFTER generation, when assembling `personalisation`:
//        usedPantryItems: await computeUsedPantryItemsForUser(userId, weekPlan.days)
//      → the meal-plan UI banner "uses N things you already have" and the
//        `plan_used_pantry {itemCount}` analytics event.

export type UseFirstIngredient = NonNullable<MealPlanInput['useFirstIngredients']>[number];

/** Top-N use-first items handed to the prompt — enough to steer, not to spam. */
export const USE_FIRST_DEFAULT_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Human line the prompt (and UI) can show for WHY an item should be used
 * first. Exported for tests.
 */
export function useFirstReason(updatedAt: Date, quantity: number, now = new Date()): string {
  const ageDays = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / DAY_MS));
  if (quantity === 0) return 'some left — use it up';
  if (ageDays <= 7) return 'bought this week';
  if (ageDays <= 14) return 'bought last week';
  return `in the kitchen for ${Math.floor(ageDays / 7)} weeks`;
}

/**
 * The top-N pantry items generation should try to use, OLDEST first (the
 * longest-sitting items are the waste risk). Shape matches the
 * `MealPlanInput.useFirstIngredients` seam field exactly; quantity 0 means
 * "some" (see PantryItemRepository) and the prompt section renders it so.
 */
export async function getUseFirstIngredients(
  userId: string,
  limit: number = USE_FIRST_DEFAULT_LIMIT,
  repo: IPantryItemRepository = pantryItemRepository,
): Promise<UseFirstIngredient[]> {
  const items = await repo.findByUser(userId); // oldest updatedAt first
  return items.slice(0, Math.max(0, limit)).map((item) => ({
    name: item.ingredientName,
    quantity: item.quantity,
    unit: item.unit,
    reason: useFirstReason(item.updatedAt, item.quantity),
  }));
}

// ─── Post-generation personalisation ─────────────────────────────────────────

/** Structural day shape — fits both WeekPlanResponse and the plan DTO. */
export interface PlanDayLike {
  meals: { recipe: { ingredients: { name: string }[] } }[];
}

/**
 * Pantry item names (normalized) that the generated plan actually uses —
 * pure, fixture-testable. Order follows the pantry's use-first order.
 */
export function computeUsedPantryItems(days: PlanDayLike[], pantryNames: string[]): string[] {
  const matcher = buildPantryMatcher(pantryNames);
  const used = new Set<string>();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const ing of meal.recipe.ingredients) {
        const hit = matcher(ing.name);
        if (hit) used.add(hit);
      }
    }
  }
  return pantryNames.filter((name) => used.has(name.toLowerCase().trim().replace(/\s+/g, ' ')));
}

/** Convenience overload for the integrator — loads the pantry itself. */
export async function computeUsedPantryItemsForUser(
  userId: string,
  days: PlanDayLike[],
  repo: IPantryItemRepository = pantryItemRepository,
): Promise<string[]> {
  const items = await repo.findByUser(userId);
  return computeUsedPantryItems(
    days,
    items.map((item) => item.ingredientName),
  );
}
