import { describe, expect, it } from 'vitest';
import {
  catalogIngredientSchema,
  ingredientNutrientsSchema,
  recipeLineSchema,
  type CatalogIngredient,
} from './nutrition';

const CHICKEN: CatalogIngredient = {
  slug: 'chicken-breast-raw',
  name: 'Chicken breast, raw',
  category: 'POULTRY',
  aliases: [
    { alias: 'chicken breast', locale: 'en' },
    { alias: 'piept de pui', locale: 'ro' },
  ],
  kcalPer100g: 120,
  proteinPer100g: 22.5,
  carbsPer100g: 0,
  fatPer100g: 2.6,
  fiberPer100g: 0,
  nutritionSource: 'USDA_FDC',
  sourceRef: 'fdc:171077',
  portions: [{ unit: 'breast', grams: 174, source: 'fdc-portion:1' }],
};

describe('catalogIngredientSchema', () => {
  it('accepts a sourced global row', () => {
    expect(catalogIngredientSchema.parse(CHICKEN)).toEqual(CHICKEN);
  });

  it('rejects a row without provenance, or with USER/ADMIN as a global source (D1)', () => {
    expect(catalogIngredientSchema.safeParse({ ...CHICKEN, sourceRef: '171077' }).success).toBe(
      false,
    );
    expect(catalogIngredientSchema.safeParse({ ...CHICKEN, nutritionSource: 'USER' }).success).toBe(
      false,
    );
  });

  it('rejects non-kebab slugs and impossible portions', () => {
    expect(catalogIngredientSchema.safeParse({ ...CHICKEN, slug: 'Chicken Breast' }).success).toBe(
      false,
    );
    expect(
      catalogIngredientSchema.safeParse({
        ...CHICKEN,
        portions: [{ unit: 'piece', grams: 0, source: 'x' }],
      }).success,
    ).toBe(false);
  });
});

describe('ingredientNutrientsSchema (private ingredients, D5)', () => {
  it('requires all five core nutrients', () => {
    const { fiberPer100g: _omit, ...missingFiber } = CHICKEN;
    expect(ingredientNutrientsSchema.safeParse(missingFiber).success).toBe(false);
  });

  it('applies the §4.5 ranges', () => {
    expect(ingredientNutrientsSchema.safeParse({ ...CHICKEN, kcalPer100g: 901 }).success).toBe(
      false,
    );
    expect(ingredientNutrientsSchema.safeParse({ ...CHICKEN, fatPer100g: -1 }).success).toBe(false);
  });
});

describe('recipeLineSchema', () => {
  it('allows an unresolved line (null ingredientId) but not a negative quantity', () => {
    const line = { ingredientId: null, rawName: 'mystery', quantity: 1, unit: 'g' };
    expect(recipeLineSchema.safeParse(line).success).toBe(true);
    expect(recipeLineSchema.safeParse({ ...line, quantity: -1 }).success).toBe(false);
  });
});
