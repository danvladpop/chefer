import { isCapacityAiError } from './friendly-error.js';
import { AI_WORKLOADS, DEFAULT_AI_ROUTES, type AiWorkload } from './routing.js';
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

// ─── Provider chain (premium_plan.md §5.5 W3-A → research §5.4 step 1) ───────
// Composes live providers into one IAIService. Every call belongs to a
// workload (routing.ts) and runs down that workload's ordered chain: the first
// provider serves it; on a capacity/quota error (isCapacityAiError) or an HTTP
// 413 the next one retries it. Any other error (validation, bad input) is
// thrown straight away — a second provider is not a fix for a bad request.
// The friendly error (friendly-error.ts, applied by the calling services)
// remains the last resort when the whole chain is exhausted.
//
// The default chains (routing.ts DEFAULT_AI_ROUTES) reproduce the original
// two-provider table exactly:
// - PRIMARY-FIRST (quality-sensitive): generateMealPlan, generateRecipeSwap,
//   cheferizeRecipe, extractRecipe (text sources), generateReviewText.
// - SECONDARY-FIRST (cheap, high-volume): chat, estimateIngredientPrices,
//   generateShoppingList.
// - GEMINI-ONLY: analyzeMealPhoto and photo extraction (the `vision` workload,
//   now routable via AI_ROUTE_VISION), and VIDEO extraction, which is not
//   routable at all: no OpenAI-compatible provider takes video input.
//
// Every call logs which provider served it ("[AI] <label>: served by …") so
// live-quality findings are attributable per provider (W3-B).

export interface ProviderRef {
  service: IAIService;
  /** Display name for logs, e.g. "gemini" or "api.groq.com/openai/gpt-oss-120b". */
  name: string;
}

/** One served call, handed to shadow mode after the user already has the result. */
export interface ShadowObservation {
  workload: AiWorkload;
  op: string;
  input: unknown;
  /** Replays the same call on another service (the candidate chain). */
  invoke: (service: IAIService) => Promise<unknown>;
  result: unknown;
  servedBy: string;
  ms: number;
}

export interface ShadowHook {
  /** Must return synchronously and never throw; the chain guards it anyway. */
  observe(observation: ShadowObservation): void;
}

export interface ChainOptions {
  /** Provider key (as used in routes, e.g. "gemini", "groq", "mock") → service. */
  providers: Record<string, ProviderRef>;
  /** Ordered provider keys per workload; unknown keys are ignored. */
  routes: Readonly<Record<AiWorkload, readonly string[]>>;
  shadow?: ShadowHook | undefined;
}

/**
 * Whether an error from one provider justifies trying the next. Capacity/
 * quota errors (shared classifier), plus HTTP 413: Groq's free tier rejects
 * requests whose input + max_tokens exceed its 8K tokens/minute budget with
 * 413 — not transient for THIS provider, but the next one may serve it.
 * Errors flagged `failover: true` (an input a provider cannot take, e.g. a
 * HEIC photo on the OpenAI-compatible vision path) also move on.
 */
export function isFailoverWorthy(err: unknown): boolean {
  const e = err as { status?: number; failover?: boolean } | null;
  return isCapacityAiError(err) || e?.status === 413 || e?.failover === true;
}

export type ChainKey = AiWorkload | 'video';

export class ChainAIService implements IAIService {
  private readonly chains: Record<ChainKey, ProviderRef[]>;
  private readonly shadow: ShadowHook | undefined;

  constructor(options: ChainOptions) {
    const resolve = (keys: readonly string[]): ProviderRef[] =>
      keys.flatMap((k) => {
        const ref = options.providers[k];
        return ref ? [ref] : [];
      });
    const chains = {} as Record<ChainKey, ProviderRef[]>;
    for (const workload of AI_WORKLOADS) {
      const chain = resolve(options.routes[workload]);
      if (chain.length === 0) {
        throw new Error(`ChainAIService: no configured provider for workload "${workload}"`);
      }
      chains[workload] = chain;
    }
    // Video: Gemini only, never routed. Without Gemini, the vision chain's
    // first provider rejects it with its own "no video" error.
    const gemini = options.providers['gemini'];
    chains.video = gemini ? [gemini] : chains.vision.slice(0, 1);
    this.chains = chains;
    this.shadow = options.shadow;
  }

