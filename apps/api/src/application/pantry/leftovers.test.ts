import { describe, expect, it } from 'vitest';
import type { RecipeData, WeekPlanResponse } from '../../lib/ai/types.js';
import { pairLeftovers } from './leftovers.js';

const recipe = (id: string, servings = 2): RecipeData => ({
  id,
  name: `Dish ${id}`,
  description: 'd',
  ingredients: [
    { name: 'rice', quantity: 100, unit: 'g' },
    { name: 'chicken breast', quantity: 250, unit: 'g' },
  ],
  instructions: ['cook'],
  nutritionInfo: { calories: 500, protein: 30, carbs: 50, fat: 15, fiber: 5 },
  cuisineType: 'generic',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings,
  imageUrl: null,
});

const fullWeek = (): WeekPlanResponse => ({
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    meals: [
      { type: 'breakfast' as const, recipe: recipe(`b${dayOfWeek}`) },
      { type: 'lunch' as const, recipe: recipe(`l${dayOfWeek}`) },
      { type: 'dinner' as const, recipe: recipe(`d${dayOfWeek}`) },
    ],
  })),
});

describe('pairLeftovers (F3 cook-once-eat-twice)', () => {
  it('pairs up to 3 dinner → next-day-lunch slots, skipping a day between pairs', () => {
    const paired = pairLeftovers(fullWeek());
    const leftoverSlots = paired.days.flatMap((d) =>
      d.meals.filter((m) => m.leftoverOf !== undefined).map((m) => ({ day: d.dayOfWeek, slot: m })),
    );

    // Mon→Tue, Wed→Thu, Fri→Sat.
    expect(leftoverSlots.map((s) => s.day)).toEqual([1, 3, 5]);
    expect(leftoverSlots.map((s) => s.slot.leftoverOf)).toEqual(['Monday', 'Wednesday', 'Friday']);
    // Each leftover lunch IS the previous day's dinner recipe.
    for (const { day, slot } of leftoverSlots) {
      const dinner = paired.days
        .find((d) => d.dayOfWeek === day - 1)!
        .meals.find((m) => m.type === 'dinner')!;
      expect(slot.recipe.id).toBe(dinner.recipe.id);
      expect(slot.type).toBe('lunch');
    }
  });

  it('doubles the paired dinner: 2× servings AND 2× ingredient quantities', () => {
    const paired = pairLeftovers(fullWeek());
    const mondayDinner = paired.days[0]!.meals.find((m) => m.type === 'dinner')!.recipe;
    expect(mondayDinner.servings).toBe(4);
    expect(mondayDinner.ingredients.map((i) => i.quantity)).toEqual([200, 500]);
    // An unpaired day's dinner is untouched (Saturday has no Sunday pairing left).
    const sundayDinner = paired.days[6]!.meals.find((m) => m.type === 'dinner')!.recipe;
    expect(sundayDinner.servings).toBe(2);
  });

  it('does not mutate the input plan', () => {
    const input = fullWeek();
    pairLeftovers(input);
    expect(input.days[0]!.meals.find((m) => m.type === 'dinner')!.recipe.servings).toBe(2);
    expect(input.days.flatMap((d) => d.meals).some((m) => m.leftoverOf)).toBe(false);
  });

  it('skips days without a dinner or without a next-day lunch', () => {
    const plan = fullWeek();
    // Remove Monday's dinner and Thursday's lunch.
    plan.days[0]!.meals = plan.days[0]!.meals.filter((m) => m.type !== 'dinner');
    plan.days[3]!.meals = plan.days[3]!.meals.filter((m) => m.type !== 'lunch');
    const paired = pairLeftovers(plan);
    const leftoverDays = paired.days
      .filter((d) => d.meals.some((m) => m.leftoverOf !== undefined))
      .map((d) => d.dayOfWeek);
    // Mon→Tue impossible (no dinner); Tue→Wed pairs; Wed→Thu impossible
    // (Thu lunch removed, and Wed was consumed anyway); Thu→Fri, then stop at 3? Fri→Sat.
    expect(leftoverDays).toEqual([2, 4, 6]);
  });

  it('honours a smaller maxPairs', () => {
    const paired = pairLeftovers(fullWeek(), 2);
    const count = paired.days.flatMap((d) => d.meals).filter((m) => m.leftoverOf).length;
    expect(count).toBe(2);
  });
});
