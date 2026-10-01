import { describe, expect, it } from 'vitest';
import type { RecipeData } from '../../lib/ai/types.js';
import {
  catalogSlugList,
  computeAiRecipe,
  fitToSlotTarget,
  resolveSlug,
  slotTargets,
} from './ai-recipe-catalog.js';

// plan-ingredient-catalog §6.3, against the committed catalog.json.

function aiRecipe(lines: RecipeData['ingredients'], servings = 1): RecipeData {
  return {
    id: 'recipe_test',
    name: 'Test bowl',
    description: '',
    ingredients: lines,
    instructions: ['Cook.'],
    nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    cuisineType: 'x',
    dietaryTags: [],
    prepTimeMins: 5,
    cookTimeMins: 5,
    servings,
    imageUrl: null,
  };
}

describe('computeAiRecipe', () => {
  it('computes nutrition from slugs (the model states none)', () => {
    const c = computeAiRecipe(
      aiRecipe([
        { name: 'Chicken', quantity: 200, unit: 'g', slug: 'chicken-breast-raw' },
        { name: 'Rice', quantity: 100, unit: 'g', slug: 'rice-white-dry' },
        { name: 'Oil', quantity: 10, unit: 'g', slug: 'olive-oil' },
      ]),
    );
    expect(c.problems).toEqual([]);
    // 224.4 + 365 + 88.4
    expect(c.recipe.nutritionInfo.calories).toBe(678);
  });

  it('fixes a slug only by an EXACT/ALIAS match, never fuzzily', () => {
    const c = computeAiRecipe(
      aiRecipe([
        { name: 'Chicken breast', quantity: 100, unit: 'g', slug: 'chicken-breast' }, // not a slug
        { name: 'Olive oil', quantity: 5, unit: 'g' }, // no slug at all
        { name: 'Dragon pearls', quantity: 50, unit: 'g', slug: 'dragon-pearls' },
      ]),
    );
    expect(c.recipe.ingredients.map((i) => i.slug)).toEqual([
      'chicken-breast-raw',
      'olive-oil',
      undefined,
    ]);
    expect(c.problems).toEqual([
      expect.objectContaining({ lineIndex: 2, rawName: 'Dragon pearls', problem: 'NO_INGREDIENT' }),
    ]);
  });

  it('flags a unit the row cannot convert', () => {
    const c = computeAiRecipe(
      aiRecipe([{ name: 'Chicken', quantity: 1, unit: 'cup', slug: 'chicken-breast-raw' }]),
    );
    expect(c.problems[0]?.problem).toBe('NO_DENSITY');
  });

  it('resolveSlug uses the resolver’s key rules (diacritics, plurals, prep words)', () => {
    expect(resolveSlug('Eggs, beaten')).toBe('egg-whole-raw');
    expect(resolveSlug('unicorn')).toBeUndefined();
  });
});

describe('slot targets and fitting', () => {
  it('splits the day target by meal-type shares over the day’s actual meals', () => {
    const [b, l, d] = slotTargets(2000, ['breakfast', 'lunch', 'dinner']);
    expect(b! + l! + d!).toBeCloseTo(2000, 6);
    expect(d!).toBeGreaterThan(l!);
    expect(l!).toBeGreaterThan(b!);
  });

  it('scales quantities toward the slot target and recomputes (0.6–1.8×)', () => {
    const base = computeAiRecipe(
      aiRecipe([
        { name: 'Rice', quantity: 100, unit: 'g', slug: 'rice-white-dry' },
        { name: 'Broccoli', quantity: 100, unit: 'g', slug: 'broccoli-raw' },
      ]),
    ).recipe; // 397 kcal
    const fitted = fitToSlotTarget(base, 600);
    expect(fitted.ingredients[0]?.quantity).toBe(150);
    expect(Math.abs(fitted.nutritionInfo.calories - 600) / 600).toBeLessThan(0.1);
    // within ±10% already → untouched
    expect(fitToSlotTarget(base, 420)).toBe(base);
    // never beyond 1.8×
    expect(fitToSlotTarget(base, 5000).ingredients[0]?.quantity).toBe(180);
  });
});

describe('catalogSlugList', () => {
  it('groups slugs by category and leaves out what the table cannot eat', () => {
    const all = catalogSlugList(null);
    expect(all).toMatch(/^[A-Z_]+: /m);
    expect(all).toContain('peanut-butter');
    const peanutAllergy = catalogSlugList({
      allergies: ['peanuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    expect(peanutAllergy).not.toContain('peanut-butter');
    expect(peanutAllergy).toContain('olive-oil');
    const vegan = catalogSlugList({
      allergies: [],
      dietaryRestrictions: ['vegan'],
      dislikedIngredients: [],
    });
    expect(vegan).not.toContain('chicken-breast-raw');
    expect(vegan).toContain('tofu-firm');
  });
});
