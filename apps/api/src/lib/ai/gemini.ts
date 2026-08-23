import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { z } from 'zod';
import {
  buildCheferizeUserPrompt,
  buildExtractRecipeUserPrompt,
  buildIngredientPricesPrompt,
  buildMealPlanUserPrompt,
  buildShoppingListPrompt,
  buildSwapUserPrompt,
  CHAT_SYSTEM_PROMPT,
  CHEFERIZE_SYSTEM_PROMPT,
  EXTRACT_RECIPE_SYSTEM_PROMPT,
  INGREDIENT_PRICES_SYSTEM_PROMPT,
  MEAL_PHOTO_SYSTEM_PROMPT,
  MEAL_PHOTO_USER_PROMPT,
  MEAL_PLAN_SYSTEM_PROMPT,
  SHOPPING_LIST_SYSTEM_PROMPT,
  SWAP_SYSTEM_PROMPT,
} from './prompts.js';
import type {
  ChatContext,
  ChatMessage,
  CheferizedRecipe,
  CheferizeInput,
  ExtractedRecipe,
  IAIService,
  IngredientPriceEstimate,
  MealPhotoEstimate,
  MealPlanInput,
  RecipeData,
  RecipeExtractionSource,
  ShoppingListInput,
  ShoppingListResponse,
  SwapInput,
  WeekPlanResponse,
} from './types.js';

// ─── Model ────────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';

// Faster, cheaper model for mechanical tasks (shopping-list consolidation)
// where creative quality doesn't matter — roughly 2-3× lower latency and a
// separate free-tier quota from the main model.
const FAST_MODEL = 'gemini-2.5-flash-lite';

// ─── Zod validators — parse + validate the raw AI response ───────────────────
// These are the source of truth for what we consider a valid response.
// If Gemini ever returns something malformed, Zod catches it here.

const nutritionSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
});

const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

const recipeSchema = z.object({
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

const weekPlanResponseSchema = z.object({
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

// ─── Gemini response schemas ──────────────────────────────────────────────────
// Mirrors the Zod schemas above but in the Schema format Gemini understands.
// This enforces structured output at the API level — guaranteed valid JSON.

const NUTRITION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    calories: { type: Type.NUMBER },
    protein: { type: Type.NUMBER },
    carbs: { type: Type.NUMBER },
    fat: { type: Type.NUMBER },
    fiber: { type: Type.NUMBER },
  },
  required: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
};

const INGREDIENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    quantity: { type: Type.NUMBER },
    unit: { type: Type.STRING },
  },
  required: ['name', 'quantity', 'unit'],
};

const RECIPE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: INGREDIENT_SCHEMA },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
    nutritionInfo: NUTRITION_SCHEMA,
    cuisineType: { type: Type.STRING },
    dietaryTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    prepTimeMins: { type: Type.NUMBER },
    cookTimeMins: { type: Type.NUMBER },
    servings: { type: Type.NUMBER },
    imageUrl: { type: Type.STRING, nullable: true },
  },
  required: [
    'id',
    'name',
    'description',
    'ingredients',
    'instructions',
    'nutritionInfo',
    'cuisineType',
    'dietaryTags',
    'prepTimeMins',
    'cookTimeMins',
    'servings',
    'imageUrl',
  ],
};

const WEEK_PLAN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dayOfWeek: { type: Type.INTEGER },
          meals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  enum: ['breakfast', 'lunch', 'dinner', 'snack'],
                },
                recipe: RECIPE_SCHEMA,
              },
              required: ['type', 'recipe'],
            },
          },
        },
        required: ['dayOfWeek', 'meals'],
      },
    },
  },
  required: ['days'],
};

// ─── Recipe extraction / Cheferize schemas (F5) ──────────────────────────────
// ExtractedRecipe = RecipeData minus id/imageUrl — the AI extracts content,
// not identity, and images come exclusively from our own pipeline.

const extractedRecipeSchema = recipeSchema.omit({ id: true, imageUrl: true });

const cheferizedRecipeSchema = z.object({
  adapted: extractedRecipeSchema,
  changes: z.array(
    z.object({
      kind: z.enum(['allergen', 'restriction', 'dislike', 'servings', 'other']),
      description: z.string(),
    }),
  ),
});

const EXTRACTED_RECIPE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: INGREDIENT_SCHEMA },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
    nutritionInfo: NUTRITION_SCHEMA,
    cuisineType: { type: Type.STRING },
    dietaryTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    prepTimeMins: { type: Type.NUMBER },
    cookTimeMins: { type: Type.NUMBER },
    servings: { type: Type.NUMBER },
  },
  required: [
    'name',
    'description',
    'ingredients',
    'instructions',
    'nutritionInfo',
    'cuisineType',
    'dietaryTags',
    'prepTimeMins',
    'cookTimeMins',
    'servings',
  ],
};

