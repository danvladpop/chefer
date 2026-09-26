import { describe, expect, it } from 'vitest';
import type { RecipeData } from '../../lib/ai/types.js';
import { reconcileRecipeMacros, roundQuantity } from './macro-reconcile.js';

const row = (
  ingredientName: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
  gramsPerPiece: number | null = null,
) => ({
  ingredientName,
  caloriesPer100g: kcal,
  proteinPer100g: p,
  carbsPer100g: c,
  fatPer100g: f,
  fiberPer100g: 0,
  gramsPerPiece,
});

// Rough USDA-like rows for the audit's "Baked Cod with Lemon Herbs".
const VOCAB = [
  row('cod fillet', 82, 18, 0, 0.7),
  row('asparagus', 20, 2.2, 3.9, 0.1, 16),
  row('cherry tomatoes', 18, 0.9, 3.9, 0.2),
  row('lemon', 29, 1.1, 9, 0.3, 60),
  row('olive oil', 884, 0, 0, 100),
];

const cod = (calories: number): RecipeData => ({
  id: 'r1',
  name: 'Baked Cod with Lemon Herbs',
  description: '',
  ingredients: [
    { name: 'Cod fillet', quantity: 180, unit: 'g' },
    { name: 'Asparagus', quantity: 8, unit: 'pieces' },
    { name: 'Cherry tomatoes', quantity: 150, unit: 'g' },
    { name: 'Lemon', quantity: 0.5, unit: 'piece' },
    { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
  ],
  instructions: [],
  nutritionInfo: { calories, protein: 60, carbs: 60, fat: 65, fiber: 5 },
  cuisineType: 'Mediterranean',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 1,
  imageUrl: null,
});

describe('reconcileRecipeMacros (audit F-REC-2-4)', () => {
  it('scales an inflated recipe up (bounded) and restates macros from the ingredients', () => {
    const { recipe, action, computedCalories } = reconcileRecipeMacros(cod(1100), VOCAB);
    expect(action).toBe('scaled');
    expect(computedCalories).toBeLessThan(400);
    // 1100 / ~340 is beyond the 1.8x cap → portions grow 1.8x, numbers stay honest
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 325, unit: 'g' });
    expect(recipe.nutritionInfo.calories).toBeLessThan(700);
    expect(recipe.nutritionInfo.fat).toBeLessThan(30); // was a stated 65 g
  });

  it('keeps a recipe whose stated calories match its ingredients', () => {
    const { action, recipe } = reconcileRecipeMacros(cod(340), VOCAB);
    expect(action).toBe('kept');
    expect(recipe.nutritionInfo.calories).toBe(340);
  });

  it('scales a mildly inflated recipe to its stated calories', () => {
    const { recipe, action } = reconcileRecipeMacros(cod(480), VOCAB);
    expect(action).toBe('scaled');
    expect(Math.abs(recipe.nutritionInfo.calories - 480) / 480).toBeLessThan(0.08);
  });

  it('leaves the AI numbers alone when the vocabulary covers too little', () => {
    const { action } = reconcileRecipeMacros(cod(1100), VOCAB.slice(0, 2));
    expect(action).toBe('unknown');
  });
});

describe('roundQuantity', () => {
  it('rounds to what a cook would measure', () => {
    expect(roundQuantity(323.9, 'g')).toBe(325);
    expect(roundQuantity(7.4, 'g')).toBe(7);
    expect(roundQuantity(1.3, 'tbsp')).toBe(1.25);
    expect(roundQuantity(0.3, 'piece')).toBe(0.5);
  });
});
