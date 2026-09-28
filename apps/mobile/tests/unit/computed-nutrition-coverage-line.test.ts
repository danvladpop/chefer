import { computedNutritionCoverageLine } from '../../src/features/ingredients/computed-nutrition-card';

// T-40.9 (UX-40 slice 2): the coverage line under the computed stats. Pure,
// so every copy case is unit-tested without rendering the card.

const computed = {
  perServing: { calories: 626, protein: 56, carbs: 60, fat: 20, fiber: 4 },
  unmatched: [] as string[],
  matchedCount: 6,
  totalCount: 6,
};

describe('computedNutritionCoverageLine', () => {
  it('prompts for ingredients when there are none yet', () => {
    expect(
      computedNutritionCoverageLine({ computed: undefined, hasIngredients: false, online: true }),
    ).toBe('Add ingredients to calculate nutrition automatically.');
  });

  it('reads "Calculating…" before the first result arrives', () => {
    expect(
      computedNutritionCoverageLine({ computed: undefined, hasIngredients: true, online: true }),
    ).toBe('Calculating…');
  });

  it('names every matched ingredient when everything resolved', () => {
    expect(computedNutritionCoverageLine({ computed, hasIngredients: true, online: true })).toBe(
      'Calculated from all 6 ingredients.',
    );
  });

  it('names the coverage and the unmatched ingredients (UX-40 mock: "From 5 of 6 ingredients")', () => {
    const partial = { ...computed, unmatched: ['cinnamon'], matchedCount: 5, totalCount: 6 };
    expect(
      computedNutritionCoverageLine({ computed: partial, hasIngredients: true, online: true }),
    ).toBe('From 5 of 6 ingredients · no data for: cinnamon');
  });

  it('offline keeps the last computed numbers and says so', () => {
    expect(computedNutritionCoverageLine({ computed, hasIngredients: true, online: false })).toBe(
      "Offline — showing the last calculated numbers. Will calculate when you're online.",
    );
  });

  it('a single unmatched ingredient is grammatically singular', () => {
    const single = { ...computed, unmatched: [], matchedCount: 1, totalCount: 1 };
    expect(
      computedNutritionCoverageLine({ computed: single, hasIngredients: true, online: true }),
    ).toBe('Calculated from all 1 ingredient.');
  });
});
