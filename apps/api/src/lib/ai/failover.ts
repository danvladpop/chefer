import { isCapacityAiError } from './friendly-error.js';
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

// ─── Failover AI service (premium_plan.md §5.5 W3-A) ─────────────────────────
// Composes two live providers into one IAIService. Gemini stays primary for
// quality-sensitive generation; when it throws a capacity/quota error
// (isCapacityAiError — the free tier's 20 req/day exhausting mid-day), the
// call retries once on the OpenAI-compatible secondary. The friendly error
// (friendly-error.ts, applied by the calling services) remains the last
// resort when BOTH providers are exhausted.
//
// Per-call routing:
// - PRIMARY-FIRST (quality-sensitive): generateMealPlan, generateRecipeSwap,
//   cheferizeRecipe, extractRecipe (text sources), generateReviewText.
// - SECONDARY-FIRST (cheap, high-volume — conserves Gemini's 20/day): chat,
//   estimateIngredientPrices, generateShoppingList. These fail BACK to
//   Gemini if the secondary errors.
// - PRIMARY-ONLY (vision — the secondary has none): analyzeMealPhoto,
//   extractRecipe/extractRecipeAnnotated (photo + video sources). No
//   failover; capacity errors surface
//   directly and become the friendly "over capacity" message.
//
// Every call logs which provider served it ("[AI] <label>: served by …") so
// live-quality findings are attributable per provider (W3-B).

interface ProviderRef {
  service: IAIService;
  name: string;
}

/**
 * Whether an error from one provider justifies trying the other. Capacity/
 * quota errors (shared classifier), plus HTTP 413: Groq's free tier rejects
 * requests whose input + max_tokens exceed its 8K tokens/minute budget with
 * 413 — not transient for THIS provider, but the other provider may serve it.
 */
function isFailoverWorthy(err: unknown): boolean {
  return isCapacityAiError(err) || (err as { status?: number }).status === 413;
}

export class FailoverAIService implements IAIService {
  private readonly primary: ProviderRef;
  private readonly secondary: ProviderRef;

  constructor(
    primary: IAIService,
    secondary: IAIService,
    names: { primary: string; secondary: string },
  ) {
    this.primary = { service: primary, name: names.primary };
    this.secondary = { service: secondary, name: names.secondary };
  }

  /** Runs `call` on `first`; on a capacity/quota error retries on `second`. */
  private async run<T>(
    label: string,
    first: ProviderRef,
    second: ProviderRef | null,
    call: (service: IAIService) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await call(first.service);
      console.info(`[AI] ${label}: served by ${first.name}`);
      return result;
    } catch (err) {
      if (!second || !isFailoverWorthy(err)) throw err;
      console.warn(
        `[AI] ${label}: ${first.name} capacity/quota error — failing over to ${second.name} (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
      const result = await call(second.service);
      console.info(`[AI] ${label}: served by ${second.name} (failover)`);
      return result;
    }
  }

  generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    return this.run('generateMealPlan', this.primary, this.secondary, (s) =>
      s.generateMealPlan(input),
    );
  }

  generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    return this.run('generateRecipeSwap', this.primary, this.secondary, (s) =>
      s.generateRecipeSwap(input),
    );
  }

  generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    return this.run('generateShoppingList', this.secondary, this.primary, (s) =>
      s.generateShoppingList(input),
    );
  }

  estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    return this.run('estimateIngredientPrices', this.secondary, this.primary, (s) =>
      s.estimateIngredientPrices(ingredientNames),
    );
  }

  chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream> {
    // Both live clients resolve the full answer (tool loop included) before
    // returning a fake word-stream, so failing over on the promise is safe —
    // no partially-consumed stream can exist.
    return this.run('chat', this.secondary, this.primary, (s) => s.chat(messages, context));
  }

  analyzeMealPhoto(imageBase64: string, mimeType: string): Promise<MealPhotoEstimate> {
    return this.run('analyzeMealPhoto', this.primary, null, (s) =>
      s.analyzeMealPhoto(imageBase64, mimeType),
    );
  }

  extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    // Photo sources are vision — primary-only. Text sources may fail over.
    const second = source.imageBase64 ? null : this.secondary;
    return this.run('extractRecipe', this.primary, second, (s) => s.extractRecipe(source));
  }

  extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction> {
    // Photo and VIDEO sources are vision — primary-only.
    const second = source.imageBase64 || source.videoBase64 ? null : this.secondary;
    return this.run('extractRecipeAnnotated', this.primary, second, (s) =>
      s.extractRecipeAnnotated(source),
    );
  }

  cheferizeRecipe(input: CheferizeInput): Promise<CheferizedRecipe> {
    return this.run('cheferizeRecipe', this.primary, this.secondary, (s) =>
      s.cheferizeRecipe(input),
    );
  }

  async generateReviewText(input: CoachReviewInput): Promise<string> {
    return this.run('generateReviewText', this.primary, this.secondary, (s) =>
      s.generateReviewText(input),
    );
  }
}
