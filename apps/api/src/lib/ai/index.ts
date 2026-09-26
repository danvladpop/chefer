import { env } from '../env.js';
import { hasAiDataConsent } from './consent.js';
import { ChainAIService, type ProviderRef } from './failover.js';
import { MockAIService } from './mock.js';
import {
  configuredProviders,
  createProvider,
  secondaryDisplayName,
  type ProviderConfig,
} from './providers.js';
import {
  AI_PROVIDER_NAMES,
  AI_ROUTE_ENV_KEYS,
  AI_WORKLOADS,
  describeRoutes,
  parseChain,
  parseShadowRoutes,
  resolveRoutes,
  type AiProviderName,
  type AiWorkload,
} from './routing.js';
import { ShadowRunner } from './shadow.js';
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
//   AI_SHADOW_ROUTE / AI_SHADOW_SAMPLE add background shadow replays
//   (shadow.ts); unset or 0 = off.
//
// To add a new provider: create <provider>.ts implementing IAIService, add
// its name to routing.ts AI_PROVIDER_NAMES, build it in providers.ts, add its
// key to env.ts. Nothing else changes.

const providerConfig: ProviderConfig = {
  // AI_PROVIDER=openai means "no Gemini", even if a Gemini key is present.
  geminiApiKey: env.AI_PROVIDER === 'gemini' ? env.GEMINI_API_KEY : undefined,
  geminiModel: env.GEMINI_MODEL,
  geminiFastModel: env.GEMINI_FAST_MODEL,
  secondaryApiKey: env.AI_SECONDARY_API_KEY,
  secondaryBaseUrl: env.AI_SECONDARY_BASE_URL,
  secondaryModel: env.AI_SECONDARY_MODEL,
  visionModel: env.AI_VISION_MODEL,
  reasoningEffort: env.AI_SECONDARY_REASONING_EFFORT,
};

/** AI_ROUTE_* values that are set, parsed (env.ts already validated them). */
function routeOverrides(): Partial<Record<AiWorkload, AiProviderName[]>> {
  const overrides: Partial<Record<AiWorkload, AiProviderName[]>> = {};
  for (const workload of AI_WORKLOADS) {
    const value = env[AI_ROUTE_ENV_KEYS[workload]];
    if (value) overrides[workload] = parseChain(value, AI_PROVIDER_NAMES);
  }
  return overrides;
}

/** Shadow candidates from AI_SHADOW_ROUTE, or null when shadow mode is off. */
function createShadow(available: AiProviderName[]): ShadowRunner | null {
  if (!env.AI_SHADOW_ROUTE || env.AI_SHADOW_SAMPLE <= 0) return null;
  const candidates = new Map<AiWorkload, { chain: string; service: IAIService }>();
  for (const [workload, chain] of parseShadowRoutes(env.AI_SHADOW_ROUTE)) {
    const usable = chain.filter((p) => available.includes(p));
    if (usable.length === 0) {
      console.warn(`[AI] shadow ${workload}:${chain.join('>')} — no configured provider, skipped`);
      continue;
    }
    // The candidate is its own chain (no shadow of its own), with the chunked
    // plan when groq leads it — exactly what a real flip would run.
    const providers = Object.fromEntries(
      usable.map((p) => [
        p,
        createProvider(p, providerConfig, {
          leadsMealPlan: workload === 'mealPlan' && usable[0] === p,
        }),
      ]),
    );
    const routes = {} as Record<AiWorkload, AiProviderName[]>;
    for (const w of AI_WORKLOADS) routes[w] = usable;
    candidates.set(workload, {
      chain: usable.join('>'),
      service: new ChainAIService({ providers, routes }),
    });
  }
  if (candidates.size === 0) return null;
  console.info(
    `[AI] shadow mode: ${[...candidates].map(([w, c]) => `${w}:${c.chain}`).join(', ')} at ${
      env.AI_SHADOW_SAMPLE * 100
    }% of premium, consented user calls`,
  );
  return new ShadowRunner({
    candidates,
    sample: env.AI_SHADOW_SAMPLE,
    hasConsent: hasAiDataConsent,
  });
}

function createAIService(): IAIService {
  if (env.AI_MOCK_ENABLED) {
    console.info('[AI] Using MockAIService (fixture data)');
    return new MockAIService();
  }

  const available = configuredProviders(providerConfig);
  const routes = resolveRoutes(routeOverrides(), available, (msg) => console.warn(`[AI] ${msg}`));
  const providers: Record<string, ProviderRef> = Object.fromEntries(
    available.map((p) => [
      p,
      // Per-day plan chunks only when groq LEADS the meal-plan route; as a
      // failover behind Gemini it keeps today's single call.
      createProvider(p, providerConfig, { leadsMealPlan: routes.mealPlan[0] === p }),
    ]),
  );
  const shadow = createShadow(available);

  // A single provider serves everything directly — today's behaviour for
  // "Gemini, no secondary key" and for AI_PROVIDER=openai.
  if (available.length === 1 && !shadow) {
    const only = available[0]!;
    console.info(
      only === 'gemini'
        ? `[AI] Using GeminiAIService (${env.GEMINI_MODEL}), no secondary configured`
        : `[AI] Using OpenAICompatibleAIService (${secondaryDisplayName(providerConfig)}) standalone`,
    );
    return providers[only]!.service;
  }

  console.info(`[AI] Provider chains: ${describeRoutes(routes)}`);
  return new ChainAIService({ providers, routes, shadow: shadow ?? undefined });
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
