import { z } from 'zod';
import { aiProviderEnvShape } from '../env-schema.js';
import type { ProviderConfig } from '../providers.js';

// ─── Eval harness env ─────────────────────────────────────────────────────────
// Only the AI provider keys/models (same shape and defaults as the API's
// env.ts), so `pnpm ai:eval` runs without a database or auth secrets.
// apps/api/.env is loaded when present; shell variables win over it.

const evalEnvSchema = z.object(aiProviderEnvShape);

/** A copied .env.example leaves keys as empty strings — treat them as unset. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

export function loadEvalProviderConfig(): ProviderConfig {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file — keys come from the shell, or only --provider=mock runs.
  }
  const env = evalEnvSchema.parse(process.env);
  return {
    geminiApiKey: nonEmpty(env.GEMINI_API_KEY),
    geminiModel: env.GEMINI_MODEL,
    geminiFastModel: env.GEMINI_FAST_MODEL,
    secondaryApiKey: nonEmpty(env.AI_SECONDARY_API_KEY),
    secondaryBaseUrl: env.AI_SECONDARY_BASE_URL,
    secondaryModel: env.AI_SECONDARY_MODEL,
    visionModel: env.AI_VISION_MODEL,
    reasoningEffort: env.AI_SECONDARY_REASONING_EFFORT,
    secondaryFastModel: env.AI_SECONDARY_FAST_MODEL,
    // The eval builds only the providers named in --provider, so the CF keys
    // being present is enough here (no opt-in needed, unlike the app).
    cloudflare:
      env.CF_ACCOUNT_ID && env.CF_API_TOKEN
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
}
