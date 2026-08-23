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
 * Throws FORBIDDEN for tiers without photo logging (free — the camera button
 * is their upgrade touchpoint, source `snap-scan`) and TOO_MANY_REQUESTS when
 * today's scan allowance is used up (counted from AiCallLog SCAN rows, F4).
 */
export async function assertMealScanQuota(user: UserProfile): Promise<void> {
  const limit = getLimit(user, 'mealScansPerDay');
  if (limit === 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Photo meal scanning is a premium feature. Upgrade to scan your meals.',
    });
  }
  if (limit === null) return;
  const used = await prisma.aiCallLog.count({
    where: {
      userId: user.id,
      callType: AiCallType.SCAN,
      createdAt: { gte: startOfTodayUtc() },
    },
  });
  if (used >= limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `You've hit today's limit of ${limit} meal scans. It resets at midnight UTC.`,
    });
  }
}

/**
 * Throws TOO_MANY_REQUESTS when the user has used today's recipe imports
 * (counted from AiCallLog RECIPE_IMPORT rows — attempts, not successes).
 * Unlike AI swaps, FREE has a numeric limit here (1/day): the extraction
 * preview is the §6.4 ghost state, so free users get one real preview a day
 * while the Cheferize diff + save stay premium. No early return on tier.
 */
export async function assertRecipeImportQuota(user: UserProfile): Promise<void> {
  const limit = getLimit(user, 'recipeImportsPerDay');
  if (limit === null) return;
  const used = await prisma.aiCallLog.count({
    where: {
      userId: user.id,
      callType: AiCallType.RECIPE_IMPORT,
      createdAt: { gte: startOfTodayUtc() },
    },
  });
  if (used >= limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: isPremiumUser(user)
        ? `You've hit today's limit of ${limit} recipe imports. It resets at midnight UTC.`
        : `You've used today's free import preview. Upgrade for ${PLAN_FEATURES.recipeImportsPerDay.premium} imports a day, adapted to you and saved to your collection.`,
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
