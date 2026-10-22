import { describe, expect, it } from 'vitest';
import { recapFoodCounts, weekLabel } from './weekly-recap';

// Week of Mon 2026-10-12 … Sun 2026-10-18.
const PLAN = [
  {
    dayOfWeek: 0,
    meals: [
      { type: 'breakfast', recipeId: 'oats' },
      { type: 'dinner', recipeId: 'curry' },
    ],
  },
  { dayOfWeek: 2, meals: [{ type: 'dinner', recipeId: 'pasta' }] },
];

describe('recapFoodCounts', () => {
  it('counts planned meals that were logged or ticked, on the right day', () => {
    const counts = recapFoodCounts({
      logs: [
        // Monday: curry ticked (with its slot), oats not logged.
        {
          date: '2026-10-12',
          loggedMeals: [{ recipeId: 'curry', mealType: 'dinner', slotIndex: 1 }],
          totalProtein: 40,
        },
        // Tuesday: pasta logged, but it was planned for Wednesday.
        {
          date: '2026-10-13',
          loggedMeals: [{ recipeId: 'pasta', mealType: 'dinner' }],
          totalProtein: 30,
        },
        // Wednesday: cook mode's "Made it!" logs under a guessed type — still counts.
        {
          date: '2026-10-14',
          loggedMeals: [{ recipeId: 'pasta', mealType: 'lunch' }],
          totalProtein: 90,
        },
      ],
      plan: PLAN,
      earlierRecipeIds: new Set(),
      proteinTargetG: null,
    });
    expect(counts.plannedMeals).toBe(3);
    expect(counts.cookedFromPlan).toBe(2);
    expect(counts.proteinDays).toBeNull();
  });

  it('new recipes are the ones never logged before, once each, in first-logged order', () => {
    const counts = recapFoodCounts({
      logs: [
        {
          date: '2026-10-13',
          loggedMeals: [
            { recipeId: 'tacos', mealType: 'dinner' },
            { recipeId: 'oats', mealType: 'breakfast' },
            { mealType: 'lunch', custom: { name: 'Sandwich', estimatedBy: 'manual' } },
          ],
          totalProtein: 0,
        },
        {
          date: '2026-10-12',
          loggedMeals: [{ recipeId: 'soup', mealType: 'lunch' }],
          totalProtein: 0,
        },
        {
          date: '2026-10-15',
          loggedMeals: [{ recipeId: 'tacos', mealType: 'dinner' }],
          totalProtein: 0,
        },
      ],
      plan: null,
      earlierRecipeIds: new Set(['oats']),
      proteinTargetG: null,
    });
    expect(counts.newRecipeIds).toEqual(['soup', 'tacos']);
    expect(counts.plannedMeals).toBe(0);
    expect(counts.cookedFromPlan).toBe(0);
  });

  it('protein days: logged days within 90% of the target (or under 10 g short)', () => {
    const day = (date: string, totalProtein: number) => ({
      date,
      loggedMeals: [{ recipeId: 'x', mealType: 'dinner' }],
      totalProtein,
    });
    const counts = recapFoodCounts({
      logs: [
        day('2026-10-12', 120),
        day('2026-10-13', 110), // 92% — counts
        day('2026-10-14', 80),
        { date: '2026-10-15', loggedMeals: [], totalProtein: 0 }, // nothing logged: not a day at all
      ],
      plan: null,
      earlierRecipeIds: new Set(),
      proteinTargetG: 120,
    });
    expect(counts.proteinDays).toEqual({ hit: 2, logged: 3 });
  });
});

describe('weekLabel', () => {
  it('formats one month or a month boundary', () => {
    expect(weekLabel(new Date('2026-10-12T00:00:00Z'))).toBe('12–18 Oct');
    expect(weekLabel(new Date('2026-09-28T00:00:00Z'))).toBe('28 Sep – 4 Oct');
  });
});
