import { cloudflareNeuronLedger } from './cloudflare-budget.js';
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
  /** AI_SECONDARY_FAST_MODEL: the simple JSON workloads at the secondary; unset = off. */
  secondaryFastModel?: string | undefined;
  /**
   * Workers AI as a text provider. Set only when it may be used (a route
   * names `cloudflare`, or AI_FREE_ONLY) — the image keys alone never enable it.
   */
  cloudflare?: CloudflareTextConfig | undefined;
}

export interface CloudflareTextConfig {
  accountId: string;
  apiToken: string;
  /** CF_TEXT_MODEL, e.g. @cf/openai/gpt-oss-120b */
  textModel: string;
  /** CF_VISION_MODEL, e.g. @cf/google/gemma-4-26b-a4b-it */
  visionModel: string;
  /** CF_FAST_MODEL; unset = off. */
  fastModel?: string | undefined;
  /** CF_TEXT_NEURON_BUDGET — text stops once today's neurons reach it. */
  textNeuronBudget: number;
}

/** Workers AI's OpenAI-compatible base URL (…/chat/completions is appended). */
export function cloudflareBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1`;
}

/**
 * Extra request fields for a Workers AI vision model. Gemma 4 thinks by
 * default (chat_template_kwargs.enable_thinking, per its input schema); a
 * nutrition read of one photo does not need it and it costs neurons.
 */
export function cloudflareVisionExtras(model: string): Record<string, unknown> | undefined {
  return /gemma-4/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : undefined;
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
  if (config.cloudflare) names.push('cloudflare');
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
          fastModel: config.secondaryFastModel,
          fastReasoningEffort: config.secondaryFastModel
            ? resolveReasoningEffort(config.reasoningEffort, config.secondaryFastModel)
            : undefined,
          mealPlanMode: options.leadsMealPlan ? 'chunked' : 'single',
        }),
      };
    case 'cloudflare': {
      const cf = config.cloudflare;
      if (!cf) throw new Error('cloudflare needs CF_ACCOUNT_ID and CF_API_TOKEN');
      return {
        name: `workers-ai/${cf.textModel}`,
        service: new OpenAICompatibleAIService({
          apiKey: cf.apiToken,
          baseUrl: cloudflareBaseUrl(cf.accountId),
          model: cf.textModel,
          visionModel: cf.visionModel,
          visionExtras: cloudflareVisionExtras(cf.visionModel),
          // Workers AI honours reasoning_effort on gpt-oss (measured
          // 2026-09-26: 57 vs 186 completion tokens for the same answer).
          reasoningEffort: resolveReasoningEffort(config.reasoningEffort, cf.textModel),
          fastModel: cf.fastModel,
          fastReasoningEffort: cf.fastModel
            ? resolveReasoningEffort(config.reasoningEffort, cf.fastModel)
            : undefined,
          // No per-minute token cap and a 128K context: the per-day strict
          // schema chunks are the most reliable plan shape wherever it sits in
          // the chain (a single 7-day call would outgrow its output budget).
          mealPlanMode: 'chunked',
          neuronBudget: { ledger: cloudflareNeuronLedger, textLimit: cf.textNeuronBudget },
          providerLabel: 'cloudflare',
        }),
      };
    }
  }
}
