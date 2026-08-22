import { describe, expect, it } from 'vitest';
import { buildMealPlanUserPrompt } from './prompts.js';
import type { MealPlanInput } from './types.js';

const baseInput: MealPlanInput = {
  userId: 'u1',
  goal: 'LOSE_WEIGHT',
  biologicalSex: 'MALE',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'MODERATELY_ACTIVE',
  dailyCalorieTarget: 2000,
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
  cuisinePreferences: [],
  mealsPerDay: 3,
  servingSize: 1,
};

describe('buildMealPlanUserPrompt — learning signals (P1-1)', () => {
  it('contains no signal lines when there is nothing to learn from', () => {
    const prompt = buildMealPlanUserPrompt(baseInput);
    expect(prompt).not.toContain('Liked recently');
    expect(prompt).not.toContain('Disliked recently');
    expect(prompt).not.toContain('Already booked');
  });

  it('renders liked and disliked dishes with their steering instructions', () => {
    const prompt = buildMealPlanUserPrompt({
      ...baseInput,
      likedDishes: ['Thai Green Curry (Thai)', 'Shakshuka (Middle Eastern)'],
      dislikedDishes: ['Quinoa Buddha Bowl', 'Lentil Soup'],
    });
    expect(prompt).toContain(
      'Liked recently (4-5 stars): Thai Green Curry (Thai), Shakshuka (Middle Eastern)',
    );
    expect(prompt).toContain('Favour the cuisines and techniques');
    expect(prompt).toContain('Disliked recently (1-2 stars): Quinoa Buddha Bowl, Lentil Soup');
    expect(prompt).toContain('Do not repeat these dishes or close variants');
  });

  it('tells the AI not to duplicate pinned dishes', () => {
    const prompt = buildMealPlanUserPrompt({
      ...baseInput,
      pinnedDishNames: ['Herb-Crusted Salmon'],
    });
    expect(prompt).toContain('Already booked into this week');
    expect(prompt).toContain('Herb-Crusted Salmon');
  });

  it('renders the weekly budget as a hard constraint (P2-4)', () => {
    expect(buildMealPlanUserPrompt(baseInput)).not.toContain('Budget');
    const prompt = buildMealPlanUserPrompt({ ...baseInput, weeklyBudgetEur: 60 });
    expect(prompt).toContain('Budget (hard constraint)');
    expect(prompt).toContain('under €60');
  });
});

describe('buildMealPlanUserPrompt — wave-2 seam sections (premium_plan.md §3.3)', () => {
  it('emits neither seam section when the fields are absent', () => {
    const prompt = buildMealPlanUserPrompt(baseInput);
    expect(prompt).not.toContain('Household:');
    expect(prompt).not.toContain('Pantry (soft constraint');
  });

  it('renders the household section with servings and per-person dislikes (F2)', () => {
    const prompt = buildMealPlanUserPrompt({
      ...baseInput,
      householdContext: {
        memberCount: 2,
        portionSum: 3,
        mergedSafety: { allergies: ['peanut'], dietaryRestrictions: ['vegan'] },
        dislikeNotes: ['avoid mushrooms for Maria'],
      },
    });
    expect(prompt).toContain('Household: cooking for 3 people total');
    expect(prompt).toContain('servings=3');
    expect(prompt).toContain('avoid mushrooms for Maria');
  });

  it('renders the pantry use-first section as a soft constraint (F3)', () => {
    const prompt = buildMealPlanUserPrompt({
      ...baseInput,
      useFirstIngredients: [
        { name: 'spinach', quantity: 200, unit: 'g', reason: 'bought last week' },
      ],
    });
    expect(prompt).toContain('Pantry (soft constraint');
    expect(prompt).toContain('spinach (200 g — bought last week)');
    expect(prompt).toContain('do not force them into every meal');
  });
});
