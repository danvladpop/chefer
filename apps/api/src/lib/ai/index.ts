import { env } from '../env.js';
import { FailoverAIService } from './failover.js';
import { GeminiAIService } from './gemini.js';
import { MockAIService } from './mock.js';
import { OpenAICompatibleAIService } from './openai.js';
import type { IAIService } from './types.js';

// ─── AI Service Factory ───────────────────────────────────────────────────────
// Controls which AI backend is used at runtime via env vars.
//
//   AI_MOCK_ENABLED=true   → MockAIService (fixture data, no API calls)
//   AI_MOCK_ENABLED=false  → real provider, selected by AI_PROVIDER:
//     AI_PROVIDER=gemini   → GeminiAIService (gemini-2.5-flash). If
//       AI_SECONDARY_API_KEY is also set, the service is wrapped in
//       FailoverAIService with an OpenAI-compatible secondary
//       (AI_SECONDARY_BASE_URL / AI_SECONDARY_MODEL — Groq free tier by
//       default): capacity/quota errors fail over, cheap high-volume calls
//       (chat, prices, shopping list) go secondary-first, vision stays
//       Gemini-only. See failover.ts for the routing table.
//     AI_PROVIDER=openai   → OpenAICompatibleAIService ALONE (no Gemini) —
//       useful for smoke-testing the secondary. Vision calls fail.
//
// To add a new provider: create <provider>.ts implementing IAIService,
// add a case here, add the key to env.ts. Nothing else changes.

function secondaryName(): string {
  try {
    return `${new URL(env.AI_SECONDARY_BASE_URL).hostname}/${env.AI_SECONDARY_MODEL}`;
  } catch {
    return env.AI_SECONDARY_MODEL;
  }
}

function createSecondary(): OpenAICompatibleAIService {
  return new OpenAICompatibleAIService({
    apiKey: env.AI_SECONDARY_API_KEY!,
    baseUrl: env.AI_SECONDARY_BASE_URL,
    model: env.AI_SECONDARY_MODEL,
  });
}

function createAIService(): IAIService {
  if (env.AI_MOCK_ENABLED) {
    console.info('[AI] Using MockAIService (fixture data)');
    return new MockAIService();
  }

  switch (env.AI_PROVIDER) {
    case 'gemini': {
      const primary = new GeminiAIService(env.GEMINI_API_KEY!);
      if (!env.AI_SECONDARY_API_KEY) {
        console.info('[AI] Using GeminiAIService (gemini-2.5-flash), no secondary configured');
        return primary;
      }
      console.info(
        `[AI] Using GeminiAIService (gemini-2.5-flash) with failover to ${secondaryName()}`,
      );
      return new FailoverAIService(primary, createSecondary(), {
        primary: 'gemini',
        secondary: secondaryName(),
      });
    }

    case 'openai':
    default:
      console.info(`[AI] Using OpenAICompatibleAIService (${secondaryName()}) standalone`);
      return createSecondary();
  }
}

export const aiService: IAIService = createAIService();

// Re-export types for convenience
export type { IAIService } from './types.js';
export type {
  AiShoppingListItem,
  ChatContext,
  ChatMessage,
  ChatTools,
  CheferizedRecipe,
  CheferizeInput,
  DayPlan,
  ExtractedRecipe,
  RecipeChange,
  MealPhotoEstimate,
  RecipeExtractionSource,
  Ingredient,
  IngredientPriceEstimate,
  MealPlanInput,
  MealSlot,
  MealType,
  NutritionInfo,
  RecipeData,
  ShoppingCategory,
  ShoppingListInput,
  ShoppingListResponse,
  SwapInput,
  WeekPlanResponse,
} from './types.js';
