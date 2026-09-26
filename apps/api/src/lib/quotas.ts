import { TRPCError } from '@trpc/server';
import { AiCallType, prisma } from '@chefer/database';
import { PLAN_FEATURES } from '@chefer/types';
import type { UserProfile } from '@chefer/types';
import { getLimit, isPremiumUser } from './entitlements.js';

// ─── Daily usage quotas ───────────────────────────────────────────────────────
// The per-tier numbers live in the PLAN_FEATURES matrix (@chefer/types,
// launch plan PW-1) — this file only enforces them.
//
// Every quota is a *reservation*: the usage row is counted and inserted in one
// SERIALIZABLE transaction, so parallel requests can no longer all pass the
// check before any of them logs (chat 7/5, scans 12/10, swaps 33/30 — audit
// F-PLAN-2-3, F-TRK-2-2, F-REC-4-2). Callers that should not charge a failed
// attempt call `release()`.

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface QuotaReservation {
  /** Refunds the reservation (deletes its usage row). Never throws. */
  release: () => Promise<void>;
}

const NO_RESERVATION: QuotaReservation = { release: () => Promise.resolve() };
const RESERVE_ATTEMPTS = 5;

function releaser(id: string): QuotaReservation {
  return {
    release: async () => {
      await prisma.aiCallLog.delete({ where: { id } }).catch((err: unknown) => {
        console.error('[quota] failed to release reservation', id, err);
      });
    },
  };
}

function isSerializationConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
}

/**
 * Atomically checks today's usage of `callType` against `limit` and records
 * one more. `limit === null` means unlimited (the row is still written, so
 * usage stats stay complete).
 */
async function reserve(
  userId: string,
  callType: AiCallType,
  limit: number | null,
  exceeded: () => TRPCError,
  premiumOnlyMessage = 'This is a premium feature. Upgrade to use it.',
): Promise<QuotaReservation> {
  // A limit of 0 means the tier has no access at all: answer FORBIDDEN before
  // anything is written ("You've used today's 0 free chat messages" was the
  // old copy for this case).
  if (limit === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: premiumOnlyMessage });
  }
  if (limit === null) {
    const row = await prisma.aiCallLog.create({ data: { userId, callType } });
    return releaser(row.id);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const row = await prisma.$transaction(
        async (tx) => {
          const used = await tx.aiCallLog.count({
            where: { userId, callType, createdAt: { gte: startOfTodayUtc() } },
          });
          if (used >= limit) throw exceeded();
          return tx.aiCallLog.create({ data: { userId, callType } });
        },
        { isolationLevel: 'Serializable' },
      );
      return releaser(row.id);
    } catch (err) {
      if (!isSerializationConflict(err) || attempt >= RESERVE_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 20));
    }
  }
}

/**
 * Reserves one plan generation. Counted from MEAL_PLAN usage rows written by
 * this reservation — not from meal_plans rows, which also include
 * carry-forward copies and templates (a free user was blocked after two real
 * generations — audit F-PLAN-5-1). The free curated path is capped too.
 */
export async function reservePlanGeneration(user: UserProfile): Promise<QuotaReservation> {
  const limit = getLimit(user, 'planGenerationsPerDay');
  return reserve(
    user.id,
    AiCallType.MEAL_PLAN,
    limit,
    () =>
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: isPremiumUser(user)
          ? `You've hit today's limit of ${limit} plan generations. It resets at midnight UTC.`
          : `You've used today's ${limit} free plan generations. Upgrade for ${PLAN_FEATURES.planGenerationsPerDay.premium} per day.`,
      }),
  );
}

/**
 * FORBIDDEN for tiers without photo logging (free — the camera button is
 * their upgrade touchpoint, source `snap-scan`); otherwise reserves one scan.
 * Attempts count: the reservation is not refunded on a failed read.
 */
export async function reserveMealScan(user: UserProfile): Promise<QuotaReservation> {
  const limit = getLimit(user, 'mealScansPerDay');
  if (limit === 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Photo meal scanning is a premium feature. Upgrade to scan your meals.',
    });
  }
  return reserve(
    user.id,
    AiCallType.SCAN,
    limit,
    () =>
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `You've hit today's limit of ${limit} meal scans. It resets at midnight UTC.`,
      }),
  );
}

/**
 * Reserves one recipe import. FREE has a numeric limit (1/day): the
 * extraction preview is the §6.4 ghost state. The caller refunds it when the
 * page can't be fetched or read, so a typo URL no longer burns the day's
 * preview (audit F-REC-4-2).
 */
export async function reserveRecipeImport(user: UserProfile): Promise<QuotaReservation> {
  const limit = getLimit(user, 'recipeImportsPerDay');
  return reserve(
    user.id,
    AiCallType.RECIPE_IMPORT,
    limit,
    () =>
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: isPremiumUser(user)
          ? `You've hit today's limit of ${limit} recipe imports. It resets at midnight UTC.`
          : `You've used today's recipe imports. It resets at midnight UTC.`,
      }),
    'Importing recipes is a premium feature. Upgrade to import and adapt any recipe.',
  );
}

/**
 * Reserves one AI swap for premium users. Free swaps draw from the curated
 * pool at zero AI cost and are not capped (no reservation).
 */
export async function reserveAiSwap(user: UserProfile): Promise<QuotaReservation> {
  if (!isPremiumUser(user)) return NO_RESERVATION;
  const limit = getLimit(user, 'aiMealSwaps');
  return reserve(
    user.id,
    AiCallType.RECIPE_SWAP,
    limit,
    () =>
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `You've hit today's limit of ${limit} AI swaps. It resets at midnight UTC.`,
      }),
  );
}

/** Reserves one chat message (attempts count; premium is unlimited). */
export async function reserveChatMessage(user: UserProfile): Promise<QuotaReservation> {
  const limit = getLimit(user, 'chatMessagesPerDay');
  return reserve(
    user.id,
    AiCallType.CHAT,
    limit,
    () =>
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `You've used today's ${limit} chat messages. It resets at midnight UTC.`,
      }),
    'The AI chef chat is a premium feature. Upgrade to chat with your chef.',
  );
}

/** Reserves one AI nutrition estimate (premium-only; audit F-PAN-2-4). */
export async function reserveNutritionEstimate(user: UserProfile): Promise<QuotaReservation> {
  const limit = getLimit(user, 'aiNutritionEstimatesPerDay');
  return reserve(
    user.id,
    AiCallType.INGREDIENT_PRICES,
    limit,
    () =>
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `You've hit today's limit of ${limit} AI nutrition estimates. It resets at midnight UTC.`,
      }),
    'Auto-filling nutrition with AI is a premium feature. Enter the values by hand, or upgrade.',
  );
}
