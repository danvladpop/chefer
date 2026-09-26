import { describe, expect, it } from 'vitest';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import { planCuratedWeek } from './curated-planner.js';

let n = 0;
const recipe = (calories: number, protein = 20): RecipeData => ({
  id: `r${++n}`,
  name: `Recipe ${n}`,
  description: '',
  ingredients: [],
  instructions: [],
  nutritionInfo: { calories, protein, carbs: 0, fat: 0, fiber: 0 },
  cuisineType: 'x',
  dietaryTags: [],
  prepTimeMins: 0,
  cookTimeMins: 0,
  servings: 1,
  imageUrl: null,
});

function pools(): Record<MealType, RecipeData[]> {
  return {
    breakfast: [300, 350, 420, 480, 520, 380, 450].map((k) => recipe(k)),
    lunch: [450, 500, 560, 620, 480, 530, 600].map((k) => recipe(k)),
    dinner: [480, 550, 620, 700, 520, 580, 650].map((k) => recipe(k, 35)),
    snack: [150, 220, 280, 180].map((k) => recipe(k, 15)),
  };
}

// Deterministic "random" for stable tests.
const seeded = () => {
  let s = 42;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

const dayKcal = (d: { meals: { recipe: RecipeData }[] }) =>
  d.meals.reduce((sum, m) => sum + m.recipe.nutritionInfo.calories, 0);

describe('planCuratedWeek (audit F-PLAN-1-3)', () => {
  it('lands every day near a 2,000 kcal target, adding a snack when needed', () => {
    const week = planCuratedWeek(
      pools(),
      { calories: 2000, proteinG: 120, goal: 'MAINTAIN' },
      seeded(),
    );
    expect(week).toHaveLength(7);
    const deviations = week.map((d) => Math.abs(dayKcal(d) - 2000) / 2000);
    expect(Math.max(...deviations)).toBeLessThan(0.2);
    expect(deviations.reduce((a, b) => a + b, 0) / 7).toBeLessThan(0.1);
    expect(week.some((d) => d.meals.some((m) => m.type === 'snack'))).toBe(true);
  });

  it('stays at three meals when they already fit a smaller target', () => {
    const week = planCuratedWeek(
      pools(),
      { calories: 1500, proteinG: 80, goal: 'LOSE_WEIGHT' },
      seeded(),
    );
    expect(week.every((d) => d.meals.length === 3)).toBe(true);
  });

  it('does not repeat a main dish until its pool is used up', () => {
    const week = planCuratedWeek(
      pools(),
      { calories: 1800, proteinG: 100, goal: 'MAINTAIN' },
      seeded(),
    );
    const dinners = week.map((d) => d.meals.find((m) => m.type === 'dinner')!.recipe.id);
    expect(new Set(dinners).size).toBe(7);
  });

  it('picks higher-protein combinations for GAIN_MUSCLE', () => {
    const p = pools();
    p.lunch.push(recipe(560, 55), recipe(540, 50));
    const protein = (goal: string) =>
      planCuratedWeek(p, { calories: 2000, proteinG: 160, goal }, seeded())
        .flatMap((d) => d.meals)
        .reduce((s, m) => s + m.recipe.nutritionInfo.protein, 0);
    expect(protein('GAIN_MUSCLE')).toBeGreaterThanOrEqual(protein('MAINTAIN'));
  });
});

describe('planCuratedWeek — training days (audit P2-4)', () => {
  // A kcal-perfect but low-protein dinner vs a protein-rich one that
  // overshoots calories: a rest day takes the first, a training day the second.
  const trainingPools = (): Record<MealType, RecipeData[]> => ({
    breakfast: [recipe(600, 20)],
    lunch: [recipe(600, 20)],
    dinner: [recipe(600, 20), recipe(900, 60)],
    snack: [],
  });
  const targets = { calories: 1800, proteinG: 150, goal: 'MAINTAIN' };
  const mondayDinnerProtein = (week: ReturnType<typeof planCuratedWeek>) =>
    week[0]!.meals.find((m) => m.type === 'dinner')!.recipe.nutritionInfo.protein;

  it('a rest day keeps the calorie-closest dinner', () => {
    expect(mondayDinnerProtein(planCuratedWeek(trainingPools(), targets, seeded()))).toBe(20);
  });

  it('a training day picks the higher-protein dinner', () => {
    expect(
      mondayDinnerProtein(
        planCuratedWeek(trainingPools(), { ...targets, trainingDays: [0] }, seeded()),
      ),
    ).toBe(60);
  });
});
