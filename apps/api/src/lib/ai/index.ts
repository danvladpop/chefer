import { env } from '../env.js';
import { GeminiAIService } from './gemini.js';
import { MockAIService } from './mock.js';
import { LiveAIService } from './openai.js';
import type { IAIService } from './types.js';

// ─── AI Service Factory ───────────────────────────────────────────────────────
// Controls which AI backend is used at runtime via env vars.
//
//   AI_MOCK_ENABLED=true   → MockAIService (fixture data, no API calls)
//   AI_MOCK_ENABLED=false  → real provider, selected by AI_PROVIDER:
//     AI_PROVIDER=gemini   → GeminiAIService  (gemini-2.5-flash)
//     AI_PROVIDER=openai   → LiveAIService    (stub — not yet implemented)
//     AI_PROVIDER=anthropic→ LiveAIService    (stub — not yet implemented)
//
// To add a new provider: create <provider>.ts implementing IAIService,
// add a case here, add the key to env.ts. Nothing else changes.

function createAIService(): IAIService {
  if (env.AI_MOCK_ENABLED) {
    console.info('[AI] Using MockAIService (fixture data)');
    return new MockAIService();
  }

  switch (env.AI_PROVIDER) {
    case 'gemini':
      console.info('[AI] Using GeminiAIService (gemini-2.5-flash)');
      return new GeminiAIService(env.GEMINI_API_KEY!);

    case 'anthropic':
      console.info('[AI] Using LiveAIService (Anthropic) — stub, not yet implemented');
      return new LiveAIService(env.ANTHROPIC_API_KEY ?? '');

    case 'openai':
    default:
      console.info('[AI] Using LiveAIService (OpenAI) — stub, not yet implemented');
      return new LiveAIService(env.OPENAI_API_KEY ?? '');
  }
}

export const aiService: IAIService = createAIService();

// Re-export types for convenience
export type { IAIService } from './types.js';
export type {
  ChatContext,
  ChatMessage,
  DayPlan,
  Ingredient,
  MealPlanInput,
  MealSlot,
  MealType,
  NutritionInfo,
  RecipeData,
  SwapInput,
  WeekPlanResponse,
} from './types.js';
