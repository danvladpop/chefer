import {
  FREE_ONLY_AI_PROVIDER_DISCLOSURE,
  LEGACY_AI_PROVIDER_DISCLOSURE,
  type AiProviderDisclosure,
  type AiProviderId,
} from '@chefer/types';
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
  DEFAULT_AI_ROUTES,
  describeRoutes,
  FREE_ONLY_AI_ROUTES,
  parseChain,
  parseShadowRoutes,
  providersInRoutes,
  resolveRoutes,
  type AiProviderName,
  type AiRouteTable,
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
//   is Gemini-first (video links are read as text — lib/video-import). With a single provider (no secondary key, or
//   AI_PROVIDER=openai) that provider serves everything directly, as before.
//   AI_SHADOW_ROUTE / AI_SHADOW_SAMPLE add background shadow replays
//   (shadow.ts); unset or 0 = off.
//   cloudflare — Workers AI's OpenAI-compatible endpoint (CF_TEXT_MODEL /
//     CF_VISION_MODEL, neuron budget CF_TEXT_NEURON_BUDGET). Only built when
//     AI_FREE_ONLY=true or a route/shadow setting names it.
//   AI_FREE_ONLY=true: Gemini is never built; every workload defaults to
//     groq>cloudflare (routing.ts FREE_ONLY_AI_ROUTES). env.ts refuses to
//     start if a route still names gemini.
//
// To add a new provider: create <provider>.ts implementing IAIService, add
// its name to routing.ts AI_PROVIDER_NAMES, build it in providers.ts, add its
// key to env.ts. Nothing else changes.

/** Whether any AI_ROUTE_* / AI_SHADOW_ROUTE value names `cloudflare`. */
function routesMentionCloudflare(): boolean {
  const values = [...AI_WORKLOADS.map((w) => env[AI_ROUTE_ENV_KEYS[w]]), env.AI_SHADOW_ROUTE];
  return values.some((v) => v !== undefined && /cloudflare/i.test(v));
}

const providerConfig: ProviderConfig = {
  // AI_PROVIDER=openai means "no Gemini", even if a Gemini key is present;
  // so does free-only mode.
  geminiApiKey: env.AI_PROVIDER === 'gemini' && !env.AI_FREE_ONLY ? env.GEMINI_API_KEY : undefined,
  geminiModel: env.GEMINI_MODEL,
  geminiFastModel: env.GEMINI_FAST_MODEL,
  secondaryApiKey: env.AI_SECONDARY_API_KEY,
  secondaryBaseUrl: env.AI_SECONDARY_BASE_URL,
  secondaryModel: env.AI_SECONDARY_MODEL,
  visionModel: env.AI_VISION_MODEL,
  reasoningEffort: env.AI_SECONDARY_REASONING_EFFORT,
  secondaryFastModel: env.AI_SECONDARY_FAST_MODEL,
  // Workers AI text only when asked for: the CF keys alone (recipe images)
  // must not change today's routing.
  cloudflare:
    env.CF_ACCOUNT_ID && env.CF_API_TOKEN && (env.AI_FREE_ONLY || routesMentionCloudflare())
      ? {
          accountId: env.CF_ACCOUNT_ID,
          apiToken: env.CF_API_TOKEN,
          textModel: env.CF_TEXT_MODEL,
          visionModel: env.CF_VISION_MODEL,
          fastModel: env.CF_FAST_MODEL,
          textNeuronBudget: env.CF_TEXT_NEURON_BUDGET,
        }
      : undefined,
};

const defaultRoutes = env.AI_FREE_ONLY ? FREE_ONLY_AI_ROUTES : DEFAULT_AI_ROUTES;

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
  const routes = resolveRoutes(
    routeOverrides(),
    available,
    (msg) => console.warn(`[AI] ${msg}`),
    defaultRoutes,
  );
  activeRoutes = routes;
  if (env.AI_FREE_ONLY) {
    console.info(
      `[AI] free-only mode: ${available.join(', ')} (Cloudflare text budget ${env.CF_TEXT_NEURON_BUDGET} neurons/day)`,
    );
  }
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

/** The live route table (null in mock mode), for the provider disclosure. */
let activeRoutes: AiRouteTable | null = null;

export const aiService: IAIService = createAIService();

/**
 * Who receives user data, for the consent sheet, profile toggle and privacy
 * page (profile.aiProviders). Derived from the live route table, so the copy
 * follows the config and cannot go stale: the provider leading the most
 * workloads is `primary`, every other routed provider (and shadow candidates)
 * a backup. Mock mode reports the mode's usual set.
 */
function computeDisclosure(): AiProviderDisclosure {
  const fallback = env.AI_FREE_ONLY
    ? FREE_ONLY_AI_PROVIDER_DISCLOSURE
    : LEGACY_AI_PROVIDER_DISCLOSURE;
  if (!activeRoutes) return fallback;
  const lead = new Map<AiProviderId, number>();
  for (const w of AI_WORKLOADS) {
    const first = activeRoutes[w][0];
    if (first) lead.set(first, (lead.get(first) ?? 0) + 1);
  }
  const top = [...lead].sort((a, b) => b[1] - a[1])[0];
  if (!top) return fallback;
  const primary = top[0];
  const shadow = env.AI_SHADOW_ROUTE && env.AI_SHADOW_SAMPLE > 0 ? env.AI_SHADOW_ROUTE : '';
  const all = [
    ...providersInRoutes(activeRoutes),
    ...AI_PROVIDER_NAMES.filter((p) => shadow.includes(p)),
  ] as AiProviderId[];
  return { primary, backups: [...new Set(all)].filter((p) => p !== primary) };
}

export const aiProviderDisclosure: AiProviderDisclosure = computeDisclosure();

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
