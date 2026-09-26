import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { CHAT_TOOL_DEFINITIONS, dispatchChatTool, streamText } from './chat-tools.js';
import type { ChatToolParamSchema } from './chat-tools.js';
import {
  buildCheferizeUserPrompt,
  buildExtractRecipeUserPrompt,
  buildIngredientPricesPrompt,
  buildMealPlanUserPrompt,
  buildReviewUserPrompt,
  buildShoppingListPrompt,
  buildSwapUserPrompt,
  CHAT_SYSTEM_PROMPT,
  CHEFERIZE_SYSTEM_PROMPT,
  EXTRACT_RECIPE_ANNOTATED_SYSTEM_PROMPT,
  EXTRACT_RECIPE_SYSTEM_PROMPT,
  INGREDIENT_PRICES_SYSTEM_PROMPT,
  MEAL_PHOTO_SYSTEM_PROMPT,
  MEAL_PHOTO_USER_PROMPT,
  MEAL_PLAN_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  SHOPPING_LIST_SYSTEM_PROMPT,
  SWAP_SYSTEM_PROMPT,
} from './prompts.js';
import {
  annotatedExtractionSchema,
  cheferizedRecipeSchema,
  extractedRecipeSchema,
  ingredientPricesResponseSchema,
  parseMealPhotoResponse,
  recipeSchema,
  shoppingListResponseSchema,
  weekPlanResponseSchema,
} from './schemas.js';
import type {
  AnnotatedExtraction,
  ChatContext,
  ChatMessage,
  CheferizedRecipe,
  CheferizeInput,
  CoachReviewInput,
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
import { logAiUsage } from './usage.js';

// ─── Models ───────────────────────────────────────────────────────────────────
// Names come from env (GEMINI_MODEL / GEMINI_FAST_MODEL) via the factory.
// `fast` is the cheaper model for mechanical tasks (shopping-list
// consolidation) where creative quality doesn't matter — roughly 2-3x lower
// latency and a separate free-tier quota from the main model.

export interface GeminiModels {
  main: string;
  fast: string;
}

const DEFAULT_MODELS: GeminiModels = {
  main: 'gemini-2.5-flash',
  fast: 'gemini-2.5-flash-lite',
};

// Zod validators live in schemas.ts — shared with the OpenAI-compatible
// secondary so both providers pass the exact same validation gates.
// parseMealPhotoResponse is re-exported for existing test imports.
export { parseMealPhotoResponse };

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

const ANNOTATED_EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    recipe: EXTRACTED_RECIPE_SCHEMA,
    confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
    assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['recipe', 'confidence', 'assumptions'],
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

// ─── Chat tool schema conversion ─────────────────────────────────────────────
// The shared tool definitions (chat-tools.ts) use a neutral JSON-Schema
// subset; Gemini wants its own Schema format with Type enum constants.

const GEMINI_TYPE_MAP = {
  object: Type.OBJECT,
  string: Type.STRING,
  number: Type.NUMBER,
  array: Type.ARRAY,
} as const;

function toGeminiSchema(p: ChatToolParamSchema): Schema {
  return {
    type: GEMINI_TYPE_MAP[p.type],
    ...(p.description ? { description: p.description } : {}),
    ...(p.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(p.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
          ),
        }
      : {}),
    ...(p.required ? { required: p.required } : {}),
    ...(p.items ? { items: toGeminiSchema(p.items) } : {}),
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
  private readonly models: GeminiModels;

  constructor(apiKey: string, models: GeminiModels = DEFAULT_MODELS) {
    if (!apiKey) throw new Error('GeminiAIService: GEMINI_API_KEY is required');
    this.client = new GoogleGenAI({ apiKey });
    this.models = models;
  }

  /** generateContent + one usage log line (tokens, latency) per call. */
  private async generateLogged(
    params: Parameters<GoogleGenAI['models']['generateContent']>[0],
    op: string,
  ): ReturnType<GoogleGenAI['models']['generateContent']> {
    const started = Date.now();
    const response = await this.client.models.generateContent(params);
    logAiUsage({
      provider: 'gemini',
      model: params.model,
      op,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      ms: Date.now() - started,
    });
    return response;
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
        return await this.generateLogged(params, label);
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
    const response = await this.generateWithRetry(
      {
        model: this.models.main,
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
      },
      'generateMealPlan',
    );

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
    const response = await this.generateWithRetry(
      {
        model: this.models.main,
        contents: buildSwapUserPrompt(input),
        config: {
          systemInstruction: SWAP_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: RECIPE_SCHEMA,
          temperature: 0.8,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'generateRecipeSwap',
    );

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
    const response = await this.generateWithRetry(
      {
        model: this.models.fast,
        contents: buildShoppingListPrompt(input),
        config: {
          systemInstruction: SHOPPING_LIST_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: SHOPPING_LIST_RESPONSE_SCHEMA,
          temperature: 0.2, // low temperature for deterministic consolidation
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'generateShoppingList',
    );

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

    const response = await this.generateWithRetry(
      {
        model: this.models.main,
        contents: buildIngredientPricesPrompt(ingredientNames),
        config: {
          systemInstruction: INGREDIENT_PRICES_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: INGREDIENT_PRICES_RESPONSE_SCHEMA,
          temperature: 0.1, // prices should be as deterministic as possible
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'estimateIngredientPrices',
    );

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
        model: this.models.main,
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
        model: this.models.main,
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
   * Extraction with reviewer provenance, over text or photo sources. Video
   * links arrive as text (their caption/subtitles/transcript): this client is
   * never sent video.
   */
  async extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction> {
    const isPhoto = Boolean(source.imageBase64);
    if (!isPhoto && !source.text) {
      throw new Error(
        'GeminiAIService.extractRecipeAnnotated: expected text or imageBase64 (URL sources must be fetched by the import service first).',
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
        model: this.models.main,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: EXTRACT_RECIPE_ANNOTATED_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: ANNOTATED_EXTRACTION_SCHEMA,
          temperature: 0.2, // extraction should be faithful, not creative
          maxOutputTokens: 4096,
          // Thinking stays ON for every annotated extraction, unlike
          // extractRecipe's thinkingBudget 0. With it disabled the model
          // pattern-completes a method it was never given rather than
          // noticing the content has none — the exact failure the
          // NO_INVENTED_METHOD_RULE addresses. A caption read is ~550 input
          // tokens, so the thinking budget is cheap insurance here.
        },
      },
      'extractRecipeAnnotated',
    );

    const raw = response.text;
    if (!raw) throw new Error('GeminiAIService: empty response from extractRecipeAnnotated');

    const parsed = annotatedExtractionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `GeminiAIService: annotated extraction response failed validation — ${parsed.error.message}`,
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
        model: this.models.main,
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
            functionDeclarations: CHAT_TOOL_DEFINITIONS.map((def) => ({
              name: def.name,
              description: def.description,
              parameters: toGeminiSchema(def.parameters),
            })),
          },
        ]
      : undefined;

    // Tool loop (bounded): resolve function calls with the real services,
    // feed results back, then stream the final text answer. Tool rounds are
    // non-streamed — only the final prose streams to the widget.
    const MAX_TOOL_ROUNDS = 3;
    let finalText = '';
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await this.generateLogged(
        {
          model: this.models.main,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
            maxOutputTokens: 1024,
            ...(toolDeclarations && round < MAX_TOOL_ROUNDS ? { tools: toolDeclarations } : {}),
          },
        },
        'chat',
      );

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
        const result = await dispatchChatTool(call.name ?? '', call.args ?? {}, context.tools);
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: call.name, response: { result } } }],
        });
      }
    }

    return streamText(finalText);
  }

  async generateReviewText(input: CoachReviewInput): Promise<string> {
    const response = await this.generateLogged(
      {
        model: this.models.main,
        contents: buildReviewUserPrompt(input),
        config: {
          systemInstruction: REVIEW_SYSTEM_PROMPT,
          temperature: 0.7,
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'generateReviewText',
    );
    const text = response.text?.trim();
    if (!text) throw new Error('GeminiAIService: empty review text');
    return text;
  }
}
