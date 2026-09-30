import type { FriendMacroTotals } from '@chefer/types';
import { sumPlanDay } from '../meal-portion';

export type NutritionLike = {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
};

export type TotalsSlot = { nutrition: NutritionLike; portion?: number | null | undefined };

// Same maths and rounding as `sumPlanDay` (meal-portion.ts), the one sum the
// owner's own plan shows: each slot is scaled by its portion and the day is
// rounded once, at the end (never a sum of rounded slots, which can drift by 1).

function toPlanMeals(slots: readonly TotalsSlot[]): Parameters<typeof sumPlanDay>[0] {
  return slots.map((s) => ({
    portion: s.portion,
    recipe: {
      nutritionInfo: {
        calories: s.nutrition.calories ?? 0,
        protein: s.nutrition.protein ?? 0,
        carbs: s.nutrition.carbs ?? 0,
        fat: s.nutrition.fat ?? 0,
      },
    },
  }));
}

/** One slot at its portion (kcal and grams rounded whole; missing macros count 0). */
export function slotTotals(
  nutrition: NutritionLike,
  portion: number | null | undefined,
): FriendMacroTotals {
  return sumPlanDay(toPlanMeals([{ nutrition, portion }]));
}

/** A day's totals: identical to `sumPlanDay` over the same slots. */
export function dayTotals(slots: readonly TotalsSlot[]): FriendMacroTotals {
  return sumPlanDay(toPlanMeals(slots));
}

/**
 * Average kcal/day over the days that have meals, rounded; `null` when no day
 * has a meal (the UI then hides "avg").
 */
export function weekAverageKcal(
  days: readonly { meals: readonly unknown[]; totals: { kcal: number } }[],
): number | null {
  const planned = days.filter((d) => d.meals.length > 0);
  if (planned.length === 0) return null;
  return Math.round(planned.reduce((sum, d) => sum + d.totals.kcal, 0) / planned.length);
}
