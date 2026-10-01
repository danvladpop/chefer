import { describe, expect, it } from 'vitest';
import {
  IngredientCategory,
  IngredientStatus,
  NutritionSource,
  NutritionStatus,
} from '@chefer/database';
import {
  INGREDIENT_CATEGORIES,
  ingredientStatusSchema,
  nutritionSourceSchema,
  nutritionStatusSchema,
} from '@chefer/types';

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
