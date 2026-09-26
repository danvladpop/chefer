import { z } from 'zod';

/** AI_SECONDARY_REASONING_EFFORT values (see resolveReasoningEffort in providers.ts). */
export const REASONING_EFFORT_SETTINGS = ['auto', 'none', 'low', 'medium', 'high'] as const;
export type ReasoningEffortSetting = (typeof REASONING_EFFORT_SETTINGS)[number];

// ─── AI provider env shape ────────────────────────────────────────────────────
// Keys and model names for the live providers. Spread into the API's env
// schema (lib/env.ts) and parsed on its own by the eval harness (lib/ai/eval),
// which must run without the API's database/auth env. One source of defaults.

/** "true"/"false" env flag; empty or unset = false. */
const envFlag = z.preprocess(
  (val) => (val === '' || val === undefined ? 'false' : val),
  z.enum(['true', 'false']).transform((v) => v === 'true'),
);

/** Optional string where an empty value (a copied .env.example line) counts as unset. */
const optionalString = z.preprocess((val) => (val === '' ? undefined : val), z.string().optional());

export const aiProviderEnvShape = {
  // Free-only mode (owner decision 2026-09-26): every workload runs
  // groq>cloudflare (routing.ts FREE_ONLY_AI_ROUTES), Gemini is never built,
  // GEMINI_API_KEY is not required and any AI_ROUTE_*/AI_SHADOW_ROUTE naming
  // gemini refuses to start. Unset = today's routing, unchanged.
  AI_FREE_ONLY: envFlag,
  GEMINI_API_KEY: z.string().optional(),
  // Model names are config, not code (audit P0-5 groundwork): swapping to a
  // newer or paid-tier model is an env change and a restart.
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_FAST_MODEL: z.string().default('gemini-2.5-flash-lite'),
  // Secondary OpenAI-compatible provider (premium_plan.md §5.5 W3-A).
  // When AI_SECONDARY_API_KEY is set (and AI_PROVIDER=gemini), the factory
  // wraps Gemini in a failover to this endpoint; unset = no failover (the
  // deploy runs "dark" until the key lands). AI_PROVIDER=openai uses this
  // client standalone. Defaults target Groq's free tier.
  AI_SECONDARY_API_KEY: z.string().optional(),
  AI_SECONDARY_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  AI_SECONDARY_MODEL: z.string().default('openai/gpt-oss-120b'),
  // Vision model at the same OpenAI-compatible endpoint, used only when a
  // photo call is routed there (AI_ROUTE_VISION). Groq's vision model:
  // https://console.groq.com/docs/vision (checked 2026-09-26).
  AI_VISION_MODEL: z.string().default('qwen/qwen3.8-27b'),
  // reasoning_effort for the secondary's TEXT model. auto = "low" for gpt-oss
  // models, not sent otherwise; none = never sent. At the default ("medium")
  // effort gpt-oss-120b spent ~5.6k hidden reasoning tokens on ONE meal-plan
  // day and ran out of output budget (docs/ai-providers.md "Groq limits").
  AI_SECONDARY_REASONING_EFFORT: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(REASONING_EFFORT_SETTINGS).default('auto'),
  ),
  // Optional cheaper model at the secondary endpoint for the simple JSON
  // workloads (ingredient prices, shopping-list tidy-up, weekly review prose —
  // FAST_MODEL_OPS in openai.ts), e.g. openai/gpt-oss-20b. Unset = off (every
  // call uses AI_SECONDARY_MODEL). See docs/ai-providers.md "Free-only mode".
  AI_SECONDARY_FAST_MODEL: optionalString,

  // Cloudflare Workers AI. The same account/token also serve recipe images
  // (IMAGE_PROVIDER=cloudflare). As a TEXT provider it is used only when a
  // route names `cloudflare` or AI_FREE_ONLY=true — having the keys for images
  // alone changes no text routing.
  CF_ACCOUNT_ID: optionalString,
  CF_API_TOKEN: optionalString,
  // https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/ (checked 2026-09-26).
  CF_TEXT_MODEL: z.string().default('@cf/openai/gpt-oss-120b'),
  // Photos on Workers AI. Gemma 4 (Apache 2.0) — not Llama 3.2/4 Vision,
  // whose licence withholds the multimodal models from EU-based developers.
  // https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
  CF_VISION_MODEL: z.string().default('@cf/google/gemma-4-26b-a4b-it'),
  // Cheaper Workers AI model for the FAST_MODEL_OPS workloads, e.g.
  // @cf/openai/gpt-oss-20b (~half the neurons). Unset = off.
  CF_FAST_MODEL: optionalString,
  // Text stops going to Workers AI once today's neurons (text + images, per
  // UTC day, in memory) reach this; images keep the rest of the free 10,000.
  CF_TEXT_NEURON_BUDGET: z.coerce.number().int().min(0).max(10_000).default(8_000),
};
