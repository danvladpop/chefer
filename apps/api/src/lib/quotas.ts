import { TRPCError } from '@trpc/server';
import { AiCallType, prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';

// ─── Daily usage quotas ───────────────────────────────────────────────────────
// The per-tier numbers are paywall surface (launch plan §2). PW-1 will fold
// them into the PLAN_FEATURES matrix; until then this file is their single
// source of truth.

export const DAILY_PLAN_GENERATIONS = { FREE: 3, PREMIUM: 20 } as const;
export const DAILY_AI_SWAPS_PREMIUM = 30;

function isPremium(user: UserProfile): boolean {
  return user.planTier === 'PREMIUM' || user.role === 'ADMIN';
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Throws TOO_MANY_REQUESTS when the user has already generated today's
 * allowance of plans (counted from meal_plans rows, so the free curated
 * path — which never calls the AI — is capped too).
 */
export async function assertPlanGenerationQuota(user: UserProfile): Promise<void> {
  const limit = isPremium(user) ? DAILY_PLAN_GENERATIONS.PREMIUM : DAILY_PLAN_GENERATIONS.FREE;
  const used = await prisma.mealPlan.count({
    where: { userId: user.id, createdAt: { gte: startOfTodayUtc() } },
  });
  if (used >= limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: isPremium(user)
        ? `You've hit today's limit of ${limit} plan generations. It resets at midnight UTC.`
        : `You've used today's ${limit} free plan generations. Upgrade for ${DAILY_PLAN_GENERATIONS.PREMIUM} per day.`,
    });
  }
}

/**
 * Throws TOO_MANY_REQUESTS when a premium user has exhausted today's AI
 * swaps (counted from AiCallLog). Free swaps draw from the curated pool at
 * zero AI cost and are not capped.
 */
export async function assertAiSwapQuota(user: UserProfile): Promise<void> {
  if (!isPremium(user)) return;
  const used = await prisma.aiCallLog.count({
    where: {
      userId: user.id,
      callType: AiCallType.RECIPE_SWAP,
      createdAt: { gte: startOfTodayUtc() },
    },
  });
  if (used >= DAILY_AI_SWAPS_PREMIUM) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `You've hit today's limit of ${DAILY_AI_SWAPS_PREMIUM} AI swaps. It resets at midnight UTC.`,
    });
  }
}
