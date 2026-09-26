import type { ZodType } from 'zod';
import { CHAT_TOOL_DEFINITIONS, dispatchChatTool, streamText } from './chat-tools.js';
import {
  buildCheferizeUserPrompt,
  buildExtractRecipeUserPrompt,
  buildIngredientPricesPrompt,
  buildMealPlanDayChunkPrompt,
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
  MEAL_PLAN_DAY_CHUNK_RULES,
  MEAL_PLAN_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  SHOPPING_LIST_SYSTEM_PROMPT,
  SWAP_SYSTEM_PROMPT,
} from './prompts.js';
import {
  annotatedExtractionSchema,
  cheferizedRecipeSchema,
  dayPlanSchema,
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
  DayPlan,
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

// ─── OpenAI-compatible AI service (secondary provider, premium_plan.md §5.5) ──
// A generic client for any OpenAI-compatible /chat/completions endpoint,
// configured via env (AI_SECONDARY_BASE_URL / AI_SECONDARY_MODEL /
// AI_SECONDARY_API_KEY). Default target is Groq's free tier with
// openai/gpt-oss-120b (1,000 req/day vs Gemini's 20 — see
// docs/ai-quality-spotcheck.md §1 for the provider comparison).
//
// Design constraints:
// - Prompts are SHARED with Gemini (prompts.ts); only request shaping is
//   provider-specific. Gemini enforces output shape via API-level
//   responseSchema; here the equivalent is `response_format: json_object`
//   plus a compact shape instruction appended to the system prompt (strict
//   `json_schema` for the chunked meal plan, see below).
// - All outputs pass the same Zod validators (schemas.ts) — a second
//   provider must never weaken validation.
// - VISION (research §5.4): photo calls (analyzeMealPhoto, photo
//   extractRecipe) use `visionModel` (AI_VISION_MODEL, Groq
//   qwen/qwen3.8-27b by default) with an `image_url` part holding a base64
//   data URL. Without a vision model they throw. The chain only routes photos
//   here when AI_ROUTE_VISION says so. VIDEO is never accepted: no
//   OpenAI-compatible provider takes video input; it stays Gemini-only.
// - MEAL PLAN: `mealPlanMode: 'chunked'` (set by the factory when this
//   provider is FIRST in the meal-plan route) generates the week as 7 per-day
//   calls with a strict JSON schema, then assembles and validates the week.
//   As a failover behind Gemini it keeps the original single call.

const REQUEST_TIMEOUT_MS = 90_000;

// Groq's free tier enforces 8,000 tokens/minute and counts BOTH the input and
// `max_tokens` of a request against it (a too-large request 413s upfront), so
// per-call output budgets stay well under 8K minus typical input size. The
// week plan is the one call that may genuinely need more than fits — a
// truncated response fails JSON parsing and surfaces as the friendly error.
const MAX_TOKENS_WEEK_PLAN = 6_000;
const MAX_TOKENS_DEFAULT = 4_096;
// One day of a plan is ~1–1.3k output tokens; the rest is headroom for the
// reasoning tokens gpt-oss / qwen spend before answering.
const MAX_TOKENS_PLAN_DAY = 3_000;
const MAX_TOKENS_PHOTO = 2_048;
// Chunked plans wait out short rate-limit windows (Groq's per-minute token
// budget) instead of failing the whole week; longer waits fail over.
const CHUNK_MAX_RETRY_WAIT_MS = 30_000;
const CHUNK_TOTAL_WAIT_BUDGET_MS = 60_000;

/** Image types OpenAI-compatible vision endpoints accept as data URLs. */
const VISION_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface OpenAICompatConfig {
  apiKey: string;
  /** e.g. https://api.groq.com/openai/v1 — no trailing slash. */
  baseUrl: string;
  /** e.g. openai/gpt-oss-120b */
  model: string;
  /** Model used for photo calls at the same endpoint, e.g. qwen/qwen3.8-27b. Unset = no vision. */
  visionModel?: string | undefined;
  /** 'chunked' = the week plan as 7 per-day calls. Default 'single' (one call). */
  mealPlanMode?: 'single' | 'chunked' | undefined;
  /** Test seam: waits between chunk retries. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

/** An OpenAI-style multimodal message part. */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface CompletionToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface CompletionMessage {
  role: string;
  content: string | null;
  tool_calls?: CompletionToolCall[];
}

interface ChatCompletionResponse {
  choices?: { message?: CompletionMessage; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type OutboundMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'user'; content: ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls: CompletionToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

// ─── Response-shape instructions ─────────────────────────────────────────────
// Compact TypeScript-ish shapes appended to the system prompt. Gemini gets
// these via responseSchema; OpenAI-compatible endpoints vary in json_schema
// support, so json_object mode + an explicit shape + Zod validation is the
// portable equivalent.

const NUTRITION_SHAPE =
  '{"calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number}';

const INGREDIENT_SHAPE = '{"name":string,"quantity":number,"unit":string}';

const RECIPE_CORE_FIELDS =
  `"name":string,"description":string,"ingredients":[${INGREDIENT_SHAPE}],` +
  `"instructions":[string],"nutritionInfo":${NUTRITION_SHAPE},"cuisineType":string,` +
  `"dietaryTags":[string],"prepTimeMins":number,"cookTimeMins":number,"servings":number`;

const RECIPE_SHAPE = `{"id":string,${RECIPE_CORE_FIELDS},"imageUrl":null}`;

const EXTRACTED_RECIPE_SHAPE = `{${RECIPE_CORE_FIELDS}}`;

const WEEK_PLAN_SHAPE =
  `{"days":[{"dayOfWeek":number (0=Monday…6=Sunday),` +
  `"meals":[{"type":"breakfast"|"lunch"|"dinner"|"snack","recipe":${RECIPE_SHAPE}}]}]}`;

const ANNOTATED_EXTRACTION_SHAPE = `{"recipe":${EXTRACTED_RECIPE_SHAPE},"confidence":"high"|"medium"|"low","assumptions":[string]}`;

const CHEFERIZED_SHAPE = `{"adapted":${EXTRACTED_RECIPE_SHAPE},"changes":[{"kind":"allergen"|"restriction"|"dislike"|"servings"|"other","description":string}]}`;

const SHOPPING_LIST_SHAPE = '{"items":[{"ingredientName":string,"quantity":string,"unit":string}]}';

const INGREDIENT_PRICES_SHAPE =
  '{"items":[{"ingredientName":string,"pricePer100gEur":number|null,"pricePer100mlEur":number|null,' +
  '"pricePerPieceEur":number|null,"caloriesPer100g":number|null,"proteinPer100g":number|null,' +
  '"carbsPer100g":number|null,"fatPer100g":number|null,"fiberPer100g":number|null,"gramsPerPiece":number|null}]}';

function jsonInstruction(shape: string): string {
  return `\n\nRespond with ONLY a single JSON object (no markdown, no commentary) exactly matching this shape:\n${shape}`;
}

const MEAL_PHOTO_SHAPE =
  '{"dishName":string,"confidence":"low"|"med"|"high","kcal":number,"protein":number,"carbs":number,"fat":number,"portionNote":string}';

const DAY_PLAN_SHAPE =
  `{"dayOfWeek":number (0=Monday…6=Sunday),` +
  `"meals":[{"type":"breakfast"|"lunch"|"dinner"|"snack","recipe":${RECIPE_SHAPE}}]}`;

// Strict JSON Schema for one plan day (Groq/Cerebras/OpenAI structured
// outputs): every property required, closed objects, null via a type union.
const NUTRITION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  properties: {
    calories: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    fiber: { type: 'number' },
  },
};

const RECIPE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
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
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit'],
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
      },
    },
    instructions: { type: 'array', items: { type: 'string' } },
    nutritionInfo: NUTRITION_JSON_SCHEMA,
    cuisineType: { type: 'string' },
    dietaryTags: { type: 'array', items: { type: 'string' } },
    prepTimeMins: { type: 'number' },
    cookTimeMins: { type: 'number' },
    servings: { type: 'number' },
    imageUrl: { type: ['string', 'null'] },
  },
};

