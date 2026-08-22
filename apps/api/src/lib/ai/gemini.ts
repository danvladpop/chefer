import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { z } from 'zod';
import {
  buildIngredientPricesPrompt,
  buildMealPlanUserPrompt,
  buildShoppingListPrompt,
  buildSwapUserPrompt,
  CHAT_SYSTEM_PROMPT,
  INGREDIENT_PRICES_SYSTEM_PROMPT,
  MEAL_PLAN_SYSTEM_PROMPT,
  SHOPPING_LIST_SYSTEM_PROMPT,
  SWAP_SYSTEM_PROMPT,
} from './prompts.js';
import type {
  ChatContext,
  ChatMessage,
  IAIService,
  IngredientPriceEstimate,
  MealPlanInput,
  RecipeData,
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