const CHEFERIZED_RECIPE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    adapted: EXTRACTED_RECIPE_SCHEMA,
    changes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ['allergen', 'restriction', 'dislike', 'servings', 'other'],
          },
          description: { type: Type.STRING },
        },
        required: ['kind', 'description'],
      },
    },
  },
  required: ['adapted', 'changes'],
};

// ─── Shopping list schemas ────────────────────────────────────────────────────

const aiShoppingListItemSchema = z.object({
  ingredientName: z.string(),
  quantity: z.string(),
  unit: z.string(),
  // category is inferred locally (inferCategory) — omitting it from the AI
  // output cuts ~25% of the response tokens and shaves call latency.
});

const shoppingListResponseSchema = z.object({
  items: z.array(aiShoppingListItemSchema),
});

const AI_SHOPPING_LIST_ITEM_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ingredientName: { type: Type.STRING },
    quantity: { type: Type.STRING },
    unit: { type: Type.STRING },
  },
  required: ['ingredientName', 'quantity', 'unit'],
};

const SHOPPING_LIST_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: AI_SHOPPING_LIST_ITEM_SCHEMA },
  },
  required: ['items'],
};

// ─── Ingredient price schemas ────────────────────────────────────────────────

const ingredientPriceEstimateSchema = z.object({
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

const ingredientPricesResponseSchema = z.object({
  items: z.array(ingredientPriceEstimateSchema),
});

const INGREDIENT_PRICES_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ingredientName: { type: Type.STRING },
          pricePer100gEur: { type: Type.NUMBER, nullable: true },
          pricePer100mlEur: { type: Type.NUMBER, nullable: true },
          pricePerPieceEur: { type: Type.NUMBER, nullable: true },
          caloriesPer100g: { type: Type.NUMBER, nullable: true },
          proteinPer100g: { type: Type.NUMBER, nullable: true },
          carbsPer100g: { type: Type.NUMBER, nullable: true },
          fatPer100g: { type: Type.NUMBER, nullable: true },
          fiberPer100g: { type: Type.NUMBER, nullable: true },
          gramsPerPiece: { type: Type.NUMBER, nullable: true },
        },
        required: [
          'ingredientName',
          'pricePer100gEur',
          'pricePer100mlEur',
          'pricePerPieceEur',
          'caloriesPer100g',
          'proteinPer100g',
          'carbsPer100g',
          'fatPer100g',
          'fiberPer100g',
          'gramsPerPiece',
        ],
      },
    },
  },
  required: ['items'],
};

// ─── Meal photo schemas (F4 Snap-to-Log) ─────────────────────────────────────

const mealPhotoEstimateSchema = z.object({
  dishName: z.string().min(1),
  confidence: z.enum(['low', 'med', 'high']),
  kcal: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  portionNote: z.string(),
});

