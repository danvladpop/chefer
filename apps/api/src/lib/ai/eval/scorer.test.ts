import { describe, expect, it } from 'vitest';
import type { MealPlanInput, RecipeData, WeekPlanResponse } from '../types.js';
import {
  formatSummaryTable,
  scoreCheferize,
  scoreExtraction,
  scoreMealPlan,
  scorePhoto,
  scorePrices,
  scoreReview,
  scoreShopping,
  scoreSwap,
  summarise,
  type CaseResult,
} from './scorer.js';

function recipe(
  name: string,
  kcal: number,
  ingredients: string[] = ['rice'],
  macros = { protein: 30, carbs: 50, fat: 15 },
  tags: string[] = [],
): RecipeData {
  return {
    id: name,
    name,
    description: '',
    ingredients: ingredients.map((n) => ({ name: n, quantity: 100, unit: 'g' })),
    instructions: ['Cook.'],
    nutritionInfo: { calories: kcal, ...macros, fiber: 3 },
    cuisineType: 'International',
    dietaryTags: tags,
    prepTimeMins: 5,
    cookTimeMins: 5,
    servings: 1,
    imageUrl: null,
  };
}

const INPUT: MealPlanInput = {
  userId: 'u',
  goal: 'MAINTAIN',
  biologicalSex: 'FEMALE',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activityLevel: 'MODERATELY_ACTIVE',
  dailyCalorieTarget: 2000,
  macroTargets: { proteinG: 100, carbsG: 200, fatG: 60 },
  dietaryRestrictions: ['vegetarian'],
  allergies: ['peanuts'],
  dislikedIngredients: [],
  cuisinePreferences: [],
  mealsPerDay: 2,
  servingSize: 1,
};

/** A 7-day plan: every day two 1000-kcal meals of 50P/100C/30F g. */
function week(overrides: Partial<Record<number, RecipeData[]>> = {}): WeekPlanResponse {
  return {
    days: Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      meals: (
        overrides[d] ?? [
          recipe(`Lunch ${d}`, 1000, ['rice'], { protein: 50, carbs: 100, fat: 30 }, [
            'vegetarian',
          ]),
          recipe(`Dinner ${d}`, 1000, ['beans'], { protein: 50, carbs: 100, fat: 30 }, [
            'vegetarian',
          ]),
        ]
      ).map((r, i) => ({ type: i === 0 ? ('lunch' as const) : ('dinner' as const), recipe: r })),
    })),
  };
}

describe('scoreMealPlan', () => {
  it('scores a perfect plan as valid, safe and on target', () => {
    const s = scoreMealPlan(INPUT, week());
    expect(s).toMatchObject({
      schemaValid: true,
      allergenViolations: 0,
      restrictionViolations: 0,
      kcalErrorPct: 0,
      macroErrorPct: 0,
    });
    expect(s.checks).toEqual({ sevenDays: 1, mealCount: 1, uniqueDishes: 1 });
  });

  it('counts every dish containing an allergen, separately from diet misses', () => {
    const s = scoreMealPlan(
      INPUT,
      week({
        2: [
          recipe('Satay', 1000, ['chicken', 'peanut butter'], undefined, ['vegetarian']),
          recipe('Peanut noodles', 1000, ['noodles', 'peanuts'], undefined, ['vegetarian']),
        ],
      }),
    );
    expect(s.allergenViolations).toBe(2);
    // Chicken breaks the vegetarian restriction too (satay only).
    expect(s.restrictionViolations).toBe(1);
  });

  it('measures mean absolute kcal and macro error per day', () => {
    // Day 0 at 1500 kcal (25% under), the other six on target → mean 25/7 %.
    const s = scoreMealPlan(
      INPUT,
      week({
        0: [
          recipe('A', 500, ['rice'], { protein: 50, carbs: 100, fat: 30 }, ['vegetarian']),
          recipe('B', 1000, ['rice'], { protein: 50, carbs: 100, fat: 30 }, ['vegetarian']),
        ],
      }),
    );
    expect(s.kcalErrorPct).toBeCloseTo(3.6, 1);
    expect(s.macroErrorPct).toBe(0);
  });

  it('holds training days to the bumped target', () => {
    const lifter: MealPlanInput = {
      ...INPUT,
      trainingDays: {
        days: [{ dayOfWeek: 0, label: 'Monday', workoutName: 'Push' }],
        kcalBonus: 500,
        proteinBonus: 0,
      },
    };
    // Monday at 2000 vs its 2500 target: 20% off on 1 of 7 days.
    expect(scoreMealPlan(lifter, week()).kcalErrorPct).toBeCloseTo(2.9, 1);
  });

  it('flags structure problems and schema failures', () => {
    const short = { days: week().days.slice(0, 5) };
    expect(scoreMealPlan(INPUT, short).checks['sevenDays']).toBe(0);
    expect(scoreMealPlan(INPUT, { days: [{ dayOfWeek: 9, meals: [] }] }).schemaValid).toBe(false);
    expect(scoreMealPlan(INPUT, 'not json').schemaValid).toBe(false);
  });
});

