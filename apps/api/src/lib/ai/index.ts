import type { IAIService } from './types.js';
import { MockAIService } from './mock.js';
import { LiveAIService } from './openai.js';

// ─── AI Service Factory ───────────────────────────────────────────────────────
// Reads AI_MOCK_ENABLED at startup and exports a singleton `aiService`.
// In development / CI: set AI_MOCK_ENABLED=true to use fixture data.
// In production:       set AI_MOCK_ENABLED=false and provide OPENAI_API_KEY.

function createAIService(): IAIService {
  const mockEnabled =
    process.env['AI_MOCK_ENABLED'] === 'true' ||
    process.env['AI_MOCK_ENABLED'] === '1';

  if (mockEnabled) {
    console.info('[AI] Using MockAIService (fixture data)');
    return new MockAIService();
  }

  const apiKey = process.env['OPENAI_API_KEY'] ?? '';
  console.info('[AI] Using LiveAIService');
  return new LiveAIService(apiKey);
}

export const aiService: IAIService = createAIService();

// Re-export types for convenience
export type { IAIService } from './types.js';
export type {
  WeekPlanResponse,
  DayPlan,
  MealSlot,
  RecipeData,
  NutritionInfo,
  Ingredient,
  MealType,
  MealPlanInput,
  SwapInput,
  ChatMessage,
  ChatContext,
} from './types.js';
