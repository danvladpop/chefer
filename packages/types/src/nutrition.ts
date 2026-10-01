import { z } from 'zod';

// ─── Ingredient catalog + computed nutrition (docs/plan-ingredient-catalog.md) ─
// Shared contract for the catalog rows, recipe lines and computed nutrition, so
// the API (server truth), web and mobile (live preview through the shared
// engine in @chefer/utils) agree on one shape. String unions mirror the Prisma
// enums of the same name (§3).

export const INGREDIENT_CATEGORIES = [
  'VEGETABLE',
  'FRUIT',
  'HERB_FRESH',
  'SPICE_DRIED',
  'LEGUME',
  'GRAIN_CEREAL',
  'FLOUR_BAKING',
  'PASTA_NOODLE',
  'BREAD_BAKERY',
  'NUT_SEED',
  'BEEF',
  'PORK',
  'LAMB_GOAT',
  'POULTRY',
  'GAME',
  'PROCESSED_MEAT',
  'FISH',
  'SEAFOOD',
  'EGG',
  'DAIRY_MILK',
  'DAIRY_CHEESE',
  'DAIRY_YOGURT_CREAM',
  'PLANT_PROTEIN',
  'PLANT_MILK',
  'OIL_FAT',
  'CONDIMENT_SAUCE',
  'VINEGAR',
  'SWEETENER',
  'CANNED_JARRED',
  'PICKLED_FERMENTED',
  'STOCK_BROTH',
  'BEVERAGE',
  'ALCOHOL_COOKING',
  'SUPPLEMENT',
  'SNACK_PREPARED',
  'OTHER',
] as const;
export const ingredientCategorySchema = z.enum(INGREDIENT_CATEGORIES);
export type IngredientCategory = z.infer<typeof ingredientCategorySchema>;

export const ingredientStatusSchema = z.enum(['ACTIVE', 'MERGED', 'DEPRECATED']);
export type IngredientStatus = z.infer<typeof ingredientStatusSchema>;

/** Where a row's nutrition came from. Never an LLM (D1). */
export const nutritionSourceSchema = z.enum(['USDA_FDC', 'CIQUAL', 'LABEL', 'USER', 'ADMIN']);
export type NutritionSource = z.infer<typeof nutritionSourceSchema>;

/**
 * COMPUTED: every non-optional line resolved, numbers come from the catalog.
 * PARTIAL: at least one line could not be resolved; numbers are incomplete.
 * USER_ENTERED: an old client's typed macros, kept because its lines did not
 * all resolve (D4).
 */
export const nutritionStatusSchema = z.enum(['COMPUTED', 'PARTIAL', 'USER_ENTERED']);
export type NutritionStatus = z.infer<typeof nutritionStatusSchema>;

/** Why a recipe line contributed no grams (§5.3). */
export const lineProblemSchema = z.enum([
  'NO_INGREDIENT',
  'NO_DENSITY',
  'NO_PORTION',
  'BAD_UNIT',
  'BAD_QTY',
]);
export type LineProblem = z.infer<typeof lineProblemSchema>;

/** Same shape as the stored `Recipe.nutritionInfo` (per serving) and `nutritionTotal`. */
export const nutritionFactsSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  fiber: z.number().nonnegative(),
});
export type NutritionFacts = z.infer<typeof nutritionFactsSchema>;

/**
 * Core nutrients per 100 g edible portion, EU convention: carbs are available
 * carbohydrate, fiber excluded (D2). All five are required for a private
 * ingredient (D5); the bounds are the §4.5 range validators.
 */
export const ingredientNutrientsSchema = z.object({
  kcalPer100g: z.number().min(0).max(900),
  proteinPer100g: z.number().min(0).max(100),
  carbsPer100g: z.number().min(0).max(100),
  fatPer100g: z.number().min(0).max(100),
  fiberPer100g: z.number().min(0).max(100),
  sugarPer100g: z.number().min(0).max(100).nullish(),
  satFatPer100g: z.number().min(0).max(100).nullish(),
  sodiumMgPer100g: z.number().min(0).max(40000).nullish(),
});
export type IngredientNutrients = z.infer<typeof ingredientNutrientsSchema>;

/** Count / household unit → edible grams for one unit. */
export const ingredientPortionSchema = z.object({
  unit: z.string().min(1).max(32),
  grams: z.number().positive().lt(2000),
  source: z.string().min(1).max(200),
});
export type IngredientPortion = z.infer<typeof ingredientPortionSchema>;

export const ingredientAliasSchema = z.object({
  alias: z.string().min(1).max(120),
  locale: z.enum(['en', 'ro']),
});
export type IngredientAlias = z.infer<typeof ingredientAliasSchema>;

/**
 * One entry of `packages/database/data/ingredients/catalog.json` (§4.4), the
 * git source of truth for global rows (D7). The sync upserts by `slug`.
 */
export const catalogIngredientSchema = ingredientNutrientsSchema.extend({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(160),
  category: ingredientCategorySchema,
  aliases: z.array(ingredientAliasSchema),
  densityGPerMl: z.number().positive().max(3).nullish(),
  edibleFraction: z.number().gt(0).max(1).nullish(),
  nutritionSource: z.enum(['USDA_FDC', 'CIQUAL', 'LABEL']),
  sourceRef: z.string().regex(/^(fdc|ciqual|label):.+/),
  sourceNote: z.string().max(1000).nullish(),
  portions: z.array(ingredientPortionSchema),
});
export type CatalogIngredient = z.infer<typeof catalogIngredientSchema>;

/**
 * A recipe line as the engine and the new API see it. `ingredientId` is null
 * only for an unresolved line; `rawName` is what the author/AI/importer wrote.
 */
export const recipeLineSchema = z.object({
  ingredientId: z.string().min(1).nullable(),
  rawName: z.string().min(1).max(200),
  quantity: z.number().nonnegative().finite(),
  unit: z.string().max(40),
  note: z.string().max(200).nullish(),
  optional: z.boolean().optional(),
});
export type RecipeLine = z.infer<typeof recipeLineSchema>;

/** A stored recipe line (`RecipeIngredient`), with its resolved grams. */
export const storedRecipeLineSchema = recipeLineSchema.extend({
  position: z.number().int().nonnegative(),
  grams: z.number().nonnegative().nullable(),
});
export type StoredRecipeLine = z.infer<typeof storedRecipeLineSchema>;

/** The legacy `Recipe.ingredients` Json mirror that old clients keep reading. */
export const legacyIngredientLineSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});
export type LegacyIngredientLine = z.infer<typeof legacyIngredientLineSchema>;
