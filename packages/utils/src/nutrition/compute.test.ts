import { describe, expect, it } from 'vitest';
import { computeRecipeNutrition, lineGrams, type NutritionIngredient } from './compute';

// Round numbers keep the arithmetic readable; FDC-backed cases are in golden.test.ts.
const OIL: NutritionIngredient = {
  id: 'oil',
  kcalPer100g: 900,
  proteinPer100g: 0,
  carbsPer100g: 0,
  fatPer100g: 100,
  fiberPer100g: 0,
  densityGPerMl: 0.9,
};
const EGG: NutritionIngredient = {
  id: 'egg',
  kcalPer100g: 140,
  proteinPer100g: 12,
  carbsPer100g: 1,
  fatPer100g: 10,
  fiberPer100g: 0,
  portions: [
    { unit: 'medium', grams: 50 },
    { unit: 'large', grams: 60 },
  ],
};
const THIGH_BONE_IN: NutritionIngredient = {
  id: 'thigh',
  kcalPer100g: 200,
  proteinPer100g: 20,
  carbsPer100g: 0,
  fatPer100g: 13,
  fiberPer100g: 0,
  edibleFraction: 0.75,
  portions: [{ unit: 'piece', grams: 90 }],
};
const PARSLEY: NutritionIngredient = {
  id: 'parsley',
  kcalPer100g: 40,
  proteinPer100g: 3,
  carbsPer100g: 3,
  fatPer100g: 1,
  fiberPer100g: 3,
};
const PROTEIN_BAR: NutritionIngredient = {
  id: 'bar',
  kcalPer100g: 400,
  proteinPer100g: 40,
  carbsPer100g: 30,
  fatPer100g: 15,
  fiberPer100g: 5,
  portions: [{ unit: 'serving', grams: 45 }],
};
const CATALOG = new Map([OIL, EGG, THIGH_BONE_IN, PARSLEY, PROTEIN_BAR].map((i) => [i.id, i]));

describe('lineGrams: unresolved paths never guess (I6)', () => {
  it('no ingredient', () => {
    expect(lineGrams({ quantity: 1, unit: 'g' }, undefined)).toEqual({
      grams: null,
      problem: 'NO_INGREDIENT',
    });
  });

  it('volume without a density', () => {
    expect(lineGrams({ quantity: 1, unit: 'cup' }, EGG)).toEqual({
      grams: null,
      problem: 'NO_DENSITY',
    });
  });

  it('a known portion unit the ingredient does not define', () => {
    expect(lineGrams({ quantity: 2, unit: 'clove' }, EGG)).toEqual({
      grams: null,
      problem: 'NO_PORTION',
    });
    expect(lineGrams({ quantity: 2, unit: '' }, OIL)).toEqual({
      grams: null,
      problem: 'NO_PORTION',
    });
  });

  it('an unknown unit', () => {
    expect(lineGrams({ quantity: 300, unit: 'lightyears' }, EGG)).toEqual({
      grams: null,
      problem: 'BAD_UNIT',
    });
  });

  it('a bad quantity', () => {
    expect(lineGrams({ quantity: -1, unit: 'g' }, EGG).problem).toBe('BAD_QTY');
    expect(lineGrams({ quantity: Number.NaN, unit: 'g' }, EGG).problem).toBe('BAD_QTY');
    expect(lineGrams({ quantity: Infinity, unit: 'g' }, EGG).problem).toBe('BAD_QTY');
  });
});

describe('lineGrams: resolved paths', () => {
  it('portion units use the ingredient portion, including size words', () => {
    expect(lineGrams({ quantity: 2, unit: 'large' }, EGG).grams).toBe(120);
    expect(lineGrams({ quantity: 1, unit: 'medium, beaten' }, EGG).grams).toBe(50);
  });

  it('an ingredient-defined portion name resolves even outside the shared list', () => {
    expect(lineGrams({ quantity: 2, unit: 'serving' }, PROTEIN_BAR).grams).toBe(90);
  });

  it('tiny units weigh a fixed amount; to taste is 0 g and negligible', () => {
    expect(lineGrams({ quantity: 2, unit: 'pinch' }, OIL).grams).toBeCloseTo(0.72);
    expect(lineGrams({ quantity: 1, unit: 'dash' }, OIL).grams).toBeCloseTo(0.6);
    expect(lineGrams({ quantity: 1, unit: 'to taste' }, OIL)).toEqual({
      grams: 0,
      negligible: true,
    });
  });

  it('the edible fraction scales purchase weight but not already-edible portions', () => {
    expect(lineGrams({ quantity: 400, unit: 'g' }, THIGH_BONE_IN).grams).toBe(300);
    expect(lineGrams({ quantity: 2, unit: 'piece' }, THIGH_BONE_IN).grams).toBe(180);
  });

  it('volume uses density', () => {
    expect(lineGrams({ quantity: 100, unit: 'ml' }, OIL).grams).toBeCloseTo(90);
  });
});

