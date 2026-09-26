import { env } from '../env.js';
import { ChainAIService, type ProviderRef } from './failover.js';
import { GeminiAIService } from './gemini.js';
import { MockAIService } from './mock.js';
import { OpenAICompatibleAIService } from './openai.js';
import {
  AI_PROVIDER_NAMES,
  AI_ROUTE_ENV_KEYS,
  AI_WORKLOADS,
  describeRoutes,
  parseChain,
  resolveRoutes,
  type AiProviderName,
  type AiWorkload,
} from './routing.js';
import type { IAIService } from './types.js';

// ─── AI Service Factory ───────────────────────────────────────────────────────
// Controls which AI backend is used at runtime via env vars.
//
//   AI_MOCK_ENABLED=true   → MockAIService (fixture data, no API calls)
//   AI_MOCK_ENABLED=false  → real providers:
//     gemini — GeminiAIService (GEMINI_MODEL / GEMINI_FAST_MODEL), available
//       when AI_PROVIDER=gemini.
//     groq   — OpenAICompatibleAIService at AI_SECONDARY_BASE_URL /
//       AI_SECONDARY_MODEL (Groq free tier by default; AI_VISION_MODEL for
//       photos), available when AI_SECONDARY_API_KEY is set.
//   Each workload runs down its provider chain (AI_ROUTE_* env vars; unset =
//   today's table in routing.ts): capacity/quota/413 errors fail over, cheap
//   high-volume calls (chat, prices, shopping list) go groq-first, vision
//   and video stay Gemini-only. With a single provider (no secondary key, or
//   AI_PROVIDER=openai) that provider serves everything directly, as before.
//
// To add a new provider: create <provider>.ts implementing IAIService, add
// its name to routing.ts AI_PROVIDER_NAMES, build it here, add its key to
// env.ts. Nothing else changes.

function secondaryName(): string {
  try {
    return `${new URL(env.AI_SECONDARY_BASE_URL).hostname}/${env.AI_SECONDARY_MODEL}`;
  } catch {
    return env.AI_SECONDARY_MODEL;
  }
}

/** AI_ROUTE_* values that are set, parsed (env.ts already validated them). */
function routeOverrides(): Partial<Record<AiWorkload, AiProviderName[]>> {
  const overrides: Partial<Record<AiWorkload, AiProviderName[]>> = {};
  for (const workload of AI_WORKLOADS) {
    const value = env[AI_ROUTE_ENV_KEYS[workload]];
    if (value) overrides[workload] = parseChain(value, AI_PROVIDER_NAMES);
  }
  return overrides;
}

function createAIService(): IAIService {
  if (env.AI_MOCK_ENABLED) {
    console.info('[AI] Using MockAIService (fixture data)');
    return new MockAIService();
  }

  const available: AiProviderName[] = [];
  if (env.AI_PROVIDER === 'gemini') available.push('gemini');
  if (env.AI_SECONDARY_API_KEY) available.push('groq');

  const overrides = routeOverrides();
  const routes = resolveRoutes(overrides, available, (msg) => console.warn(`[AI] ${msg}`));

  const providers: Record<string, ProviderRef> = {};
  if (available.includes('gemini')) {
    providers['gemini'] = {
      name: 'gemini',
      service: new GeminiAIService(env.GEMINI_API_KEY!, {
        main: env.GEMINI_MODEL,
        fast: env.GEMINI_FAST_MODEL,
      }),
    };
  }
  if (available.includes('groq')) {
    providers['groq'] = {
      name: secondaryName(),
      service: new OpenAICompatibleAIService({
        apiKey: env.AI_SECONDARY_API_KEY!,
        baseUrl: env.AI_SECONDARY_BASE_URL,
        model: env.AI_SECONDARY_MODEL,
        visionModel: env.AI_VISION_MODEL,
        // Per-day chunks only when groq LEADS the meal-plan route; as a
        // failover behind Gemini it keeps today's single call.
        mealPlanMode: routes.mealPlan[0] === 'groq' ? 'chunked' : 'single',
      }),
    };
  }

  // A single provider serves everything directly — today's behaviour for
  // "Gemini, no secondary key" and for AI_PROVIDER=openai.
  if (available.length === 1) {
    const only = providers[available[0]!]!;
    console.info(
      available[0] === 'gemini'
        ? `[AI] Using GeminiAIService (${env.GEMINI_MODEL}), no secondary configured`
        : `[AI] Using OpenAICompatibleAIService (${secondaryName()}) standalone`,
    );
    return only.service;
  }

  console.info(
    `[AI] Using GeminiAIService (${env.GEMINI_MODEL}) with ${secondaryName()} — routes: ${describeRoutes(routes)}`,
  );
  return new ChainAIService({ providers, routes });
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
  AnnotatedExtraction,
  ExtractedRecipe,
  ExtractionConfidence,
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