describe('scoreSwap / scoreCheferize', () => {
  const prefs = { allergies: ['dairy'], dietaryRestrictions: [] };

  it('checks a swap recipe against the user’s allergies', () => {
    expect(
      scoreSwap(prefs, recipe('Cheese toastie', 400, ['bread', 'cheddar cheese'])),
    ).toMatchObject({ schemaValid: true, allergenViolations: 1 });
    expect(scoreSwap(prefs, recipe('Porridge', 400, ['oats', 'oat milk']))).toMatchObject({
      allergenViolations: 0,
    });
  });

  it('checks the ADAPTED recipe and the serving rescale', () => {
    const {
      id: _id,
      imageUrl: _img,
      ...adapted
    } = recipe('Vegan toastie', 400, ['bread', 'vegan cheese']);
    const input = {
      recipe: adapted,
      targetServings: 2,
      preferences: { ...prefs, dislikedIngredients: [] },
    };
    const s = scoreCheferize(input, { adapted: { ...adapted, servings: 2 }, changes: [] });
    expect(s).toMatchObject({ schemaValid: true, allergenViolations: 0, checks: { servings: 1 } });
    expect(scoreCheferize(input, { adapted: {}, changes: [] }).schemaValid).toBe(false);
  });
});

describe('scoreExtraction', () => {
  const {
    id: _id,
    imageUrl: _img,
    ...soup
  } = recipe('Red Lentil Soup', 330, ['red lentils', 'onion', 'carrot']);

  it('scores name, ingredient recall, servings and kcal against the label', () => {
    const s = scoreExtraction(
      {
        nameIncludes: ['lentil'],
        keyIngredients: ['lentil', 'onion', 'carrot', 'tomato'],
        kcalPerServing: 300,
        servings: 4,
      },
      soup,
    );
    expect(s.schemaValid).toBe(true);
    expect(s.checks).toEqual({
      sentinelCorrect: 1,
      nameMatch: 1,
      ingredientRecall: 0.75,
      servings: 0,
    });
    expect(s.kcalErrorPct).toBe(10);
  });

  it('rewards the NO_RECIPE_FOUND sentinel only when there is no recipe', () => {
    const sentinel = { ...soup, name: 'NO_RECIPE_FOUND' };
    expect(scoreExtraction({ noRecipe: true }, sentinel).checks['sentinelCorrect']).toBe(1);
    expect(scoreExtraction({ noRecipe: true }, soup).checks['sentinelCorrect']).toBe(0);
    expect(scoreExtraction({}, sentinel).checks['sentinelCorrect']).toBe(0);
  });
});

describe('scorePhoto / scorePrices / scoreShopping / scoreReview', () => {
  it('photo: schema bounds, kcal error and dish match', () => {
    const photo = {
      dishName: 'Spaghetti bolognese',
      confidence: 'med',
      kcal: 660,
      protein: 30,
      carbs: 80,
      fat: 20,
      portionNote: '',
    };
    const s = scorePhoto({ kcal: 600, dishIncludes: ['spaghetti'] }, photo);
    expect(s).toMatchObject({ schemaValid: true, kcalErrorPct: 10, checks: { dishMatch: 1 } });
    expect(scorePhoto({}, { ...photo, kcal: 99_999 }).schemaValid).toBe(false);
  });

  it('prices: coverage and per-100 g kcal error on labelled items', () => {
    const est = (ingredientName: string, caloriesPer100g: number | null) => ({
      ingredientName,
      pricePer100gEur: 1,
      pricePer100mlEur: null,
      pricePerPieceEur: null,
      caloriesPer100g,
      proteinPer100g: null,
      carbsPer100g: null,
      fatPer100g: null,
      fiberPer100g: null,
      gramsPerPiece: null,
    });
    const s = scorePrices(['egg', 'apple'], { egg: 140, apple: 50 }, [est('Egg', 154)]);
    expect(s).toMatchObject({ schemaValid: true, kcalErrorPct: 10, checks: { coverage: 0.5 } });
  });

  it('shopping: covers each distinct input and consolidates duplicates', () => {
    const input = {
      weekLabel: 'w',
      ingredients: [
        { name: 'onion', quantity: 1, unit: 'piece' },
        { name: 'Onion', quantity: 2, unit: 'piece' },
        { name: 'rice', quantity: 100, unit: 'g' },
      ],
    };
    const s = scoreShopping(input, {
      items: [
        { ingredientName: 'Onions', quantity: '3', unit: 'piece' },
        { ingredientName: 'Rice', quantity: '100', unit: 'g' },
      ],
    });
    expect(s.checks).toEqual({ coverage: 1, consolidated: 1 });
  });

  it('review: non-empty prose of at most 8 lines', () => {
    expect(scoreReview('Great week.\nKeep going.').schemaValid).toBe(true);
    expect(scoreReview('  ').schemaValid).toBe(false);
    expect(scoreReview(Array.from({ length: 12 }, () => 'x').join('\n')).schemaValid).toBe(false);
  });
});

