import { AiCallType, prisma } from '@chefer/database';
import { AI_PROVIDERS } from '@chefer/types';
import { aiProviderDisclosure } from '../lib/ai/index.js';
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
   * Returns today's AI usage counts per call type for the current user,
   * alongside the known free-tier limits for each provider.
   */
  getAiUsage: protectedProcedure.query(async ({ ctx }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const logs = await prisma.aiCallLog.findMany({
      where: { userId: ctx.user.id, createdAt: { gte: todayStart } },
      select: { callType: true },
    });

    const counts = {
      [AiCallType.MEAL_PLAN]: 0,
      [AiCallType.RECIPE_SWAP]: 0,
      [AiCallType.SHOPPING_LIST]: 0,
      [AiCallType.IMAGE_GENERATION]: 0,
      [AiCallType.INGREDIENT_PRICES]: 0,
      [AiCallType.CHAT]: 0,
      [AiCallType.SCAN]: 0,
      [AiCallType.RECIPE_IMPORT]: 0,
    };
    for (const log of logs) {
      counts[log.callType]++;
    }

    // Total AI calls (meal plan + swap + shopping list + chat + vision). The
    // field keeps its old name for shipped clients; it counts whatever
    // provider serves them (primaryProvider).
    const geminiTotal =
      counts[AiCallType.MEAL_PLAN] +
      counts[AiCallType.RECIPE_SWAP] +
      counts[AiCallType.SHOPPING_LIST] +
      counts[AiCallType.CHAT] +
      counts[AiCallType.SCAN] +
      counts[AiCallType.RECIPE_IMPORT];

    const primary = aiProviderDisclosure.primary;
    return {
      today: counts,
      geminiTotal,
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
