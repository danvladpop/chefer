import { describe, expect, it } from 'vitest';
import {
  IngredientCategory,
  IngredientStatus,
  normalizeAlias,
  NutritionSource,
  NutritionStatus,
} from '@chefer/database';
import {
  INGREDIENT_CATEGORIES,
  ingredientStatusSchema,
  nutritionSourceSchema,
  nutritionStatusSchema,
} from '@chefer/types';
import { normalizeIngredientKey } from '@chefer/utils';

// The @chefer/types string unions mirror the Prisma enums (plan-ingredient-catalog
// §3). The types package cannot import Prisma, so this is where drift is caught.
describe('ingredient catalog enums: @chefer/types ↔ Prisma', () => {
  it.each([
    ['IngredientCategory', INGREDIENT_CATEGORIES, IngredientCategory],
    ['IngredientStatus', ingredientStatusSchema.options, IngredientStatus],
    ['NutritionSource', nutritionSourceSchema.options, NutritionSource],
    ['NutritionStatus', nutritionStatusSchema.options, NutritionStatus],
  ] as const)('%s values match', (_name, shared, prismaEnum) => {
    expect([...shared].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});

// The resolver's lookup keys (@chefer/utils) must be in exactly the form the
// catalog's aliases are stored in (packages/database normalizeAlias), or names
// stop resolving. The two packages cannot import each other.
describe('ingredient key normalization: @chefer/utils ↔ catalog aliases', () => {
  it.each([
    'Mărar',
    'Cașcaval afumat',
    'Jalapeño',
    "Grandma's Extra-Virgin Olive Oil",
    'Dark chocolate 70%',
    '  chickpeas (drained), rinsed ',
    'crème fraîche',
    'ȘTEVIE / sorrel',
  ])('%s', (raw) => {
    expect(normalizeIngredientKey(raw)).toBe(normalizeAlias(raw));
  });
});
