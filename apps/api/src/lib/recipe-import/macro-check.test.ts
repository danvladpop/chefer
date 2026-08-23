import { describe, expect, it } from 'vitest';
import type { ExtractedRecipe } from '../ai/types.js';
import { crossCheckMacros, type MacroVocabularyRow } from './macro-check.js';

// 100 g of "chicken breast" = 165 kcal etc. — plain, round numbers so the
// expected per-serving values are easy to eyeball.
const row = (
  name: string,
  kcalPer100g: number,
  gramsPerPiece: number | null = null,
): MacroVocabularyRow => ({
  ingredientName: name,
  caloriesPer100g: kcalPer100g,
  proteinPer100g: 10,
  carbsPer100g: 10,
  fatPer100g: 5,
  fiberPer100g: 2,
  gramsPerPiece,
});

const recipe = (overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe => ({
  name: 'Test dish',
  description: 'Test',
  // 400 g at 200 kcal/100g = 800 kcal total → 400 kcal/serving at 2 servings
  ingredients: [
    { name: 'chicken breast', quantity: 200, unit: 'g' },
    { name: 'rice', quantity: 200, unit: 'g' },
  ],
  instructions: ['Cook.'],
  nutritionInfo: { calories: 400, protein: 30, carbs: 40, fat: 10, fiber: 4 },
  cuisineType: 'International',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 2,
  ...overrides,
});

const vocabulary = [row('chicken breast', 200), row('rice', 200)];

describe('crossCheckMacros', () => {
  it('returns ok when the stated estimate agrees with the vocabulary (±25%)', () => {
    const result = crossCheckMacros(recipe(), vocabulary);
    expect(result.status).toBe('ok');
    expect(result.computedCaloriesPerServing).toBe(400);
    expect(result.matchedLines).toBe(2);
  });

  it('stays ok just inside the 25% threshold', () => {
    const result = crossCheckMacros(
      recipe({ nutritionInfo: { calories: 322, protein: 30, carbs: 40, fat: 10, fiber: 4 } }),
      vocabulary,
    );
    // |400 - 322| / 322 ≈ 24.2%
    expect(result.status).toBe('ok');
  });

  it('flags uncertain when the AI estimate is >25% off the vocabulary', () => {
    const result = crossCheckMacros(
      recipe({ nutritionInfo: { calories: 150, protein: 30, carbs: 40, fat: 10, fiber: 4 } }),
      vocabulary,
    );
    expect(result.status).toBe('uncertain');
    expect(result.computedCaloriesPerServing).toBe(400);
  });

  it('withholds the computed number when it is implausibly far (>3×) from the stated one', () => {
    const result = crossCheckMacros(
      // Stated 1300 vs computed 400 → ratio 3.25: our number is more likely a
      // coverage artefact than the page being wrong — uncertain, not quoted.
      recipe({ nutritionInfo: { calories: 1300, protein: 30, carbs: 40, fat: 10, fiber: 4 } }),
      vocabulary,
    );
    expect(result.status).toBe('uncertain');
    expect(result.computedCaloriesPerServing).toBeNull();
    expect(result.statedCaloriesPerServing).toBe(1300);
  });

  it('returns unknown when vocabulary coverage is below half the lines', () => {
    const result = crossCheckMacros(recipe(), [row('chicken breast', 200)].slice(0, 0));
    expect(result.status).toBe('unknown');
    expect(result.computedCaloriesPerServing).toBeNull();
  });

  it('uses gramsPerPiece for count units', () => {
    const result = crossCheckMacros(
      recipe({
        // 2 pieces × 100 g × 200 kcal/100g = 400 kcal → 200/serving
        ingredients: [{ name: 'chicken breast', quantity: 2, unit: 'piece' }],
        nutritionInfo: { calories: 200, protein: 30, carbs: 40, fat: 10, fiber: 4 },
      }),
      [row('chicken breast', 200, 100)],
    );
    expect(result.status).toBe('ok');
    expect(result.computedCaloriesPerServing).toBe(200);
  });

  it('flags a zero stated estimate as uncertain rather than dividing by it', () => {
    const result = crossCheckMacros(
      recipe({ nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } }),
      vocabulary,
    );
    expect(result.status).toBe('uncertain');
  });
});
