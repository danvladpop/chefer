import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { z } from 'zod';
import {
  buildMealPlanUserPrompt,
  buildShoppingListPrompt,
  buildSwapUserPrompt,
  CHAT_SYSTEM_PROMPT,
  MEAL_PLAN_SYSTEM_PROMPT,
  SHOPPING_LIST_SYSTEM_PROMPT,
  SWAP_SYSTEM_PROMPT,
} from './prompts.js';
import type {
  ChatContext,
  ChatMessage,
  IAIService,
  MealPlanInput,
  RecipeData,
  ShoppingListInput,
  ShoppingListResponse,
  SwapInput,
  WeekPlanResponse,
} from './types.js';

// ─── Model ────────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';

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
  category: z.enum(['produce', 'proteins', 'dairy', 'grains', 'frozen', 'other']),
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
    category: {
      type: Type.STRING,
      enum: ['produce', 'proteins', 'dairy', 'grains', 'frozen', 'other'],
    },
  },
  required: ['ingredientName', 'quantity', 'unit', 'category'],
};

const SHOPPING_LIST_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: AI_SHOPPING_LIST_ITEM_SCHEMA },
  },
  required: ['items'],
};

// ─── GeminiAIService ──────────────────────────────────────────────────────────

export class GeminiAIService implements IAIService {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('GeminiAIService: GEMINI_API_KEY is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    const response = await this.client.models.generateContent({
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

    return parsed.data;
  }

  async generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    const response = await this.client.models.generateContent({
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

    return parsed.data;
  }

  async generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    const response = await this.client.models.generateContent({
      model: MODEL,
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

  async chat(messages: ChatMessage[], _context: ChatContext): Promise<ReadableStream> {
    // Convert our internal ChatMessage format to what Gemini expects.
    // Gemini uses 'model' for the assistant role.
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

    const stream = await this.client.models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT,
        temperature: 0.9,
        maxOutputTokens: 1024,
      },
    });

    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });
  }
}
