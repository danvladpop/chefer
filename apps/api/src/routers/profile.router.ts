import { AiCallType, prisma } from '@chefer/database';
import { protectedProcedure, router } from '../lib/trpc.js';

/**
 * Known free-tier limits for the AI providers used by Chefer.
 * Update these if Google changes their quotas.
 * Source: https://ai.google.dev/pricing (Gemini 2.5 Flash free tier)
 */
const GEMINI_FREE_LIMITS = {
  requestsPerDay: 500,
  requestsPerMinute: 10,
} as const;

export const profileRouter = router({
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
    };
    for (const log of logs) {
      counts[log.callType]++;
    }

    // Total Gemini calls (meal plan + swap + shopping list)
    const geminiTotal =
      counts[AiCallType.MEAL_PLAN] +
      counts[AiCallType.RECIPE_SWAP] +
      counts[AiCallType.SHOPPING_LIST];

    return {
      today: counts,
      geminiTotal,
      limits: {
        gemini: GEMINI_FREE_LIMITS,
        // Pollinations is free with no enforced limits
        pollinations: { requestsPerDay: null, requestsPerMinute: null },
      },
    };
  }),
});