export const DAY_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dayOfWeek', 'meals'],
  properties: {
    dayOfWeek: { type: 'integer' },
    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'recipe'],
        properties: {
          type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          recipe: RECIPE_JSON_SCHEMA,
        },
      },
    },
  },
};

const NO_VISION_MESSAGE =
  'OpenAICompatibleAIService: no vision model configured (AI_VISION_MODEL) — photo calls cannot run here.';

const NO_VIDEO_MESSAGE =
  'OpenAICompatibleAIService: video input is Gemini-only — no OpenAI-compatible provider takes video.';

type HttpError = Error & { status?: number; retryAfterMs?: number; failover?: boolean };

/** Reads Retry-After (seconds or an HTTP date) into ms. */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class OpenAICompatibleAIService implements IAIService {
  private readonly config: OpenAICompatConfig;
  /** Set once the endpoint rejects strict json_schema — later calls skip it. */
  private strictSchemaUnsupported = false;

  constructor(config: OpenAICompatConfig) {
    if (!config.apiKey) throw new Error('OpenAICompatibleAIService: API key is required');
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, '') };
  }

  private async chatCompletion(
    body: Record<string, unknown>,
    label: string,
    model: string = this.config.model,
  ): Promise<ChatCompletionResponse> {
    const started = Date.now();
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: HttpError = new Error(
        `OpenAICompatibleAIService: ${label} failed with HTTP ${res.status}${
          text ? ` — ${text.slice(0, 300)}` : ''
        }`,
      );
      err.status = res.status;
      const wait = retryAfterMs(res.headers.get('retry-after'));
      if (wait !== undefined) err.retryAfterMs = wait;
      throw err;
    }

    const json = (await res.json()) as ChatCompletionResponse;
    logAiUsage({
      provider: this.providerName(),
      model,
      op: label,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      ms: Date.now() - started,
    });
    return json;
  }

  /** Host of the endpoint (api.groq.com, api.cloudflare.com, …) for usage logs. */
  private providerName(): string {
    try {
      return new URL(this.config.baseUrl).hostname;
    } catch {
      return 'openai-compatible';
    }
  }

  /**
   * One JSON-mode completion returning the raw text: shared prompt + shape
   * instruction in. With `jsonSchema`, asks for strict structured output
   * first and falls back to json_object if the endpoint rejects it.
   */
  private async completeRaw(opts: {
    label: string;
    system: string;
    user: string | ContentPart[];
    shape: string;
    temperature: number;
    maxTokens: number;
    model?: string | undefined;
    jsonSchema?: { name: string; schema: Record<string, unknown> } | undefined;
  }): Promise<string> {
    const request = (responseFormat: Record<string, unknown>) =>
      this.chatCompletion(
        {
          messages: [
            { role: 'system', content: opts.system + jsonInstruction(opts.shape) },
            typeof opts.user === 'string'
              ? { role: 'user', content: opts.user }
              : { role: 'user', content: opts.user },
          ] satisfies OutboundMessage[],
          response_format: responseFormat,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
        },
        opts.label,
        opts.model,
      );

    let response: ChatCompletionResponse;
    if (opts.jsonSchema && !this.strictSchemaUnsupported) {
      try {
        response = await request({
          type: 'json_schema',
          json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
        });
      } catch (err) {
        const e = err as HttpError;
        if (e.status !== 400 || !/json_schema|response_format|strict/i.test(e.message)) throw err;
        console.warn(
          `[AI] ${opts.label}: endpoint rejected strict json_schema — using json_object from now on`,
        );
        this.strictSchemaUnsupported = true;
        response = await request({ type: 'json_object' });
      }
    } else {
      response = await request({ type: 'json_object' });
    }

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) throw new Error(`OpenAICompatibleAIService: empty response from ${opts.label}`);
    return raw;
  }

  /**
   * One JSON-mode completion: shared prompt + shape instruction in, Zod
   * validation out. Every structured method funnels through here.
   */
  private async completeJson<T>(opts: {
    label: string;
    system: string;
    user: string | ContentPart[];
    shape: string;
    schema: ZodType<T>;
    temperature: number;
    maxTokens: number;
    model?: string | undefined;
    jsonSchema?: { name: string; schema: Record<string, unknown> } | undefined;
  }): Promise<T> {
    const raw = await this.completeRaw(opts);

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `OpenAICompatibleAIService: ${opts.label} response JSON is malformed (output may have been truncated) — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `OpenAICompatibleAIService: ${opts.label} response failed validation — ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  /**
   * The user message for a photo call: the instruction text plus the image
   * as a base64 data URL. Throws without a vision model, and flags types the
   * endpoint cannot read (HEIC) so the chain moves to the next provider.
   */
  private visionContent(imageBase64: string, mimeType: string, text: string): ContentPart[] {
    if (!this.config.visionModel) throw new Error(NO_VISION_MESSAGE);
    if (!VISION_MIME_TYPES.has(mimeType)) {
      const err: HttpError = new Error(
        `OpenAICompatibleAIService: ${mimeType || 'unknown'} images are not supported by the vision endpoint`,
      );
      err.failover = true;
      throw err;
    }
    return [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ];
  }

  async generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    const plan =
      this.config.mealPlanMode === 'chunked'
        ? await this.generateMealPlanChunked(input)
        : await this.completeJson({
            label: 'generateMealPlan',
            system: MEAL_PLAN_SYSTEM_PROMPT,
            user: buildMealPlanUserPrompt(input),
            shape: WEEK_PLAN_SHAPE,
            schema: weekPlanResponseSchema,
            temperature: 0.7,
            maxTokens: MAX_TOKENS_WEEK_PLAN,
          });
    // Images come exclusively from our own pipeline — strip whatever the
    // model returned (same rule as the Gemini client).
    for (const day of plan.days) {
      for (const meal of day.meals) {
        meal.recipe.imageUrl = null;
      }
    }
    return plan;
  }

  /**
   * The week as 7 sequential per-day calls (research §5.3): each fits a small
   * context/TPM budget, uses strict JSON schema, and names the dishes already
   * planned so the week does not repeat itself. The assembled week passes the
   * same weekPlanResponseSchema gate as the single call; the meal-plan
   * service then applies the usual macro reconciliation, day-total retry and
   * allergen enforcement to it, exactly as for Gemini.
   */
  private async generateMealPlanChunked(input: MealPlanInput): Promise<WeekPlanResponse> {
    const sleep = this.config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let waitBudget = CHUNK_TOTAL_WAIT_BUDGET_MS;
    const days: DayPlan[] = [];
    const planned: string[] = [];

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const request = () =>
        this.completeJson({
          label: 'generateMealPlan.day',
          system: MEAL_PLAN_SYSTEM_PROMPT + MEAL_PLAN_DAY_CHUNK_RULES,
          user: buildMealPlanDayChunkPrompt(input, dayOfWeek, planned),
          shape: DAY_PLAN_SHAPE,
          schema: dayPlanSchema,
          jsonSchema: { name: 'day_plan', schema: DAY_PLAN_JSON_SCHEMA },
          temperature: 0.7,
          maxTokens: MAX_TOKENS_PLAN_DAY,
        });

      let day;
      try {
        day = await request();
      } catch (err) {
        // A short per-minute window (429 + Retry-After) is waited out once;
        // anything longer (daily quota) propagates and the chain fails over.
        const wait = (err as HttpError).retryAfterMs;
        if ((err as HttpError).status !== 429 || wait === undefined) throw err;
        if (wait > CHUNK_MAX_RETRY_WAIT_MS || wait > waitBudget) throw err;
        waitBudget -= wait;
        await sleep(wait);
        day = await request();
      }

      // The model is told the day; the position is authoritative.
      days.push({ ...day, dayOfWeek });
      planned.push(...day.meals.map((m) => m.recipe.name));
    }

    const week = weekPlanResponseSchema.safeParse({ days });
    if (!week.success) {
      throw new Error(
        `OpenAICompatibleAIService: assembled chunked meal plan failed validation — ${week.error.message}`,
      );
    }
    return week.data;
  }

  async generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    const recipe = await this.completeJson({
      label: 'generateRecipeSwap',
      system: SWAP_SYSTEM_PROMPT,
      user: buildSwapUserPrompt(input),
      shape: RECIPE_SHAPE,
      schema: recipeSchema,
      temperature: 0.8,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
    return { ...recipe, imageUrl: null };
  }

  async generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    return this.completeJson({
      label: 'generateShoppingList',
      system: SHOPPING_LIST_SYSTEM_PROMPT,
      user: buildShoppingListPrompt(input),
      shape: SHOPPING_LIST_SHAPE,
      schema: shoppingListResponseSchema,
      temperature: 0.2,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
  }

  async estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    if (ingredientNames.length === 0) return [];
    const parsed = await this.completeJson({
      label: 'estimateIngredientPrices',
      system: INGREDIENT_PRICES_SYSTEM_PROMPT,
      user: buildIngredientPricesPrompt(ingredientNames),
      shape: INGREDIENT_PRICES_SHAPE,
      schema: ingredientPricesResponseSchema,
      temperature: 0.1,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
    return parsed.items;
  }

  async analyzeMealPhoto(imageBase64: string, mimeType: string): Promise<MealPhotoEstimate> {
    const raw = await this.completeRaw({
      label: 'analyzeMealPhoto',
      system: MEAL_PHOTO_SYSTEM_PROMPT,
      user: this.visionContent(imageBase64, mimeType, MEAL_PHOTO_USER_PROMPT),
      shape: MEAL_PHOTO_SHAPE,
      temperature: 0.2, // estimates should be stable, not creative
      maxTokens: MAX_TOKENS_PHOTO,
      model: this.config.visionModel,
    });
    // Same bounds + rounding gate as the Gemini client.
    return parseMealPhotoResponse(raw);
  }

  /** Text or photo sources; photos use the vision model. Video never runs here. */
  async extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction> {
    if (source.videoBase64) throw new Error(NO_VIDEO_MESSAGE);
    if (!source.imageBase64 && !source.text) {
      throw new Error(
        'OpenAICompatibleAIService.extractRecipeAnnotated: expected text or a photo.',
      );
    }
    return this.completeJson({
      label: 'extractRecipeAnnotated',
      system: EXTRACT_RECIPE_ANNOTATED_SYSTEM_PROMPT,
      ...this.extractionUser(source),
      shape: ANNOTATED_EXTRACTION_SHAPE,
      schema: annotatedExtractionSchema,
      temperature: 0.2,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
  }

  async extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    if (source.videoBase64) throw new Error(NO_VIDEO_MESSAGE);
    if (!source.imageBase64 && !source.text) {
      throw new Error(
        'OpenAICompatibleAIService.extractRecipe: expected text or a photo (URL sources must be fetched by the recipe-import service first).',
      );
    }
    return this.completeJson({
      label: 'extractRecipe',
      system: EXTRACT_RECIPE_SYSTEM_PROMPT,
      ...this.extractionUser(source),
      shape: EXTRACTED_RECIPE_SHAPE,
      schema: extractedRecipeSchema,
      temperature: 0.2,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
  }

  /** User message + model for an extraction: photo → vision model + image part. */
  private extractionUser(source: RecipeExtractionSource): {
    user: string | ContentPart[];
    model?: string | undefined;
  } {
    if (source.imageBase64) {
      return {
        user: this.visionContent(
          source.imageBase64,
          source.mimeType ?? 'image/jpeg',
          buildExtractRecipeUserPrompt({ isPhoto: true, text: source.text ?? '' }),
        ),
        model: this.config.visionModel,
      };
    }
    return { user: buildExtractRecipeUserPrompt({ isPhoto: false, text: source.text ?? '' }) };
  }

  async cheferizeRecipe(input: CheferizeInput): Promise<CheferizedRecipe> {
    // The caller (recipe-import service) re-validates with the P1-2 allergen
    // matcher — this output is never trusted for safety on its own.
    return this.completeJson({
      label: 'cheferizeRecipe',
      system: CHEFERIZE_SYSTEM_PROMPT,
      user: buildCheferizeUserPrompt(input),
      shape: CHEFERIZED_SHAPE,
      schema: cheferizedRecipeSchema,
      temperature: 0.4,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream> {
    const outbound: OutboundMessage[] = [
      { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n${context.contextSummary}` },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const tools = context.tools
      ? CHAT_TOOL_DEFINITIONS.map((def) => ({
          type: 'function' as const,
          function: {
            name: def.name,
            description: def.description,
            parameters: def.parameters,
          },
        }))
      : undefined;

    // Tool loop (bounded), mirroring the Gemini client: resolve function
    // calls with the real services, feed results back, then stream the final
    // text answer word-chunked.
    const MAX_TOOL_ROUNDS = 3;
    let finalText = '';
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await this.chatCompletion(
        {
          messages: outbound,
          temperature: 0.7,
          max_tokens: 1024,
          ...(tools && round < MAX_TOOL_ROUNDS ? { tools } : {}),
        },
        'chat',
      );

      const message = response.choices?.[0]?.message;
      const calls = message?.tool_calls;
      if (!message || !calls?.length || !context.tools) {
        finalText = message?.content ?? '';
        break;
      }

      outbound.push({ role: 'assistant', content: message.content, tool_calls: calls });
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          // Malformed arguments — dispatch with empty args so the tool
          // reports a usable failure back to the model.
        }
        const result = await dispatchChatTool(call.function.name, args, context.tools);
        outbound.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    return streamText(finalText);
  }

  async generateReviewText(input: CoachReviewInput): Promise<string> {
    const response = await this.chatCompletion(
      {
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: buildReviewUserPrompt(input) },
        ] satisfies OutboundMessage[],
        temperature: 0.7,
        max_tokens: 512,
      },
      'generateReviewText',
    );
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenAICompatibleAIService: empty review text');
    return text;
  }
}