const MEAL_PHOTO_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    dishName: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ['low', 'med', 'high'] },
    kcal: { type: Type.NUMBER },
    protein: { type: Type.NUMBER },
    carbs: { type: Type.NUMBER },
    fat: { type: Type.NUMBER },
    portionNote: { type: Type.STRING },
  },
  required: ['dishName', 'confidence', 'kcal', 'protein', 'carbs', 'fat', 'portionNote'],
};

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
      `GeminiAIService: meal photo response JSON is malformed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = mealPhotoEstimateSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `GeminiAIService: meal photo response failed validation — ${parsed.error.message}`,
    );
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

// ─── Transient error handling ────────────────────────────────────────────────

/**
 * Gemini intermittently returns 503 UNAVAILABLE ("model experiencing high
 * demand") and 429 RESOURCE_EXHAUSTED on the free tier. Both are transient —
 * a single failed attempt should not surface as a user-facing failure.
 */
export function isTransientAiError(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  return status === 429 || status === 500 || status === 503;
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2_000, 6_000]; // between attempt 1→2 and 2→3

// ─── GeminiAIService ──────────────────────────────────────────────────────────

export class GeminiAIService implements IAIService {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('GeminiAIService: GEMINI_API_KEY is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * generateContent with retry on transient errors (429/500/503).
   * Non-transient errors and the final failed attempt are rethrown.
   */
  private async generateWithRetry(
    params: Parameters<GoogleGenAI['models']['generateContent']>[0],
    label = 'generateContent',
  ): ReturnType<GoogleGenAI['models']['generateContent']> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.client.models.generateContent(params);
      } catch (err) {
        lastError = err;
        if (!isTransientAiError(err) || attempt === RETRY_ATTEMPTS) throw err;
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? 6_000;
        console.warn(
          `[GeminiAIService] ${label}: transient error (attempt ${attempt}/${RETRY_ATTEMPTS}), retrying in ${delay}ms…`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError; // unreachable, satisfies TS
  }

  async generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    const response = await this.generateWithRetry({
      model: MODEL,
      contents: buildMealPlanUserPrompt(input),
      config: {
        systemInstruction: MEAL_PLAN_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: WEEK_PLAN_SCHEMA,
        temperature: 0.7,
        maxOutputTokens: 16384,
        // Disable extended thinking to reduce latency; the structured schema
        // already constrains output quality adequately.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let raw: string | null | undefined;
    try {
      raw = response.text;
    } catch (err) {
      throw new Error(
        `GeminiAIService: could not read response text — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!raw) throw new Error('GeminiAIService: empty response from generateMealPlan');

    let parsed;
    try {
      parsed = weekPlanResponseSchema.safeParse(JSON.parse(raw));
    } catch (err) {
      throw new Error(
        `GeminiAIService: response JSON is malformed (output may have been truncated) — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: meal plan response failed validation — ${parsed.error.message}`,
      );
    }

    // A live LLM can only hallucinate image URLs (historically it echoed the
    // same Unsplash photo for multiple dishes). Images come exclusively from
    // our own pipeline — strip whatever the model returned.
    for (const day of parsed.data.days) {
      for (const meal of day.meals) {
        meal.recipe.imageUrl = null;
      }
    }

    return parsed.data;
  }

  async generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    const response = await this.generateWithRetry({
      model: MODEL,
      contents: buildSwapUserPrompt(input),
      config: {
        systemInstruction: SWAP_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: RECIPE_SCHEMA,
        temperature: 0.8,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let raw: string | null | undefined;
    try {
      raw = response.text;
    } catch (err) {
      throw new Error(
        `GeminiAIService: could not read swap response — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!raw) throw new Error('GeminiAIService: empty response from generateRecipeSwap');

    const parsed = recipeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: recipe swap response failed validation — ${parsed.error.message}`,
      );
    }

    // Strip any hallucinated image URL — images come from our own pipeline
    return { ...parsed.data, imageUrl: null };
  }

  async generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    const response = await this.generateWithRetry({
      model: FAST_MODEL,
      contents: buildShoppingListPrompt(input),
      config: {
        systemInstruction: SHOPPING_LIST_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: SHOPPING_LIST_RESPONSE_SCHEMA,
        temperature: 0.2, // low temperature for deterministic consolidation
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let raw: string | null | undefined;
    try {
      raw = response.text;
    } catch (err) {
      throw new Error(
        `GeminiAIService: could not read shopping list response — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!raw) throw new Error('GeminiAIService: empty response from generateShoppingList');

    const parsed = shoppingListResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: shopping list response failed validation — ${parsed.error.message}`,
      );
    }

    return parsed.data;
  }

  async estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    if (ingredientNames.length === 0) return [];

    const response = await this.generateWithRetry({
      model: MODEL,
      contents: buildIngredientPricesPrompt(ingredientNames),
      config: {
        systemInstruction: INGREDIENT_PRICES_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: INGREDIENT_PRICES_RESPONSE_SCHEMA,
        temperature: 0.1, // prices should be as deterministic as possible
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let raw: string | null | undefined;
    try {
      raw = response.text;
    } catch (err) {
      throw new Error(
        `GeminiAIService: could not read ingredient prices response — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!raw) throw new Error('GeminiAIService: empty response from estimateIngredientPrices');

    const parsed = ingredientPricesResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: ingredient prices response failed validation — ${parsed.error.message}`,
      );
    }

    return parsed.data.items;
  }

  /**
   * F4 Snap-to-Log: multimodal dish + macro estimate for a meal photo. The
   * prompt demands honesty about what a photo can't show; confidence
   * (low|med|high) is surfaced verbatim in the confirm sheet.
   */
  async analyzeMealPhoto(imageBase64: string, mimeType: string): Promise<MealPhotoEstimate> {
    const response = await this.generateWithRetry(
      {
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: MEAL_PHOTO_USER_PROMPT },
            ],
          },
        ],
        config: {
          systemInstruction: MEAL_PHOTO_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: MEAL_PHOTO_SCHEMA,
          temperature: 0.2, // estimates should be stable, not creative
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'analyzeMealPhoto',
    );

    let raw: string | null | undefined;
    try {
      raw = response.text;
    } catch (err) {
      throw new Error(
        `GeminiAIService: could not read meal photo response — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!raw) throw new Error('GeminiAIService: empty response from analyzeMealPhoto');

    return parseMealPhotoResponse(raw);
  }

  /**
   * F5 Cheferize — structured extraction from page/pasted text or a photo.
   * URL sources are fetched + stripped by the recipe-import service before
   * this is called; this method never performs network fetches itself (the
   * SSRF guard lives with the fetcher, not the AI layer).
   */
  async extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    const isPhoto = Boolean(source.imageBase64);
    if (!isPhoto && !source.text) {
      throw new Error(
        'GeminiAIService.extractRecipe: expected text or imageBase64 (URL sources must be fetched by the recipe-import service first).',
      );
    }

    const parts: Record<string, unknown>[] = [];
    if (source.imageBase64) {
      parts.push({
        inlineData: { mimeType: source.mimeType ?? 'image/jpeg', data: source.imageBase64 },
      });
    }
    parts.push({ text: buildExtractRecipeUserPrompt({ isPhoto, text: source.text ?? '' }) });

    const response = await this.generateWithRetry(
      {
        model: MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: EXTRACT_RECIPE_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: EXTRACTED_RECIPE_SCHEMA,
          temperature: 0.2, // extraction should be faithful, not creative
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'extractRecipe',
    );

    const raw = response.text;
    if (!raw) throw new Error('GeminiAIService: empty response from extractRecipe');

    const parsed = extractedRecipeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: recipe extraction response failed validation — ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  /**
   * F5 Cheferize — adapts an extracted recipe to the user's allergies,
   * restrictions, dislikes and serving count. The caller (recipe-import
   * service) re-validates the output with the P1-2 allergen matcher; this
   * output is never trusted for safety on its own.
   */
  async cheferizeRecipe(input: CheferizeInput): Promise<CheferizedRecipe> {
    const response = await this.generateWithRetry(
      {
        model: MODEL,
        contents: buildCheferizeUserPrompt(input),
        config: {
          systemInstruction: CHEFERIZE_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: CHEFERIZED_RECIPE_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'cheferizeRecipe',
    );

    const raw = response.text;
    if (!raw) throw new Error('GeminiAIService: empty response from cheferizeRecipe');

    const parsed = cheferizedRecipeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: cheferize response failed validation — ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream> {
    // Convert our internal ChatMessage format to what Gemini expects.
    // Gemini uses 'model' for the assistant role.
    const contents: {
      role: 'user' | 'model';
      parts: Record<string, unknown>[];
    }[] = messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

    const systemInstruction = `${CHAT_SYSTEM_PROMPT}\n\n${context.contextSummary}`;

    const toolDeclarations = context.tools
      ? [
          {
            functionDeclarations: [
              {
                name: 'swapMeal',
                description:
                  "Swaps one meal slot in the user's active weekly plan for an alternative recipe. Use when the user asks to swap, change or replace a meal.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    dayOfWeek: {
                      type: Type.NUMBER,
                      description: 'Day to swap: 0=Monday … 6=Sunday',
                    },
                    mealType: {
                      type: Type.STRING,
                      description: 'One of: breakfast, lunch, dinner, snack',
                    },
                  },
                  required: ['dayOfWeek', 'mealType'],
                } as Schema,
              },
              {
                name: 'scaleRecipe',
                description:
                  "Rescales the ingredient quantities of a recipe from the user's active plan to a different number of servings.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    recipeName: {
                      type: Type.STRING,
                      description: 'Name (or distinctive part of the name) of the recipe to scale',
                    },
                    servings: { type: Type.NUMBER, description: 'Desired number of servings' },
                  },
                  required: ['recipeName', 'servings'],
                } as Schema,
              },
              {
                name: 'addToShoppingList',
                description:
                  "Adds one or more items to the user's shopping list for this week. Use when the user asks to add, put or remember something on the shopping/grocery list.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    items: {
                      type: Type.ARRAY,
                      description: 'Items to add',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING, description: 'Ingredient or product name' },
                          quantity: {
                            type: Type.NUMBER,
                            description: 'Amount (defaults to 1 if omitted)',
                          },
                          unit: {
                            type: Type.STRING,
                            description: 'Unit, e.g. g, kg, ml, l, pcs (defaults to pcs)',
                          },
                        },
                        required: ['name'],
                      },
                    },
                  },
                  required: ['items'],
                } as Schema,
              },
              {
                name: 'getMyReview',
                description:
                  "Fetches the user's latest weekly chef review: logging adherence, average calories, weight trend and any calorie-target adjustment. Use when the user asks about their weekly review, check-in, progress, or why their calorie budget changed.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {},
                } as Schema,
              },
              {
                name: 'logMeal',
                description:
                  "Logs a meal the user says they ATE (off-plan food: 'I ate a burger', 'had a croissant') into today's tracker with your best realistic macro estimate. Do not use it for planned meals.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Short dish name, e.g. "Cheeseburger"',
                    },
                    kcal: { type: Type.NUMBER, description: 'Estimated calories for the portion' },
                    protein: { type: Type.NUMBER, description: 'Estimated protein in grams' },
                    carbs: { type: Type.NUMBER, description: 'Estimated carbs in grams' },
                    fat: { type: Type.NUMBER, description: 'Estimated fat in grams' },
                    mealType: {
                      type: Type.STRING,
                      description: 'One of: breakfast, lunch, dinner, snack (default snack)',
                    },
                  },
                  required: ['name', 'kcal'],
                } as Schema,
              },
              {
                name: 'importRecipe',
                description:
                  "Imports a recipe from a web URL into the user's collection, adapted to their allergies and preferences (Cheferize). Use when the user shares a recipe link and wants it imported, saved or adapted.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: {
                      type: Type.STRING,
                      description: 'Full http(s) URL of the recipe page',
                    },
                  },
                  required: ['url'],
                } as Schema,
              },
              {
                name: 'whatCanIMake',
                description:
                  "Lists the recipes the user can (mostly) cook from what is already in their kitchen/pantry. Use when the user asks what they can make, cook or eat with what they have, or what's in their pantry.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {},
                } as Schema,
              },
            ],
          },
        ]
      : undefined;

    // Tool loop (bounded): resolve function calls with the real services,
    // feed results back, then stream the final text answer. Tool rounds are
    // non-streamed — only the final prose streams to the widget.
    const MAX_TOOL_ROUNDS = 3;
    let finalText = '';
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 1024,
          ...(toolDeclarations && round < MAX_TOOL_ROUNDS ? { tools: toolDeclarations } : {}),
        },
      });

      const calls = response.functionCalls;
      if (!calls?.length || !context.tools) {
        finalText = response.text ?? '';
        break;
      }

      contents.push({
        role: 'model',
        parts: calls.map((call) => ({ functionCall: call })),
      });
      for (const call of calls) {
        let result: string;
        try {
          const args = call.args ?? {};
          if (call.name === 'swapMeal') {
            result = await context.tools.swapMeal({
              dayOfWeek: Number(args['dayOfWeek']),
              mealType: String(args['mealType']),
            });
          } else if (call.name === 'scaleRecipe') {
            result = await context.tools.scaleRecipe({
              recipeName: String(args['recipeName']),
              servings: Number(args['servings']),
            });
          } else if (call.name === 'importRecipe') {
            result = await context.tools.importRecipe({ url: String(args['url']) });
          } else if (call.name === 'addToShoppingList') {
            result = await context.tools.addToShoppingList({
              items: Array.isArray(args['items'])
                ? (args['items'] as { name: string; quantity?: number; unit?: string }[])
                : [],
            });
          } else if (call.name === 'getMyReview') {
            result = await context.tools.getMyReview();
          } else if (call.name === 'whatCanIMake') {
            result = await context.tools.whatCanIMake();
          } else if (call.name === 'logMeal') {
            const mealType = typeof args['mealType'] === 'string' ? args['mealType'] : undefined;
            result = await context.tools.logMeal({
              name: typeof args['name'] === 'string' ? args['name'] : '',
              kcal: Number(args['kcal']),
              ...(args['protein'] != null ? { protein: Number(args['protein']) } : {}),
              ...(args['carbs'] != null ? { carbs: Number(args['carbs']) } : {}),
              ...(args['fat'] != null ? { fat: Number(args['fat']) } : {}),
              ...(mealType !== undefined ? { mealType } : {}),
            });
          } else {
            result = `Unknown tool: ${call.name}`;
          }
        } catch (err) {
          result = `Tool failed: ${err instanceof Error ? err.message : 'unknown error'}`;
        }
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: call.name, response: { result } } }],
        });
      }
    }

    // Stream the final answer in word chunks so the widget's streaming UX is
    // preserved even though tool resolution was request/response.
    const encoder = new TextEncoder();
    const words = finalText.split(/(?<= )/);
    return new ReadableStream({
      async start(controller) {
        try {
          for (const word of words) {
            controller.enqueue(encoder.encode(word));
            await new Promise((r) => setTimeout(r, 12));
          }
        } finally {
          controller.close();
        }
      },
    });
  }
}
