import type { ZodType } from 'zod';
import { getAiCallContext } from './call-context.js';
import { CHAT_TOOL_DEFINITIONS, dispatchChatTool, streamText } from './chat-tools.js';
import {
  CF_FREE_NEURONS_PER_DAY,
  neuronsForCall,
  textBudgetAllows,
  type NeuronBudget,
} from './cloudflare-budget.js';
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
import { retryAfterFrom, TokenRateState } from './rate-limit.js';
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
//   here when AI_ROUTE_VISION says so. Video links reach this client as
//   plain text (their caption/subtitles/transcript — lib/video-import).
// - MEAL PLAN: `mealPlanMode: 'chunked'` (set by the factory when this
//   provider is FIRST in the meal-plan route) generates the week as 7 per-day
//   calls with a strict JSON schema, then assembles and validates the week.
//   As a failover behind Gemini it keeps the original single call. The days
//   run sequentially and pace themselves against the endpoint's per-minute
//   token budget (rate-limit.ts). See docs/ai-providers.md "Groq limits".
// - RATE LIMITS: background calls (isBackgroundCall) wait out one short 429
//   and retry; interactive calls throw so the chain can fail over.
// - CLOUDFLARE WORKERS AI (free-only mode) is this same client at
//   …/accounts/{id}/ai/v1 with a `neuronBudget`: every call adds its reported
//   neurons to the day's ledger, and once the text share is used up calls
//   throw a capacity error (429, no retry) so the chain moves on or the user
//   gets the friendly "over capacity" message.
// - FAST MODEL: `fastModel` (optional) serves the simple JSON workloads in
//   FAST_MODEL_OPS; everything else uses `model`.

const REQUEST_TIMEOUT_MS = 90_000;

// Output budgets. Groq's free tier allows 8,000 tokens/minute; a request whose
// input + max_tokens exceeds that 413s upfront, so budgets stay well under 8K
// minus typical input size. Reasoning models (gpt-oss) spend part of the
// budget on hidden reasoning tokens BEFORE the answer — at the default
// ("medium") effort a single plan day burned ~5.6k reasoning tokens (measured
// 2026-09-26), so the 3K day budget was gone before any JSON was written and
// Groq answered 400 json_validate_failed with an empty failed_generation.
// `reasoningEffort` (low by default for gpt-oss) keeps it to ~50–150 tokens.
const MAX_TOKENS_WEEK_PLAN = 6_000;
const MAX_TOKENS_DEFAULT = 4_096;
// One day of a plan is ~1–1.3k output tokens at low reasoning effort (measured:
// 1,063 incl. 71 reasoning); the rest is headroom for 4–6-meal days.
const MAX_TOKENS_PLAN_DAY = 4_000;
/** Ceiling for the one truncation retry (stays under the 8K TPM request cap). */
const MAX_TOKENS_CEILING = 6_000;
const MAX_TOKENS_PHOTO = 2_048;
// Chunked plans pace themselves against the per-minute token budget and wait
// out short rate-limit windows instead of failing the whole week; longer
// waits (daily quota) fail over. Groq ADMITS a request against TPM by its
// input + max_tokens (a day was rejected with "Requested 4967" = ~950 input +
// 4,000 max_tokens, measured 2026-09-26), so pacing waits until that fits,
// not just the tokens a day really spends. Nobody waits on a background plan
// (the Sunday auto-plan, the eval), so it may wait much longer.
const CHUNK_MAX_SINGLE_WAIT_MS = 60_000;
const CHUNK_WAIT_BUDGET_INTERACTIVE_MS = 120_000;
const CHUNK_WAIT_BUDGET_BACKGROUND_MS = 300_000;
/** Prompt-size estimate for a day before one has been measured (~900–1,000). */
const CHUNK_PROMPT_ESTIMATE = 1_000;
// Background workloads wait out ONE short 429 (≤ 10 s) before giving up;
// interactive calls fail over straight away, as before.
const BACKGROUND_RETRY_MAX_WAIT_MS = 10_000;
const BACKGROUND_RETRY_JITTER_MS = 250;
/** Operations nobody is waiting on (workers, sweeps) — see isBackgroundCall. */
const BACKGROUND_OPS = new Set([
  'estimateIngredientPrices',
  'generateShoppingList',
  'generateReviewText',
]);
const CHUNK_LABEL = 'generateMealPlan.day';
/**
 * Operations simple enough for a smaller model (AI_SECONDARY_FAST_MODEL /
 * CF_FAST_MODEL): flat JSON lookups and a short paragraph — no allergen
 * reasoning, no recipes. Chat stays on the main model (tool calls write data).
 */
