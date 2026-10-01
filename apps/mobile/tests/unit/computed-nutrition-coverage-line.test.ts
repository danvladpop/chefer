import { computeRecipeNutrition } from '@chefer/utils';
import { computedNutritionCoverageLine } from '../../src/features/ingredients/computed-nutrition-card';

// plan-ingredient-catalog §10 (P9): the coverage line under the computed
// stats. Pure, so every copy case is unit-tested without rendering the card.

const flour = {
  id: 'flour',
  kcalPer100g: 364,
  proteinPer100g: 10,
  carbsPer100g: 73,
  fatPer100g: 1,
  fiberPer100g: 3,
  portions: [],
};
const lookup = new Map([['flour', flour]]);

const complete = computeRecipeNutrition(
  [
    { ingredientId: 'flour', quantity: 200, unit: 'g' },
    { ingredientId: 'flour', quantity: 1, unit: 'kg' },
  ],
  lookup,
  1,
);
const partial = computeRecipeNutrition(
  [
    { ingredientId: 'flour', quantity: 200, unit: 'g' },
    { ingredientId: 'flour', quantity: 2, unit: 'clove' },
    { ingredientId: null, quantity: 1, unit: 'g' },
  ],
  lookup,
  1,
);

describe('computedNutritionCoverageLine', () => {
  it('prompts for ingredients when there are none yet', () => {
    expect(
      computedNutritionCoverageLine({ result: undefined, hasIngredients: false, online: true }),
    ).toBe('Add ingredients to calculate nutrition automatically.');
  });

  it('says what it is computed from when every line resolves', () => {
    expect(
      computedNutritionCoverageLine({ result: complete, hasIngredients: true, online: true }),
    ).toBe('Computed from 2 ingredients');
  });

  it('PARTIAL counts the lines that still need data', () => {
    expect(
      computedNutritionCoverageLine({ result: partial, hasIngredients: true, online: true }),
    ).toBe('Incomplete — 2 ingredients need data');
  });

  it('while a newly linked row loads it says it is calculating', () => {
    expect(
      computedNutritionCoverageLine({
        result: partial,
        hasIngredients: true,
        online: true,
        isComputing: true,
      }),
    ).toBe('Calculating…');
  });

  it('offline and incomplete explains rows cannot load yet', () => {
    expect(
      computedNutritionCoverageLine({ result: partial, hasIngredients: true, online: false }),
    ).toMatch(/^Incomplete — 2 ingredients need data\. Offline/);
  });
});
