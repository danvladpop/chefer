import type {
  ChatContext,
  ChatMessage,
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

// ─── Live OpenAI / Claude Service ────────────────────────────────────────────
// Stub implementation — wired up in Phase 3 (T-031).
// Throws a clear error so developers know when to switch to the mock.

export class LiveAIService implements IAIService {
  constructor(apiKey: string) {
    if (!apiKey) throw new Error('LiveAIService: API key is required');
  }

  async generateMealPlan(_input: MealPlanInput): Promise<WeekPlanResponse> {
    throw new Error(
      'LiveAIService.generateMealPlan is not implemented yet — set AI_MOCK_ENABLED=true or implement Phase 3 (T-031).',
    );
  }

  async generateRecipeSwap(_input: SwapInput): Promise<RecipeData> {
    throw new Error(
      'LiveAIService.generateRecipeSwap is not implemented yet — set AI_MOCK_ENABLED=true or implement Phase 3 (T-031).',
    );
  }

  async generateShoppingList(_input: ShoppingListInput): Promise<ShoppingListResponse> {
    throw new Error(
      'LiveAIService.generateShoppingList is not implemented yet — set AI_MOCK_ENABLED=true or implement Phase 3 (T-031).',
    );
  }

  async estimateIngredientPrices(_ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    throw new Error(
      'LiveAIService.estimateIngredientPrices is not implemented yet — set AI_MOCK_ENABLED=true or use AI_PROVIDER=gemini.',
    );
  }

  async chat(_messages: ChatMessage[], _context: ChatContext): Promise<ReadableStream> {
    throw new Error(
      'LiveAIService.chat is not implemented yet — set AI_MOCK_ENABLED=true or implement Phase 3 (T-031).',
    );
  }

  async analyzeMealPhoto(_imageBase64: string, _mimeType: string): Promise<MealPhotoEstimate> {
    throw new Error(
      'LiveAIService.analyzeMealPhoto is not implemented yet — set AI_MOCK_ENABLED=true or use AI_PROVIDER=gemini.',
    );
  }

  async extractRecipe(_source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    throw new Error(
      'LiveAIService.extractRecipe is not implemented yet — set AI_MOCK_ENABLED=true or use AI_PROVIDER=gemini.',
    );
  }
}