  /** The provider display names serving a workload, in order (for logs/tests). */
  chainNames(workload: ChainKey): string[] {
    return this.chains[workload].map((p) => p.name);
  }

  private async run<T>(
    label: string,
    workload: ChainKey,
    call: (service: IAIService) => Promise<T>,
    shadowInput?: unknown,
  ): Promise<T> {
    const chain = this.chains[workload];
    const started = Date.now();
    for (let i = 0; i < chain.length; i++) {
      const ref = chain[i]!;
      try {
        const result = await call(ref.service);
        console.info(`[AI] ${label}: served by ${ref.name}${i > 0 ? ' (failover)' : ''}`);
        if (shadowInput !== undefined && workload !== 'video') {
          this.notifyShadow({
            workload,
            op: label,
            input: shadowInput,
            invoke: call,
            result,
            servedBy: ref.name,
            ms: Date.now() - started,
          });
        }
        return result;
      } catch (err) {
        const next = chain[i + 1];
        if (!next || !isFailoverWorthy(err)) throw err;
        console.warn(
          `[AI] ${label}: ${ref.name} capacity/quota error — failing over to ${next.name} (${
            err instanceof Error ? err.message : String(err)
          })`,
        );
      }
    }
    // Unreachable: the loop either returns or throws on its last provider.
    throw new Error(`ChainAIService: empty chain for ${label}`);
  }

  private notifyShadow(observation: ShadowObservation): void {
    if (!this.shadow) return;
    try {
      this.shadow.observe(observation);
    } catch (err) {
      // Shadow mode must never affect the user's request.
      console.warn('[AI] shadow hook threw (ignored):', err);
    }
  }

  generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    return this.run('generateMealPlan', 'mealPlan', (s) => s.generateMealPlan(input), input);
  }

  generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    return this.run('generateRecipeSwap', 'swap', (s) => s.generateRecipeSwap(input), input);
  }

  generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    return this.run(
      'generateShoppingList',
      'shopping',
      (s) => s.generateShoppingList(input),
      input,
    );
  }

  estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    return this.run(
      'estimateIngredientPrices',
      'prices',
      (s) => s.estimateIngredientPrices(ingredientNames),
      ingredientNames,
    );
  }

  chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream> {
    // Both live clients resolve the full answer (tool loop included) before
    // returning a fake word-stream, so failing over on the promise is safe —
    // no partially-consumed stream can exist. Never shadowed: tools write data.
    return this.run('chat', 'chat', (s) => s.chat(messages, context));
  }

  analyzeMealPhoto(imageBase64: string, mimeType: string): Promise<MealPhotoEstimate> {
    return this.run(
      'analyzeMealPhoto',
      'vision',
      (s) => s.analyzeMealPhoto(imageBase64, mimeType),
      { imageBase64, mimeType },
    );
  }

  extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    return this.run(
      'extractRecipe',
      sourceWorkload(source),
      (s) => s.extractRecipe(source),
      source,
    );
  }

  extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction> {
    return this.run(
      'extractRecipeAnnotated',
      sourceWorkload(source),
      (s) => s.extractRecipeAnnotated(source),
      source,
    );
  }

  cheferizeRecipe(input: CheferizeInput): Promise<CheferizedRecipe> {
    return this.run('cheferizeRecipe', 'cheferize', (s) => s.cheferizeRecipe(input), input);
  }

  generateReviewText(input: CoachReviewInput): Promise<string> {
    return this.run('generateReviewText', 'review', (s) => s.generateReviewText(input), input);
  }
}

/** Extraction sources: video → Gemini-only, photo → vision, else text import. */
export function sourceWorkload(source: RecipeExtractionSource): ChainKey {
  if (source.videoBase64) return 'video';
  if (source.imageBase64) return 'vision';
  return 'importText';
}

/**
 * The original two-provider wrapper, kept as a thin constructor over the chain
 * with today's default routes (Gemini = primary, the secondary = groq).
 */
export class FailoverAIService extends ChainAIService {
  constructor(
    primary: IAIService,
    secondary: IAIService,
    names: { primary: string; secondary: string },
  ) {
    super({
      providers: {
        gemini: { service: primary, name: names.primary },
        groq: { service: secondary, name: names.secondary },
      },
      routes: DEFAULT_AI_ROUTES,
    });
  }
}
