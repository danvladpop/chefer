import { describe, expect, it } from 'vitest';
import { computeRecipeNutrition } from './compute';
import {
  defaultUnitForIngredient,
  incompleteLineCount,
  ingredientUnitGroups,
  ingredientUnitOptions,
  isUnitUsableForIngredient,
  nutritionIngredientFromDetail,
  parseNutritionStatus,
  unitForPickedIngredient,
} from './ingredient-units';

const egg = {
  category: 'EGG' as const,
  hasDensity: true,
  portions: [
    { unit: 'large', grams: 50 },
    { unit: 'piece', grams: 50.3 },
    { unit: 'small', grams: 38 },
  ],
};
const garlic = {
  category: 'VEGETABLE' as const,
  hasDensity: true,
  portions: [{ unit: 'clove', grams: 3 }],
};
const spiceMix = { category: 'SPICE_DRIED' as const, hasDensity: false, portions: [] };
const proteinBar = {
  category: 'SNACK_PREPARED' as const,
  hasDensity: false,
  portions: [{ unit: 'bar', grams: 45 }],
};

describe('ingredientUnitGroups', () => {
  it('offers volume units only with a density, portions in the shared order', () => {
    expect(ingredientUnitGroups(egg)).toEqual([
      { label: 'Weight', units: ['g', 'kg'] },
      { label: 'Volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup'] },
      { label: 'Portions', units: ['piece', 'small', 'large'] },
      { label: 'Other', units: ['pinch', 'to taste'] },
    ]);
    expect(ingredientUnitOptions(spiceMix)).toEqual(['g', 'kg', 'pinch', 'to taste']);
  });

  it('keeps an ingredient-defined portion and drops a portion named like a volume unit', () => {
    expect(ingredientUnitOptions(proteinBar)).toContain('bar');
    const withCup = { hasDensity: true, portions: [{ unit: 'cup', grams: 125 }] };
    expect(ingredientUnitOptions(withCup).filter((u) => u === 'cup')).toHaveLength(1);
  });
});

describe('isUnitUsableForIngredient', () => {
  it('mirrors the engine: mass always, volume with density, portions by name', () => {
    expect(isUnitUsableForIngredient('grams', spiceMix)).toBe(true);
    expect(isUnitUsableForIngredient('tsp', spiceMix)).toBe(false);
    expect(isUnitUsableForIngredient('tsp', garlic)).toBe(true);
    expect(isUnitUsableForIngredient('cloves', garlic)).toBe(true);
    expect(isUnitUsableForIngredient('medium', garlic)).toBe(false);
    expect(isUnitUsableForIngredient('bar', proteinBar)).toBe(true);
    expect(isUnitUsableForIngredient('lightyears', proteinBar)).toBe(false);
    expect(isUnitUsableForIngredient('pinch', spiceMix)).toBe(true);
  });
});

describe('defaultUnitForIngredient / unitForPickedIngredient', () => {
  it('counts eggs and garlic, measures milk in ml and oil in tbsp, weighs the rest', () => {
    expect(defaultUnitForIngredient(egg)).toBe('piece');
    expect(defaultUnitForIngredient(garlic)).toBe('clove');
    expect(
      defaultUnitForIngredient({ category: 'DAIRY_MILK', hasDensity: true, portions: [] }),
    ).toBe('ml');
    expect(defaultUnitForIngredient({ category: 'OIL_FAT', hasDensity: true, portions: [] })).toBe(
      'tbsp',
    );
    expect(
      defaultUnitForIngredient({ category: 'DAIRY_MILK', hasDensity: false, portions: [] }),
    ).toBe('g');
    expect(defaultUnitForIngredient(spiceMix)).toBe('g');
  });

  it('a fresh "g" line takes the natural unit; a usable unit is kept; an unusable one is replaced', () => {
    expect(unitForPickedIngredient('g', egg)).toBe('piece');
    expect(unitForPickedIngredient('g', egg, { keepDefault: true })).toBe('g');
    expect(unitForPickedIngredient('tbsp', garlic)).toBe('tbsp');
    expect(unitForPickedIngredient('tbsp', spiceMix)).toBe('g');
    expect(unitForPickedIngredient('medium', garlic)).toBe('clove');
  });
});

describe('nutritionIngredientFromDetail + incompleteLineCount', () => {
  it('feeds the shared engine and counts only non-optional problem lines', () => {
    const detail = {
      id: 'egg',
      per100g: { calories: 148, protein: 12.4, carbs: 0.96, fat: 9.96, fiber: 0 },
      densityGPerMl: 1.027,
      edibleFraction: 1,
      portions: egg.portions,
    };
    const lookup = new Map([['egg', nutritionIngredientFromDetail(detail)]]);
    const result = computeRecipeNutrition(
      [
        { ingredientId: 'egg', quantity: 2, unit: 'piece' },
        { ingredientId: 'egg', quantity: 1, unit: 'clove' },
        { ingredientId: null, quantity: 1, unit: 'g', optional: true },
      ],
      lookup,
      1,
    );
    expect(result.perServing.calories).toBe(149);
    expect(result.status).toBe('PARTIAL');
    expect(incompleteLineCount(result)).toBe(1);
  });

  it('parses only the three known statuses', () => {
    expect(parseNutritionStatus('PARTIAL')).toBe('PARTIAL');
    expect(parseNutritionStatus(undefined)).toBeNull();
    expect(parseNutritionStatus('ESTIMATED')).toBeNull();
  });
});
