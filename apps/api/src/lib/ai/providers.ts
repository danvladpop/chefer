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
          mealPlanMode: options.leadsMealPlan ? 'chunked' : 'single',
        }),
      };
  }
}
