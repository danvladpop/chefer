import { describe, expect, it } from 'vitest';
import { recipeShareText } from './recipe-share';

const recipe = {
  name: 'Oat porridge',
  description: 'Warm and quick.',
  servings: 2,
  sourceUrl: 'https://example.com/porridge',
  ingredients: [
    { name: 'rolled oats', quantity: 60, unit: 'g' },
    { name: 'olive oil', quantity: 1, unit: 'tbsp' },
    { name: 'salt', quantity: 1, unit: 'to taste' },
  ],
  instructions: ['Boil the milk.', 'Stir in the oats.'],
};

describe('recipeShareText (UX-REC-04)', () => {
  it('lists name, ingredients, steps and the source', () => {
    const text = recipeShareText(recipe, 'METRIC');
    expect(text).toContain('Oat porridge');
    expect(text).toContain('Ingredients (2 servings)');
    expect(text).toContain('- 60 g rolled oats');
    expect(text).toContain('- 1 tbsp olive oil');
    expect(text).toContain('1. Boil the milk.');
    expect(text).toContain('Source: https://example.com/porridge');
    expect(text.endsWith('Shared from Chefer')).toBe(true);
  });

  it('omits empty sections', () => {
    const text = recipeShareText(
      { ...recipe, description: ' ', instructions: [], sourceUrl: undefined, servings: 1 },
      'METRIC',
    );
    expect(text).not.toContain('Steps');
    expect(text).not.toContain('Source:');
    expect(text).toContain('Ingredients (1 serving)');
  });
});
