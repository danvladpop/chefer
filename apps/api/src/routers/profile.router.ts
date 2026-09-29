import { AI_PROVIDERS } from '@chefer/types';
import { getTodayAiUsage } from '../application/profile/ai-usage.service.js';
import { aiProviderDisclosure } from '../lib/ai/index.js';
import { allFlags } from '../lib/flags.js';
import { protectedProcedure, publicProcedure, router } from '../lib/trpc.js';

/**
 * Known free-tier limits for the AI providers used by Chefer.
 * Update these if Google changes their quotas.
 * Source: https://ai.google.dev/pricing (Gemini 2.5 Flash free tier)
 */
const GEMINI_FREE_LIMITS = {
  requestsPerDay: 500,
  requestsPerMinute: 10,
} as const;

/**
 * Groq free tier, per model (https://console.groq.com/docs/rate-limits,
 * checked 2026-09-26: 30 RPM, 1K RPD for openai/gpt-oss-120b).
 */
const GROQ_FREE_LIMITS = {
  requestsPerDay: 1_000,
  requestsPerMinute: 30,
} as const;

export const profileRouter = router({
  /**
   * Which AI providers receive user data right now (the consent sheet,
   * profile toggle and privacy page name them). Public: the privacy page is
   * read signed out. Derived from the live routing (lib/ai/index.ts).
   */
  aiProviders: publicProcedure.query(() => aiProviderDisclosure),

  /**
   * Feature flags (§2.9, T-00.8). Public — read before sign-in matters for
   * some (e.g. a landing-page pitch) and there's nothing sensitive in a
   * flag name. Cached by clients like `profile.aiProviders`. A failed or
   * absent response means "treat every flag as off" — old APIs and old
   * clients behave exactly as today.
   */
  flags: publicProcedure.query(() => allFlags()),

  /**
   * Returns today's AI usage counts per call type for the current user,
   * alongside the known free-tier limits for each provider.
   *
   * T-10.8 (bug B-49): the counters mirror what `lib/quotas.ts` reserves —
   * see `application/profile/ai-usage.service.ts`. `aiMealPlans`,
   * `curatedPlans` and `importsSaved` are additive; `today` and `geminiTotal`
   * keep their shape for shipped clients.
   */
  getAiUsage: protectedProcedure.query(async ({ ctx }) => {
    const {
      today: counts,
      geminiTotal,
      aiMealPlans,
      curatedPlans,
      importsSaved,
    } = await getTodayAiUsage(ctx.user.id);

    const primary = aiProviderDisclosure.primary;
    return {
      today: counts,
      geminiTotal,
      aiMealPlans,
      curatedPlans,
      importsSaved,
      /** The provider serving most workloads (admin telemetry card). */
      primaryProvider: {
        id: primary,
        name: AI_PROVIDERS[primary].name,
        ...(primary === 'gemini'
          ? GEMINI_FREE_LIMITS
          : primary === 'groq'
            ? GROQ_FREE_LIMITS
            : { requestsPerDay: null, requestsPerMinute: null }),
      },
      limits: {
        gemini: GEMINI_FREE_LIMITS,
        // Pollinations is free with no enforced limits
        pollinations: { requestsPerDay: null, requestsPerMinute: null },
      },
    };
  }),
});
