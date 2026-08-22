import { TRPCError } from '@trpc/server';
import { AiCallType, prisma } from '@chefer/database';
import { PLAN_FEATURES } from '@chefer/types';
import type { UserProfile } from '@chefer/types';
import { getLimit, isPremiumUser } from './entitlements.js';

// ─── Daily usage quotas ───────────────────────────────────────────────────────
// The per-tier numbers live in the PLAN_FEATURES matrix (@chefer/types,
// launch plan PW-1) — this file only enforces them.

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
  const limit = getLimit(user, 'planGenerationsPerDay');
  if (limit === null) return;
  const used = await prisma.mealPlan.count({
    where: { userId: user.id, createdAt: { gte: startOfTodayUtc() } },
  });
  if (used >= limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: isPremiumUser(user)
        ? `You've hit today's limit of ${limit} plan generations. It resets at midnight UTC.`
        : `You've used today's ${limit} free plan generations. Upgrade for ${PLAN_FEATURES.planGenerationsPerDay.premium} per day.`,
    });
  }
}

/**
 * Throws TOO_MANY_REQUESTS when a premium user has exhausted today's AI
 * swaps (counted from AiCallLog). Free swaps draw from the curated pool at
 * zero AI cost and are not capped.
 */
export async function assertAiSwapQuota(user: UserProfile): Promise<void> {
  if (!isPremiumUser(user)) return;
  const limit = getLimit(user, 'aiMealSwaps');
  if (limit === null) return;
  const used = await prisma.aiCallLog.count({
    where: {
      userId: user.id,
      callType: AiCallType.RECIPE_SWAP,
      createdAt: { gte: startOfTodayUtc() },
    },
  });
  if (used >= limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `You've hit today's limit of ${limit} AI swaps. It resets at midnight UTC.`,
    });
  }
}
