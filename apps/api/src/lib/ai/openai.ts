import type { ZodType } from 'zod';
import { CHAT_TOOL_DEFINITIONS, dispatchChatTool, streamText } from './chat-tools.js';
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
//   plus a compact shape instruction appended to the system prompt.
// - All outputs pass the same Zod validators (schemas.ts) — a second
//   provider must never weaken validation.
// - NO VISION: gpt-oss has no image input, so analyzeMealPhoto and photo
//   extractRecipe throw immediately; the failover wrapper keeps those
//   Gemini-only and never routes them here.

const REQUEST_TIMEOUT_MS = 90_000;

// Groq's free tier enforces 8,000 tokens/minute and counts BOTH the input and
// `max_tokens` of a request against it (a too-large request 413s upfront), so
// per-call output budgets stay well under 8K minus typical input size. The
// week plan is the one call that may genuinely need more than fits — a
// truncated response fails JSON parsing and surfaces as the friendly error.
const MAX_TOKENS_WEEK_PLAN = 6_000;
const MAX_TOKENS_DEFAULT = 4_096;

export interface OpenAICompatConfig {
  apiKey: string;
  /** e.g. https://api.groq.com/openai/v1 — no trailing slash. */
  baseUrl: string;
  /** e.g. openai/gpt-oss-120b */
  model: string;
}

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

const NO_VISION_MESSAGE =
  'OpenAICompatibleAIService: the secondary model has no vision support — photo calls are Gemini-only (premium_plan.md §5.5).';

// ─── Service ─────────────────────────────────────────────────────────────────

export class OpenAICompatibleAIService implements IAIService {
  private readonly config: OpenAICompatConfig;

  constructor(config: OpenAICompatConfig) {
    if (!config.apiKey) throw new Error('OpenAICompatibleAIService: API key is required');
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, '') };
  }

  private async chatCompletion(
    body: Record<string, unknown>,
    label: string,
  ): Promise<ChatCompletionResponse> {
    const started = Date.now();
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(
        `OpenAICompatibleAIService: ${label} failed with HTTP ${res.status}${
          text ? ` — ${text.slice(0, 300)}` : ''
        }`,
      );
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    const json = (await res.json()) as ChatCompletionResponse;
    logAiUsage({
      provider: this.providerName(),
      model: this.config.model,
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
   * One JSON-mode completion: shared prompt + shape instruction in, Zod
   * validation out. Every structured method funnels through here.
   */
  private async completeJson<T>(opts: {
    label: string;
    system: string;
    user: string;
    shape: string;
    schema: ZodType<T>;
    temperature: number;
    maxTokens: number;
  }): Promise<T> {
    const response = await this.chatCompletion(
      {
        messages: [
          { role: 'system', content: opts.system + jsonInstruction(opts.shape) },
          { role: 'user', content: opts.user },
        ] satisfies OutboundMessage[],
        response_format: { type: 'json_object' },
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      },
      opts.label,
    );

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) throw new Error(`OpenAICompatibleAIService: empty response from ${opts.label}`);

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

  async generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    const plan = await this.completeJson({
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

  async analyzeMealPhoto(_imageBase64: string, _mimeType: string): Promise<MealPhotoEstimate> {
    throw new Error(NO_VISION_MESSAGE);
  }

  /**
   * Text-only annotated extraction. The secondary has no vision, so video
   * sources never route here — the failover wrapper keeps them Gemini-only.
   */
  async extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction> {
    if (source.imageBase64 || source.videoBase64) throw new Error(NO_VISION_MESSAGE);
    if (!source.text) {
      throw new Error('OpenAICompatibleAIService.extractRecipeAnnotated: expected text.');
    }
    return this.completeJson({
      label: 'extractRecipeAnnotated',
      system: EXTRACT_RECIPE_ANNOTATED_SYSTEM_PROMPT,
      user: buildExtractRecipeUserPrompt({ isPhoto: false, text: source.text }),
      shape: ANNOTATED_EXTRACTION_SHAPE,
      schema: annotatedExtractionSchema,
      temperature: 0.2,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
  }

  async extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    if (source.imageBase64 || source.videoBase64) throw new Error(NO_VISION_MESSAGE);
    if (!source.text) {
      throw new Error(
        'OpenAICompatibleAIService.extractRecipe: expected text (URL sources must be fetched by the recipe-import service first).',
      );
    }
    return this.completeJson({
      label: 'extractRecipe',
      system: EXTRACT_RECIPE_SYSTEM_PROMPT,
      user: buildExtractRecipeUserPrompt({ isPhoto: false, text: source.text }),
      shape: EXTRACTED_RECIPE_SHAPE,
      schema: extractedRecipeSchema,
      temperature: 0.2,
      maxTokens: MAX_TOKENS_DEFAULT,
    });
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
