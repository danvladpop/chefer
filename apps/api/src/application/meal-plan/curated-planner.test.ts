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

const dayKcal = (d: { meals: { recipe: RecipeData; portion: number }[] }) =>
  d.meals.reduce((sum, m) => sum + m.recipe.nutritionInfo.calories * m.portion, 0);
const dayProtein = (d: { meals: { recipe: RecipeData; portion: number }[] }) =>
  d.meals.reduce((sum, m) => sum + m.recipe.nutritionInfo.protein * m.portion, 0);

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
      { calories: 1500, proteinG: 60, goal: 'LOSE_WEIGHT' },
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
    const lean = [recipe(560, 55), recipe(540, 50)];
    p.lunch.push(...lean);
    const leanIds = new Set(lean.map((r) => r.id));
    const leanPicks = (goal: string) =>
      planCuratedWeek(p, { calories: 2000, proteinG: 100, goal }, seeded())
        .flatMap((d) => d.meals)
        .filter((m) => leanIds.has(m.recipe.id)).length;
    expect(leanPicks('GAIN_MUSCLE')).toBeGreaterThanOrEqual(leanPicks('MAINTAIN'));
    expect(leanPicks('GAIN_MUSCLE')).toBeGreaterThan(0);
  });

  describe('portions (audit P1-1)', () => {
    it.each([
      [1600, 90],
      [1600, 140],
      [2000, 90],
      [2000, 140],
      [2000, 175],
      [2800, 90],
      [2800, 140],
      [2800, 175],
      [3200, 90],
      [3200, 140],
      [3200, 175],
    ])('lands every day within ±10%% of %i kcal (protein %i g)', (calories, proteinG) => {
      const week = planCuratedWeek(pools(), { calories, proteinG, goal: 'MAINTAIN' }, seeded());
      for (const day of week) {
        expect(Math.abs(dayKcal(day) - calories) / calories).toBeLessThanOrEqual(0.1);
        expect(day.kcal).toBe(Math.round(dayKcal(day)));
        for (const m of day.meals) {
          expect(m.portion).toBeGreaterThanOrEqual(0.75);
          expect(m.portion).toBeLessThanOrEqual(2);
        }
      }
    });

    it('reports an honest protein gap only when the day really is short', () => {
      const week = planCuratedWeek(
        pools(),
        { calories: 2000, proteinG: 175, goal: 'GAIN_MUSCLE' },
        seeded(),
      );
      for (const day of week) {
        const short = 175 - dayProtein(day);
        if (day.proteinGapG === null) expect(short).toBeLessThan(17.5);
        else expect(day.proteinGapG).toBe(Math.round(short));
      }
      // This small fixture pool can't reach 175 g inside 2,000 kcal.
      expect(week.some((d) => d.proteinGapG !== null)).toBe(true);
    });

    it('keeps portions at 1x when the recipes already fit', () => {
      const flat: Record<MealType, RecipeData[]> = {
        breakfast: [1, 2, 3].map(() => recipe(500, 30)),
        lunch: [1, 2, 3].map(() => recipe(700, 40)),
        dinner: [1, 2, 3].map(() => recipe(800, 50)),
        snack: [recipe(200, 10)],
      };
      const week = planCuratedWeek(flat, { calories: 2000, proteinG: 110, goal: 'MAINTAIN' });
      expect(week.every((d) => d.meals.every((m) => m.portion === 1))).toBe(true);
      expect(week.every((d) => d.meals.length === 3)).toBe(true);
    });

    it('upsizes the protein-dense dish for a lifter', () => {
      const p: Record<MealType, RecipeData[]> = {
        breakfast: [1, 2, 3].map(() => recipe(450, 12)),
        lunch: [1, 2, 3].map(() => recipe(550, 60)),
        dinner: [1, 2, 3].map(() => recipe(600, 25)),
        snack: [recipe(200, 5)],
      };
      const week = planCuratedWeek(p, { calories: 2400, proteinG: 175, goal: 'GAIN_MUSCLE' });
      for (const day of week) {
        const lunch = day.meals.find((m) => m.type === 'lunch')!;
        expect(lunch.portion).toBe(Math.max(...day.meals.map((m) => m.portion)));
        expect(lunch.portion).toBeGreaterThan(1);
      }
    });
  });
});

describe('planCuratedWeek — training days (audit P2-4)', () => {
  // With portions (P1-1) every day already chases protein inside the ±10%
  // calorie band; a training day weighs the shortfall double, so it trades
  // more calorie accuracy for protein than a rest day does.
  const trainingPools = (): Record<MealType, RecipeData[]> => ({
    breakfast: [recipe(600, 20)],
    lunch: [recipe(600, 20)],
    dinner: [recipe(600, 20), recipe(600, 40)],
    snack: [],
  });
  const targets = { calories: 1800, proteinG: 150, goal: 'MAINTAIN' };

  it('a rest day stays calorie-exact', () => {
    const monday = planCuratedWeek(trainingPools(), targets, seeded())[0]!;
    expect(monday.kcal).toBe(1800);
    expect(monday.protein).toBe(90);
  });

  it('a training day leans further toward protein, still inside the band', () => {
    const monday = planCuratedWeek(
      trainingPools(),
      { ...targets, trainingDays: [0] },
      seeded(),
    )[0]!;
    expect(monday.protein).toBeGreaterThan(90);
    expect(Math.abs(monday.kcal - 1800) / 1800).toBeLessThanOrEqual(0.1);
  });
});