describe('summarise', () => {
  const base = { allergenViolations: 0, restrictionViolations: 0, checks: {} };
  const results: CaseResult[] = [
    {
      id: 'a',
      ok: true,
      ms: 100,
      inputTokens: 10,
      outputTokens: 5,
      scores: { ...base, schemaValid: true, kcalErrorPct: 10, checks: { c: 1 } },
    },
    {
      id: 'b',
      ok: true,
      ms: 300,
      scores: { ...base, schemaValid: true, kcalErrorPct: 20, checks: { c: 0 } },
    },
    { id: 'c', ok: false, error: 'boom', ms: 200, scores: { ...base, schemaValid: false } },
  ];

  it('aggregates validity, errors, latency, tokens and checks', () => {
    const s = summarise('mealPlan', 'groq', results);
    expect(s).toMatchObject({
      cases: 3,
      errors: 1,
      schemaValidPct: 66.7,
      meanKcalErrorPct: 15,
      p50Ms: 200,
      p95Ms: 300,
      inputTokens: 10,
      outputTokens: 5,
      checks: { c: 0.5 },
    });
  });

  describe('gate', () => {
    const passing = results.slice(0, 2);

    it('passes a clean run: no errors, no allergen violations, schema-valid ≥ 95%', () => {
      const s = summarise('mealPlan', 'groq', passing);
      expect(s.gatePassed).toBe(true);
      expect(s.gateFailures).toEqual([]);
    });

    it('fails when ANY case errored — an all-error run can never pass', () => {
      expect(summarise('mealPlan', 'groq', results)).toMatchObject({
        gatePassed: false,
        gateFailures: ['1/3 cases errored', 'schema-valid 66.7% < 95%'],
      });
      const allErrors = Array.from({ length: 20 }, (_, i) => ({ ...results[2]!, id: `e${i}` }));
      const s = summarise('mealPlan', 'groq', allErrors);
      expect(s.gatePassed).toBe(false);
      expect(s.gateFailures[0]).toBe('20/20 cases errored');
    });

    it('fails on any allergen violation', () => {
      const unsafe = [{ ...results[0]!, scores: { ...results[0]!.scores, allergenViolations: 1 } }];
      expect(summarise('swap', 'groq', unsafe)).toMatchObject({
        gatePassed: false,
        gateFailures: ['1 allergen violation(s)'],
      });
    });

    it('fails when schema-valid falls below the configurable threshold', () => {
      const invalid = {
        ...results[0]!,
        id: 'x',
        scores: { ...results[0]!.scores, schemaValid: false },
      };
      const nineteenOfTwenty = [
        ...Array.from({ length: 19 }, (_, i) => ({ ...results[0]!, id: `ok${i}` })),
        invalid,
      ];
      // 95% meets the default 95% threshold…
      expect(summarise('swap', 'groq', nineteenOfTwenty).gatePassed).toBe(true);
      // …but not a stricter one.
      expect(summarise('swap', 'groq', nineteenOfTwenty, { minSchemaValidPct: 98 })).toMatchObject({
        gatePassed: false,
        gateFailures: ['schema-valid 95% < 98%'],
      });
      expect(summarise('swap', 'groq', [invalid], { minSchemaValidPct: 0 }).gatePassed).toBe(true);
    });

    it('fails an empty run', () => {
      expect(summarise('swap', 'groq', [])).toMatchObject({
        gatePassed: false,
        gateFailures: ['no cases ran'],
      });
    });
  });

  it('renders a table with one row per summary, then the gate failures', () => {
    const ok = formatSummaryTable([summarise('mealPlan', 'groq', results.slice(0, 2))]);
    const lines = ok.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('allergen');
    expect(lines[2]).toContain('PASS');

    const failed = formatSummaryTable([summarise('mealPlan', 'groq', results)]).split('\n');
    expect(failed[2]).toContain('FAIL');
    expect(failed.at(-1)).toBe('gate FAIL mealPlan: 1/3 cases errored; schema-valid 66.7% < 95%');
  });
});
