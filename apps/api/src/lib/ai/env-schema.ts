import { z } from 'zod';

/** AI_SECONDARY_REASONING_EFFORT values (see resolveReasoningEffort in providers.ts). */
export const REASONING_EFFORT_SETTINGS = ['auto', 'none', 'low', 'medium', 'high'] as const;
export type ReasoningEffortSetting = (typeof REASONING_EFFORT_SETTINGS)[number];

// ─── AI provider env shape ────────────────────────────────────────────────────
// Keys and model names for the live providers. Spread into the API's env
// schema (lib/env.ts) and parsed on its own by the eval harness (lib/ai/eval),
// which must run without the API's database/auth env. One source of defaults.

export const aiProviderEnvShape = {
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
};