describe('computeRecipeNutrition', () => {
  it('sums at full precision and rounds only per serving', () => {
    // 3 × 33.3 g oil = 99.9 g → 899.1 kcal, 99.9 g fat; per serving (÷3) 299.7 → 300 kcal, 33.3 g fat
    const r = computeRecipeNutrition(
      [
        { ingredientId: 'oil', quantity: 33.3, unit: 'g' },
        { ingredientId: 'oil', quantity: 33.3, unit: 'g' },
        { ingredientId: 'oil', quantity: 33.3, unit: 'g' },
      ],
      CATALOG,
      3,
    );
    expect(r.status).toBe('COMPUTED');
    expect(r.total.calories).toBeCloseTo(899.1, 6);
    expect(r.perServing).toEqual({ calories: 300, protein: 0, carbs: 0, fat: 33.3, fiber: 0 });
  });

  it('servings = 1 vs N divide the same total', () => {
    const lines = [{ ingredientId: 'egg', quantity: 4, unit: 'large' }];
    const one = computeRecipeNutrition(lines, CATALOG, 1);
    const four = computeRecipeNutrition(lines, CATALOG, 4);
    expect(one.total).toEqual(four.total);
    expect(one.perServing).toEqual({ calories: 336, protein: 28.8, carbs: 2.4, fat: 24, fiber: 0 });
    expect(four.perServing).toEqual({ calories: 84, protein: 7.2, carbs: 0.6, fat: 6, fiber: 0 });
  });

  it('invalid servings count as 1', () => {
    const lines = [{ ingredientId: 'egg', quantity: 1, unit: 'large' }];
    expect(computeRecipeNutrition(lines, CATALOG, 0).perServing.calories).toBe(84);
    expect(computeRecipeNutrition(lines, CATALOG, Number.NaN).perServing.calories).toBe(84);
  });

  it('optional lines are reported but excluded from totals, and cannot make it PARTIAL', () => {
    const r = computeRecipeNutrition(
      [
        { ingredientId: 'egg', quantity: 1, unit: 'large' },
        { ingredientId: 'parsley', quantity: 10, unit: 'g', optional: true },
        { ingredientId: 'parsley', quantity: 1, unit: 'bunch', optional: true },
      ],
      CATALOG,
      1,
    );
    expect(r.status).toBe('COMPUTED');
    expect(r.total.calories).toBeCloseTo(84);
    expect(r.lines[1]).toMatchObject({ position: 1, optional: true, grams: 10 });
    expect(r.lines[1]?.facts.calories).toBeCloseTo(4);
    expect(r.lines[2]).toMatchObject({ optional: true, problem: 'NO_PORTION', grams: null });
  });

  it('PARTIAL when any required line is unresolved; the rest still count', () => {
    const r = computeRecipeNutrition(
      [
        { ingredientId: 'egg', quantity: 1, unit: 'large' },
        { ingredientId: null, quantity: 1, unit: 'g' },
        { ingredientId: 'missing-id', quantity: 1, unit: 'g' },
        { ingredientId: 'oil', quantity: 1, unit: 'piece' },
      ],
      CATALOG,
      1,
    );
    expect(r.status).toBe('PARTIAL');
    expect(r.perServing.calories).toBe(84);
    expect(r.lines.map((l) => l.problem)).toEqual([
      undefined,
      'NO_INGREDIENT',
      'NO_INGREDIENT',
      'NO_PORTION',
    ]);
    expect(r.lines[3]?.facts).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });

  it('to taste lines resolve at 0 g and keep the recipe COMPUTED', () => {
    const r = computeRecipeNutrition(
      [
        { ingredientId: 'egg', quantity: 1, unit: 'large' },
        { ingredientId: 'oil', quantity: 1, unit: 'to taste' },
      ],
      CATALOG,
      1,
    );
    expect(r.status).toBe('COMPUTED');
    expect(r.lines[1]).toMatchObject({ grams: 0, negligible: true });
  });

  it('accepts a lookup function as well as a Map', () => {
    const r = computeRecipeNutrition(
      [{ ingredientId: 'egg', quantity: 1, unit: 'large' }],
      (id) => CATALOG.get(id),
      1,
    );
    expect(r.perServing.calories).toBe(84);
  });

  it('an empty recipe is COMPUTED zero', () => {
    const r = computeRecipeNutrition([], CATALOG, 2);
    expect(r).toEqual({
      status: 'COMPUTED',
      total: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      lines: [],
    });
  });
});