export const FAST_MODEL_OPS: ReadonlySet<string> = new Set([
  'estimateIngredientPrices',
  'generateShoppingList',
  'generateReviewText',
]);

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
  /**
   * `reasoning_effort` sent with text-model calls (gpt-oss: low|medium|high).
   * Unset = not sent (non-reasoning models reject it). Never sent to the
   * vision model.
   */
  reasoningEffort?: 'low' | 'medium' | 'high' | undefined;
  /** Cheaper model for FAST_MODEL_OPS at the same endpoint; unset = `model` for everything. */
  fastModel?: string | undefined;
  /** `reasoning_effort` for `fastModel` (resolved like reasoningEffort). */
  fastReasoningEffort?: 'low' | 'medium' | 'high' | undefined;
  /** Extra request fields for vision-model calls (e.g. Gemma 4's thinking switch). */
  visionExtras?: Record<string, unknown> | undefined;
  /** Workers AI: today's neuron ledger + the text share; calls stop once it is used up. */
  neuronBudget?: NeuronBudget | undefined;
  /** Provider name in usage logs; default = the endpoint's hostname. */
  providerLabel?: string | undefined;
  /** Test seam: waits between chunk retries and rate-limit pauses. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Test seam: clock for the rate-limit state. */
  now?: (() => number) | undefined;
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    /** Workers AI only: what the call cost (also sent as the cf-ai-neurons header). */
    neurons?: number;
  };
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

/** Strict mode sends the JSON schema itself, so the prose shape is left out (~150 tokens). */
const STRICT_JSON_INSTRUCTION =
  '\n\nRespond with ONLY the JSON object described by the response schema (no markdown, no commentary).';

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

type HttpError = Error & { status?: number; retryAfterMs?: number; failover?: boolean };

/**
 * Groq's strict structured-output mode could not produce a schema-valid
 * document: 400 json_validate_failed ("Failed to validate JSON", "max
 * completion tokens reached before generating a valid document", or
 * "Generated JSON does not match the expected schema" — the error text is cut
 * at 300 chars, so the code itself may be missing from the message). Not a
 * rejection of json_schema itself — the call is retried in json_object mode.
 */
function isStrictGenerationFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    (err as HttpError).status === 400 &&
    /json_validate_failed|failed to validate json|max completion tokens reached|does not match the expected schema/i.test(
      err.message,
    )
  );
}

function isTruncation(err: unknown): boolean {
  return err instanceof Error && /max completion tokens reached|truncated/i.test(err.message);
}

/**
 * A call nobody is waiting on: a background operation (prices, shopping,
 * review), a shadow replay, or anything outside a user request (the Sunday
 * auto-plan and other workers set no AI call context). These wait out one
 * short 429; interactive calls fail over instead.
 */
export function isBackgroundCall(label: string): boolean {
  if (label === CHUNK_LABEL) return false; // chunks pace themselves
  if (BACKGROUND_OPS.has(label)) return true;
  const context = getAiCallContext();
  return context === undefined || context.shadow === true;
}

type Validated<T> = { ok: true; data: T } | { ok: false; problem: string };

