import type {
  IAIService,
  MealPlanInput,
  SwapInput,
  WeekPlanResponse,
  RecipeData,
  ChatMessage,
  ChatContext,
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

  async chat(_messages: ChatMessage[], _context: ChatContext): Promise<ReadableStream> {
    throw new Error(
      'LiveAIService.chat is not implemented yet — set AI_MOCK_ENABLED=true or implement Phase 3 (T-031).',
    );
  }
}
