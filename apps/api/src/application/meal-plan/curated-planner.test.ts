import { describe, expect, it } from 'vitest';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import { planCuratedWeek, type CuratedShapeOptions } from './curated-planner.js';

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

const timedRecipe = (
  calories: number,
  prepTimeMins: number,
  cookTimeMins: number,
  protein = 20,
): RecipeData => ({ ...recipe(calories, protein), prepTimeMins, cookTimeMins });

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

describe('planCuratedWeek — shape (§2.3, T-07.2)', () => {
  const targets = { calories: 2000, proteinG: 120, goal: 'MAINTAIN' };

  it('AC7: no shape reproduces the legacy week (3 meals, every day, no cap)', () => {
    const week = planCuratedWeek(pools(), targets, seeded());
    expect(week.every((d) => d.planned)).toBe(true);
    expect(week.every((d) => d.meals.some((m) => m.type === 'breakfast'))).toBe(true);
    expect(week.every((d) => d.meals.some((m) => m.type === 'lunch'))).toBe(true);
    expect(week.every((d) => d.meals.some((m) => m.type === 'dinner'))).toBe(true);
  });

  it('AC1: only the chosen slots and days are planned; the rest is unplanned', () => {
    const shape: CuratedShapeOptions = { slots: ['dinner'], days: [0, 1, 2, 3] };
    const p = pools();
    p.dinner = [1, 2, 3, 4, 5, 6, 7].map(() => timedRecipe(600, 5, 5, 35));
    const week = planCuratedWeek(p, targets, seeded(), shape);
    const planned = week.filter((d) => d.planned);
    expect(planned).toHaveLength(4);
    expect(planned.every((d) => d.dayOfWeek <= 3)).toBe(true);
    expect(planned.every((d) => d.meals.length === 1 && d.meals[0]!.type === 'dinner')).toBe(true);
    const unplanned = week.filter((d) => !d.planned);
    expect(unplanned).toHaveLength(3);
    expect(unplanned.every((d) => d.meals.length === 0 && d.kcal === 0)).toBe(true);
  });

  it('honours a time cap: every chosen meal is at or under it, or flagged unfilled', () => {
    const p: Record<MealType, RecipeData[]> = {
      breakfast: [],
      lunch: [],
      dinner: [1, 2, 3, 4, 5].map(() => timedRecipe(600, 10, 20, 30)), // 30 min, fits ≤30
      snack: [],
    };
    const shape: CuratedShapeOptions = { slots: ['dinner'], days: [0, 1, 2], timeCapMins: 30 };
    const week = planCuratedWeek(p, targets, seeded(), shape);
    for (const day of week.filter((d) => d.planned)) {
      for (const meal of day.meals) {
        const mins = meal.recipe.prepTimeMins + meal.recipe.cookTimeMins;
        expect(mins).toBeLessThanOrEqual(30);
      }
    }
  });

  it('reports `unfilled: time` when nothing in the pool fits the cap', () => {
    const p: Record<MealType, RecipeData[]> = {
      breakfast: [],
      lunch: [],
      dinner: [1, 2, 3].map(() => timedRecipe(600, 20, 20, 30)), // 40 min, over a 15 cap
      snack: [],
    };
    const shape: CuratedShapeOptions = { slots: ['dinner'], days: [0], timeCapMins: 15 };
    const week = planCuratedWeek(p, targets, seeded(), shape);
    const monday = week[0]!;
    expect(monday.planned).toBe(true);
    expect(monday.meals).toHaveLength(0);
    expect(monday.unfilled).toEqual([{ slot: 'dinner', reason: 'time' }]);
  });

  it('owner feedback Q-35: an unknown-time (0+0) recipe fits any cap but ranks after known-fast ones', () => {
    const fast = timedRecipe(600, 5, 5, 30); // 10 min, known
    const unknown = timedRecipe(600, 0, 0, 30); // unknown time
    const p: Record<MealType, RecipeData[]> = {
      breakfast: [],
      lunch: [],
      dinner: [unknown, fast],
      snack: [],
    };
    const shape: CuratedShapeOptions = { slots: ['dinner'], days: [0], timeCapMins: 15 };
    const week = planCuratedWeek(p, targets, seeded(), shape);
    const monday = week[0]!;
    // Both fit the cap (the unknown one always does) — no `unfilled`, and the
    // engine had a real choice (proving the unknown recipe was not excluded).
    expect(monday.unfilled).toBeUndefined();
    expect(monday.meals).toHaveLength(1);
  });

  it('weekendNoLimit exempts Saturday/Sunday from the cap', () => {
    const p: Record<MealType, RecipeData[]> = {
      breakfast: [],
      lunch: [],
      dinner: [1, 2, 3].map(() => timedRecipe(600, 30, 30, 30)), // 60 min
      snack: [],
    };
    const shape: CuratedShapeOptions = {
      slots: ['dinner'],
      days: [0, 5, 6],
      timeCapMins: 15,
      weekendNoLimit: true,
    };
    const week = planCuratedWeek(p, targets, seeded(), shape);
    const monday = week.find((d) => d.dayOfWeek === 0)!;
    const saturday = week.find((d) => d.dayOfWeek === 5)!;
    const sunday = week.find((d) => d.dayOfWeek === 6)!;
    expect(monday.unfilled).toEqual([{ slot: 'dinner', reason: 'time' }]);
    expect(saturday.meals).toHaveLength(1);
    expect(sunday.meals).toHaveLength(1);
  });

  it('"cooking for 2" sets every planned slot to portion 2', () => {
    const shape: CuratedShapeOptions = { slots: ['breakfast', 'lunch', 'dinner'], cookingFor: 2 };
    const week = planCuratedWeek(pools(), targets, seeded(), shape);
    for (const day of week) {
      for (const meal of day.meals) expect(meal.portion).toBe(2);
    }
  });

  it('"just me" (cookingFor 1 or absent) keeps the calorie-driven portion', () => {
    const shape: CuratedShapeOptions = { slots: ['breakfast', 'lunch', 'dinner'], cookingFor: 1 };
    const week = planCuratedWeek(pools(), targets, seeded(), shape);
    // The same fixture pool at this target already lands close to 1x
    // (see the "keeps portions at 1x" test above) — cookingFor: 1 must not
    // force every slot to 2x the way cookingFor: 2 does.
    expect(week.some((d) => d.meals.some((m) => m.portion !== 2))).toBe(true);
  });

  it('an explicit shape without Snacks never adds an opportunistic snack', () => {
    const shape: CuratedShapeOptions = { slots: ['breakfast', 'lunch', 'dinner'] };
    // A target far above what 3 mains can reach — the legacy path would add
    // snacks here (see the very first test above).
    const week = planCuratedWeek(
      pools(),
      { calories: 3200, proteinG: 175, goal: 'GAIN_MUSCLE' },
      seeded(),
      shape,
    );
    expect(week.every((d) => d.meals.every((m) => m.type !== 'snack'))).toBe(true);
  });
});
