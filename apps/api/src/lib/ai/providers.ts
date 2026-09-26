import type { ReasoningEffortSetting } from './env-schema.js';
import type { ProviderRef } from './failover.js';
import { GeminiAIService } from './gemini.js';
import { MockAIService } from './mock.js';
import { OpenAICompatibleAIService } from './openai.js';
import type { AiProviderName, EvalProviderName } from './routing.js';

// ─── Provider construction (env-free) ─────────────────────────────────────────
// Builds one named provider from plain config. Shared by the app factory
// (index.ts, config from env.ts) and the eval harness (config from its own
// env parse), so both run exactly the same clients.

export interface ProviderConfig {
  geminiApiKey?: string | undefined;
  geminiModel: string;
  geminiFastModel: string;
  secondaryApiKey?: string | undefined;
  secondaryBaseUrl: string;
  secondaryModel: string;
  visionModel: string;
  /** AI_SECONDARY_REASONING_EFFORT; unset = auto. */
  reasoningEffort?: ReasoningEffortSetting | undefined;
}

/**
 * The reasoning_effort to send with the secondary's text-model calls:
 * auto → "low" for gpt-oss (a reasoning model whose default effort burns the
 * output budget), nothing for other models (non-reasoning models reject the
 * parameter); none → nothing; otherwise the explicit value.
 */
export function resolveReasoningEffort(
  setting: ReasoningEffortSetting | undefined,
  model: string,
): 'low' | 'medium' | 'high' | undefined {
  switch (setting ?? 'auto') {
    case 'auto':
      return /gpt-oss/i.test(model) ? 'low' : undefined;
    case 'none':
      return undefined;
    default:
      return setting as 'low' | 'medium' | 'high';
  }
}

/** "api.groq.com/openai/gpt-oss-120b" — the secondary's name in logs. */
export function secondaryDisplayName(config: ProviderConfig): string {
  try {
    return `${new URL(config.secondaryBaseUrl).hostname}/${config.secondaryModel}`;
  } catch {
    return config.secondaryModel;
  }
}

/** Which live providers have credentials. */
export function configuredProviders(config: ProviderConfig): AiProviderName[] {
  const names: AiProviderName[] = [];
  if (config.geminiApiKey) names.push('gemini');
  if (config.secondaryApiKey) names.push('groq');
  return names;
}

/**
 * One provider. `leadsMealPlan` = this provider is FIRST in the meal-plan
 * chain: the OpenAI-compatible client then generates plans in per-day chunks
 * (a small-context provider cannot return a whole week in one response).
 */
export function createProvider(
  name: EvalProviderName,
  config: ProviderConfig,
  options: { leadsMealPlan?: boolean } = {},
): ProviderRef {
  switch (name) {
    case 'mock':
      return { name: 'mock', service: new MockAIService() };
    case 'gemini':
      if (!config.geminiApiKey) throw new Error('gemini needs GEMINI_API_KEY');
      return {
        name: 'gemini',
        service: new GeminiAIService(config.geminiApiKey, {
          main: config.geminiModel,
          fast: config.geminiFastModel,
        }),
      };
    case 'groq':
      if (!config.secondaryApiKey) throw new Error('groq needs AI_SECONDARY_API_KEY');
      return {
        name: secondaryDisplayName(config),
        service: new OpenAICompatibleAIService({
          apiKey: config.secondaryApiKey,
          baseUrl: config.secondaryBaseUrl,
          model: config.secondaryModel,
          visionModel: config.visionModel,
          reasoningEffort: resolveReasoningEffort(config.reasoningEffort, config.secondaryModel),
          mealPlanMode: options.leadsMealPlan ? 'chunked' : 'single',
        }),
      };
  }
}
