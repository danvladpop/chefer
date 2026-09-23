import { z } from 'zod';
import type { MealPhotoEstimate } from './types.js';

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

export const weekPlanResponseSchema = z.object({
  days: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      meals: z.array(
        z.object({
          type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
          recipe: recipeSchema,
        }),
      ),
    }),
  ),
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

export const aiShoppingListItemSchema = z.object({
  ingredientName: z.string(),
  quantity: z.string(),
  unit: z.string(),
  // category is inferred locally (inferCategory) — omitting it from the AI
  // output cuts ~25% of the response tokens and shaves call latency.
});

export const shoppingListResponseSchema = z.object({
  items: z.array(aiShoppingListItemSchema),
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
