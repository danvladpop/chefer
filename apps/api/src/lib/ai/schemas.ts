import { z } from 'zod';
import type { FoodTextParseItem, MealPhotoEstimate, NutritionLabelReading } from './types.js';

// ─── Shared Zod validators — parse + validate raw AI responses ───────────────
// These are the source of truth for what we consider a valid response, for
// EVERY live provider (Gemini primary, OpenAI-compatible secondary). A second
// provider must never weaken output validation (premium_plan.md §5.5), so the
// validators live here and both clients import them.

export const nutritionSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
});

export const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

export const recipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  ingredients: z.array(ingredientSchema),
  instructions: z.array(z.string()),
  nutritionInfo: nutritionSchema,
  cuisineType: z.string(),
  dietaryTags: z.array(z.string()),
  prepTimeMins: z.number(),
  cookTimeMins: z.number(),
  servings: z.number(),
  imageUrl: z.string().nullable(),
});

/**
 * A GENERATED recipe (meal plan, day, swap — plan-ingredient-catalog §6.3):
 * every line names a catalog `slug` and the model states no nutrition (I2).
 * A missing slug parses (the server resolves the name or repairs the line);
 * `nutritionInfo` is a zero placeholder that `computeAiRecipe` replaces
 * before anything reads it.
 */
export const generatedIngredientSchema = ingredientSchema.extend({
  slug: z.string().optional(),
});
export const generatedRecipeSchema = recipeSchema
  .omit({ nutritionInfo: true })
  .extend({ ingredients: z.array(generatedIngredientSchema) })
  .transform((r) => ({
    ...r,
    nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  }));

/** One day of a plan — also the unit of the chunked (per-day) generation. */
export const dayPlanSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  meals: z.array(
    z.object({
      type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
      recipe: generatedRecipeSchema,
    }),
  ),
});

/** repairRecipeLines' response (§6.3 repair round). */
export const recipeLineRepairResponseSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), slug: z.string(), quantity: z.number(), unit: z.string() }),
  ),
});

export const weekPlanResponseSchema = z.object({
  days: z.array(dayPlanSchema),
});

// ExtractedRecipe = RecipeData minus id/imageUrl — the AI extracts content,
// not identity, and images come exclusively from our own pipeline.
export const extractedRecipeSchema = recipeSchema.omit({ id: true, imageUrl: true });

/** extractRecipeAnnotated's response — the recipe plus reviewer provenance. */
export const annotatedExtractionSchema = z.object({
  recipe: extractedRecipeSchema,
  confidence: z.enum(['high', 'medium', 'low']),
  assumptions: z.array(z.string()),
});

export const cheferizedRecipeSchema = z.object({
  adapted: extractedRecipeSchema,
  changes: z.array(
    z.object({
      kind: z.enum(['allergen', 'restriction', 'dislike', 'servings', 'other']),
      description: z.string(),
    }),
  ),
});

export const ingredientPriceEstimateSchema = z.object({
  ingredientName: z.string(),
  pricePer100gEur: z.number().nullable(),
  pricePer100mlEur: z.number().nullable(),
  pricePerPieceEur: z.number().nullable(),
  caloriesPer100g: z.number().nullable(),
  proteinPer100g: z.number().nullable(),
  carbsPer100g: z.number().nullable(),
  fatPer100g: z.number().nullable(),
  fiberPer100g: z.number().nullable(),
  gramsPerPiece: z.number().nullable(),
});

export const ingredientPricesResponseSchema = z.object({
  items: z.array(ingredientPriceEstimateSchema),
});

export const mealPhotoEstimateSchema = z.object({
  dishName: z.string().min(1),
  confidence: z.enum(['low', 'med', 'high']),
  kcal: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  portionNote: z.string(),
});

/**
 * Parses + validates a raw meal-photo model response. Exported so the
 * validation (bounds, confidence enum, rounding) is fixture-testable without
 * a live vision call (premium_plan.md §8 AI-cost rule).
 */
export function parseMealPhotoResponse(raw: string): MealPhotoEstimate {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `AI meal photo response JSON is malformed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = mealPhotoEstimateSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`AI meal photo response failed validation — ${parsed.error.message}`);
  }
  const e = parsed.data;
  // Whole numbers only — the confirm sheet edits integers.
  return {
    ...e,
    kcal: Math.round(e.kcal),
    protein: Math.round(e.protein),
    carbs: Math.round(e.carbs),
    fat: Math.round(e.fat),
  };
}

// ─── Nutrition label reading (packaged products, ADR 0006) ───────────────────

const labelNumber = (max: number) => z.number().finite().min(0).max(max).nullable();

export const nutritionLabelReadingSchema = z.object({
  productName: z.string().max(200).nullable(),
  brand: z.string().max(200).nullable(),
  basis: z.enum(['per100g', 'perServing', 'none']),
  servingSizeG: labelNumber(2000),
  kcal: labelNumber(5000),
  protein: labelNumber(500),
  carbs: labelNumber(1000),
  fat: labelNumber(500),
  fiber: labelNumber(500),
  sugar: labelNumber(1000),
  saturatedFat: labelNumber(500),
  salt: labelNumber(100),
  allergens: z.array(z.string().max(60)).max(20),
  confidence: z.enum(['low', 'med', 'high']),
});

/** Parses + validates a raw label-reading response (fixture-testable, like the meal photo). */
export function parseNutritionLabelResponse(raw: string): NutritionLabelReading {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `AI nutrition label response JSON is malformed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = nutritionLabelReadingSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`AI nutrition label response failed validation — ${parsed.error.message}`);
  }
  return parsed.data;
}

// ─── Typed food logging (lane A4) ─────────────────────────────────────────────

export const foodTextParseSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().max(200),
        food: z.string().min(1).max(80),
        grams: z.number().finite().positive().max(5000),
        count: z.number().finite().positive().max(100).nullable(),
        kcalPer100g: z.number().finite().min(0).max(900),
        proteinPer100g: z.number().finite().min(0).max(100),
        carbsPer100g: z.number().finite().min(0).max(100),
        fatPer100g: z.number().finite().min(0).max(100),
      }),
    )
    .max(12),
});

/** Parses + validates a raw food-text response; an unusable item is dropped, not fatal. */
export function parseFoodTextResponse(raw: string): FoodTextParseItem[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `AI food text response JSON is malformed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = foodTextParseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`AI food text response failed validation — ${parsed.error.message}`);
  }
  return parsed.data.items;
}