function parseAgainst<T>(raw: string, schema: ZodType<T>): Validated<T> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      problem: `response JSON is malformed (output may have been truncated) — ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, problem: `response failed validation — ${parsed.error.message}` };
  }
  return { ok: true, data: parsed.data };
}

/** The follow-up turn of a repair retry: the rejected output and why. */
function repairMessages(previous: string, problem: string): OutboundMessage[] {
  return [
    { role: 'assistant', content: previous.slice(0, 8_000) },
    {
      role: 'user',
      content: `That reply was rejected: ${problem.slice(0, 1_000)}\nReply again with ONLY the corrected JSON object, complete and matching the required shape exactly.`,
    },
  ];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class OpenAICompatibleAIService implements IAIService {
  private readonly config: OpenAICompatConfig;
  /** Set once the endpoint rejects strict json_schema — later calls skip it. */
  private strictSchemaUnsupported = false;
  /** The per-minute token budget the endpoint last reported (x-ratelimit-*). */
  private readonly rate: TokenRateState;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Total tokens this instance has spent (prompt + completion), for the plan log. */
  private tokensSpent = 0;
  /** Prompt tokens of the last successful call, for chunk admission estimates. */
  private lastPromptTokens: number | undefined;

  constructor(config: OpenAICompatConfig) {
    if (!config.apiKey) throw new Error('OpenAICompatibleAIService: API key is required');
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, '') };
    this.rate = new TokenRateState(config.now ?? Date.now);
    this.sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * One completion. Background calls (isBackgroundCall) wait out a single
   * short 429 and retry once; everything else throws for the chain to fail
   * over, as before.
   */
  private async chatCompletion(
    body: Record<string, unknown>,
    label: string,
    model: string = this.textModelFor(label),
  ): Promise<ChatCompletionResponse> {
    try {
      return await this.chatCompletionOnce(body, label, model);
    } catch (err) {
      const e = err as HttpError;
      if (
        e.status !== 429 ||
        e.retryAfterMs === undefined ||
        e.retryAfterMs > BACKGROUND_RETRY_MAX_WAIT_MS ||
        !isBackgroundCall(label)
      ) {
        throw err;
      }
      console.warn(`[AI] ${label}: rate limited — retrying once in ${e.retryAfterMs} ms`);
      await this.sleep(e.retryAfterMs + BACKGROUND_RETRY_JITTER_MS);
      return this.chatCompletionOnce(body, label, model);
    }
  }

  /** The model for a text call: the fast model for FAST_MODEL_OPS when set. */
  private textModelFor(label: string): string {
    return this.config.fastModel && FAST_MODEL_OPS.has(label)
      ? this.config.fastModel
      : this.config.model;
  }

  /** Model-specific request fields: reasoning effort (text models), vision extras. */
  private modelExtras(model: string): Record<string, unknown> {
    // Reasoning effort applies to the text models only (the vision model is a
    // different family with different accepted values).
    if (model === this.config.model && this.config.reasoningEffort) {
      return { reasoning_effort: this.config.reasoningEffort };
    }
    if (model === this.config.fastModel && this.config.fastReasoningEffort) {
      return { reasoning_effort: this.config.fastReasoningEffort };
    }
    if (model === this.config.visionModel && model !== this.config.model) {
      return this.config.visionExtras ?? {};
    }
    return {};
  }

  /**
   * Workers AI's text share of today's free neurons is used up: a capacity
   * error (429 → the chain fails over; last in the chain → the friendly
   * over-capacity message). No retryAfterMs, so nothing waits and retries.
   */
  private budgetExhaustedError(label: string, budget: NeuronBudget): HttpError {
    const err: HttpError = new Error(
      `OpenAICompatibleAIService: ${label} skipped — today's Workers AI text budget is used up (${Math.round(
        budget.ledger.usedToday(),
      )}/${budget.textLimit} of ${CF_FREE_NEURONS_PER_DAY} neurons)`,
    );
    err.status = 429;
    return err;
  }

  private async chatCompletionOnce(
    body: Record<string, unknown>,
    label: string,
    model: string,
  ): Promise<ChatCompletionResponse> {
    const budget = this.config.neuronBudget;
    if (budget && !textBudgetAllows(budget)) throw this.budgetExhaustedError(label, budget);
    const started = Date.now();
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model, ...this.modelExtras(model), ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    this.rate.record(res.headers);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: HttpError = new Error(
        `OpenAICompatibleAIService: ${label} failed with HTTP ${res.status}${
          text ? ` — ${text.slice(0, 300)}` : ''
        }`,
      );
      err.status = res.status;
      if (res.status === 429 || res.status === 503) {
        const wait = retryAfterFrom(res.headers, text);
        if (wait !== undefined) err.retryAfterMs = wait;
      }
      throw err;
    }

    const json = (await res.json()) as ChatCompletionResponse;
    const inputTokens = json.usage?.prompt_tokens;
    const outputTokens = json.usage?.completion_tokens;
    this.lastPromptTokens = inputTokens;
    this.tokensSpent += json.usage?.total_tokens ?? (inputTokens ?? 0) + (outputTokens ?? 0);
    let neurons: { neurons: number; neuronsToday: number } | undefined;
    if (budget) {
      const spent = neuronsForCall({
        reported: json.usage?.neurons,
        header: res.headers.get('cf-ai-neurons'),
        model,
        inputTokens,
        outputTokens,
      });
      budget.ledger.record(spent);
      neurons = {
        neurons: Math.round(spent * 100) / 100,
        neuronsToday: Math.round(budget.ledger.usedToday()),
      };
    }
    logAiUsage({
      provider: this.providerName(),
      model,
      op: label,
      inputTokens,
      outputTokens,
      reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
      ms: Date.now() - started,
      ...neurons,
    });
    return json;
  }

  /** Host of the endpoint (api.groq.com, api.cloudflare.com, …) for usage logs. */
  private providerName(): string {
    if (this.config.providerLabel) return this.config.providerLabel;
    try {
      return new URL(this.config.baseUrl).hostname;
    } catch {
      return 'openai-compatible';
    }
  }

  /**
   * One JSON-mode completion returning the raw text: shared prompt + shape
   * instruction in. With `jsonSchema`, asks for strict structured output
   * first; if the endpoint rejects json_schema it switches to json_object for
   * good. `repair` appends the rejected previous output and the reason.
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
    repair?: { previous: string; problem: string } | undefined;
  }): Promise<string> {
    const request = (responseFormat: Record<string, unknown>) =>
      this.chatCompletion(
        {
          messages: [
            {
              role: 'system',
              content:
                opts.system +
                (responseFormat['type'] === 'json_schema'
                  ? STRICT_JSON_INSTRUCTION
                  : jsonInstruction(opts.shape)),
            },
            typeof opts.user === 'string'
              ? { role: 'user', content: opts.user }
              : { role: 'user', content: opts.user },
            ...(opts.repair ? repairMessages(opts.repair.previous, opts.repair.problem) : []),
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
        // A failed generation is not a rejection of the feature — the caller
        // decides what to do with it (completeJson retries in json_object).
        if (isStrictGenerationFailure(err)) throw err;
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
   * One structured completion: shared prompt + shape instruction in, Zod
   * validation out. Every structured method funnels through here.
   *
   * Reliability ladder (each step at most once):
   * 1. strict json_schema when `jsonSchema` is given, else json_object;
   * 2. if strict mode fails to generate (400 json_validate_failed, incl.
   *    truncation), the same request in json_object mode — with 1.5× the
   *    output budget when it was truncated;
   * 3. if the JSON is malformed or fails the Zod schema, ONE repair retry that
   *    shows the model its rejected output and the validation error.
   * Zod stays the gate throughout: a provider never weakens validation.
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
    let raw: string;
    let maxTokens = opts.maxTokens;
    try {
      raw = await this.completeRaw(opts);
    } catch (err) {
      if (!opts.jsonSchema || !isStrictGenerationFailure(err)) throw err;
      if (isTruncation(err)) maxTokens = Math.min(Math.round(maxTokens * 1.5), MAX_TOKENS_CEILING);
      console.warn(
        `[AI] ${opts.label}: strict json_schema generation failed — retrying in json_object mode`,
      );
      raw = await this.completeRaw({ ...opts, jsonSchema: undefined, maxTokens });
    }

    const first = parseAgainst(raw, opts.schema);
    if (first.ok) return first.data;

    console.warn(`[AI] ${opts.label}: ${first.problem.slice(0, 200)} — one repair retry`);
    const repaired = await this.completeRaw({
      ...opts,
      jsonSchema: undefined,
      maxTokens,
      repair: { previous: raw, problem: first.problem },
    });
    const second = parseAgainst(repaired, opts.schema);
    if (second.ok) return second.data;
    throw new Error(`OpenAICompatibleAIService: ${opts.label} ${second.problem}`);
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
    // A user request carries an AI call context; the Sunday worker and the
    // eval do not (see isBackgroundCall).
    let waitBudget = isBackgroundCall('generateMealPlan')
      ? CHUNK_WAIT_BUDGET_BACKGROUND_MS
      : CHUNK_WAIT_BUDGET_INTERACTIVE_MS;
    const days: DayPlan[] = [];
    const planned: string[] = [];
    const spentBefore = this.tokensSpent;
    let waited = 0;

    /** Sleeps `ms` if the plan's wait budget allows; returns whether it did. */
    const wait = async (ms: number): Promise<boolean> => {
      if (ms > CHUNK_MAX_SINGLE_WAIT_MS || ms > waitBudget) return false;
      waitBudget -= ms;
      waited += ms;
      await this.sleep(ms);
      return true;
    };

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      // Pacing: sequential days, and before each one wait until the endpoint's
      // per-minute token budget (last x-ratelimit-* headers) admits another
      // day: its prompt (≈ the last one, plus the growing "already planned"
      // list) + max_tokens. On a paid tier it always fits and never waits.
      const admission = (this.lastPromptTokens ?? CHUNK_PROMPT_ESTIMATE) + 50 + MAX_TOKENS_PLAN_DAY;
      const pace = this.rate.waitMsFor(admission);
      if (pace > 0) await wait(pace);

      const request = () =>
        this.completeJson({
          label: CHUNK_LABEL,
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
        const e = err as HttpError;
        if (e.status !== 429 || e.retryAfterMs === undefined) throw err;
        if (!(await wait(e.retryAfterMs + BACKGROUND_RETRY_JITTER_MS))) throw err;
        day = await request();
      }
      // The model is told the day; the position is authoritative.
      days.push({ ...day, dayOfWeek });
      planned.push(...day.meals.map((m) => m.recipe.name));
    }

    console.info(
      `[AI] generateMealPlan (chunked): 7 days, ${this.tokensSpent - spentBefore} tokens, paced ${waited} ms`,
    );

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

  /** Text or photo sources; photos use the vision model. */
  async extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction> {
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
