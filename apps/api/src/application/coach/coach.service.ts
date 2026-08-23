import {
  chefProfileRepository,
  chefReviewRepository,
  mealPlanRepository,
  prisma,
  weightEntryRepository,
  type ChefReview,
  type IChefProfileRepository,
  type IChefReviewRepository,
  type IWeightEntryRepository,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { hasFeature } from '../../lib/entitlements.js';
import { pantryService } from '../pantry/pantry.service.js';
import { computeBmrTdee, resolveDailyTargets } from '../preferences/preferences.service.js';
import { generateReviewText } from './review-text.js';
import {
  buildTemplateReviewText,
  computeReviewMetrics,
  decideAdjustmentKcal,
  type ReviewDayLog,
} from './review.service.js';

// ─── The Adaptive Chef (F1, premium_plan.md W1-A) ─────────────────────────────
// Every Sunday (WeeklyPlanWorker tick, BEFORE plan generation) the coach
// reviews the week: adherence, calorie balance, weight trend — then nudges the
// cumulative calorie dial (ChefProfile.targetAdjustmentKcal) that
// resolveDailyTargets folds into every target consumer, including next week's
// generation budget. One ChefReview row per user-week, written idempotently.
//
// Free users with enough logged days get a REAL review too — it feeds the
// §6.4 blurred-teaser ghost state; only PREMIUM (adaptiveCoaching) accounts
// receive the full text and the target adjustments.

/** Minimum logged days in the reviewed week before the coach writes anything. */
export const MIN_LOGGED_DAYS = 3;

/** A review is surfaced for two weeks: the reviewed week's Monday + 14 days. */
const REVIEW_FRESH_DAYS = 14;

/** Weigh-in window feeding the EWMA trend (~4 weeks). */
const TREND_WINDOW_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of the Monday of the week containing `now` (ChefReview key). */
export function weekStartUtc(now: Date = new Date()): Date {
  const utcDay = now.getUTCDay(); // 0=Sun … 6=Sat
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday),
  );
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface ChefReviewDto {
  weekStart: Date;
  adherencePct: number;
  avgDailyKcal: number;
  weightTrendKg: number | null;
  adjustmentKcal: number;
  savedEur: number | null;
  reviewText: string;
  createdAt: Date;
}

/**
 * Tier-shaped review payload. The teaser carries ONLY the first line — the
 * full text must never reach a free client (blur is presentation, this is
 * the actual gate).
 */
export type CurrentReviewDto =
  | { status: 'none'; loggedDaysThisWeek: number; daysNeeded: number }
  | { status: 'teaser'; weekStart: Date; firstLine: string; lockedLineCount: number }
  | { status: 'full'; review: ChefReviewDto };

// ─── Service ──────────────────────────────────────────────────────────────────

export class CoachService {
  constructor(
    private readonly reviewRepo: IChefReviewRepository = chefReviewRepository,
    private readonly profileRepo: IChefProfileRepository = chefProfileRepository,
    private readonly weightRepo: IWeightEntryRepository = weightEntryRepository,
  ) {}

  /**
   * Writes (idempotently) the review for the week containing `now`. Returns
   * the existing row unchanged on a re-run, and null when the user hasn't
   * logged enough days for a credible review.
   *
   * `applyAdjustment` is the premium switch: free-tier reviews are teaser
   * material only — their calorie dial never moves.
   */
  async runWeeklyReview(
    userId: string,
    now: Date = new Date(),
    applyAdjustment = true,
  ): Promise<ChefReview | null> {
    const weekStart = weekStartUtc(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

    // Idempotency from the data (@@unique(userId, weekStart)), like the plan
    // worker: a second Sunday tick is a no-op.
    const existing = await this.reviewRepo.findByUserAndWeek(userId, weekStart);
    if (existing) return existing;

    const logs = await prisma.dailyLog.findMany({
      where: { userId, date: { gte: weekStart, lt: weekEnd } },
      orderBy: { date: 'asc' },
    });
    const weekLogs: ReviewDayLog[] = logs.map((l) => ({
      date: l.date,
      totalKcal: l.totalKcal,
      mealCount: Array.isArray(l.loggedMeals) ? l.loggedMeals.length : 0,
    }));
    const loggedDays = weekLogs.filter((l) => l.mealCount > 0).length;
    if (loggedDays < MIN_LOGGED_DAYS) return null;

    const [profile, weights, prevReview] = await Promise.all([
      this.profileRepo.findByUserId(userId),
      this.weightRepo.findLastN(userId, TREND_WINDOW_DAYS),
      this.reviewRepo.findPreviousBefore(userId, weekStart),
    ]);

    const targets = resolveDailyTargets(profile);
    const metrics = computeReviewMetrics(weekLogs, weights);

    const bmrTdee =
      profile?.weightKg && profile.heightCm && profile.age && profile.activityLevel
        ? computeBmrTdee(
            profile.weightKg,
            profile.heightCm,
            profile.age,
            profile.activityLevel,
            profile.biologicalSex,
          )
        : null;

    const adjustmentKcal = applyAdjustment
      ? decideAdjustmentKcal({
          goal: profile?.goal ?? null,
          adherencePct: metrics.adherencePct,
          trendKgPerWeek: metrics.weightTrendKg,
          prevTrendKgPerWeek: prevReview?.weightTrendKg ?? null,
          currentTargetKcal: targets.dailyCalorieTarget,
          bmr: bmrTdee?.bmr ?? null,
          tdee: bmrTdee?.tdee ?? null,
        })
      : 0;

    const textInput = {
      adherencePct: metrics.adherencePct,
      loggedDays,
      avgDailyKcal: metrics.avgDailyKcal,
      targetKcal: targets.dailyCalorieTarget,
      weightTrendKg: metrics.weightTrendKg,
      adjustmentKcal,
      goal: profile?.goal ?? null,
      dishNames: await this.loadWeekDishNames(userId),
    };
    let reviewText: string;
    try {
      reviewText = await generateReviewText(textInput);
    } catch {
      reviewText = buildTemplateReviewText(textInput);
    }

    // Move the cumulative dial BEFORE writing the review row: if the profile
    // write fails, the retry (next tick) recomputes — the review row is the
    // idempotency marker, so it must come last.
    if (adjustmentKcal !== 0) {
      await this.profileRepo.upsert(userId, {
        targetAdjustmentKcal: (profile?.targetAdjustmentKcal ?? 0) + adjustmentKcal,
      });
    }

    return this.reviewRepo.upsert({
      userId,
      weekStart,
      adherencePct: metrics.adherencePct,
      avgDailyKcal: metrics.avgDailyKcal,
      weightTrendKg: metrics.weightTrendKg,
      adjustmentKcal,
      // F3: what the pantry saved this week (null = no plan that week; a
      // pantry failure must never block the review write).
      savedEur: await pantryService.computeWeekPantrySavings(userId, weekStart).catch((err) => {
        console.error('[coach] computeWeekPantrySavings failed:', err);
        return null;
      }),
      reviewText,
    });
  }

  /**
   * Sunday sweep (called by WeeklyPlanWorker BEFORE plan generation): writes
   * this week's review for every user who logged ≥3 days. Premium
   * (adaptiveCoaching) users get adjustments applied; free users get
   * teaser-only reviews. One user's failure never starves the rest.
   */
  async runReviewSweep(now: Date = new Date()): Promise<{ reviewed: number }> {
    const weekStart = weekStartUtc(now);

    const candidates = await prisma.dailyLog.groupBy({
      by: ['userId'],
      where: { date: { gte: weekStart } },
      _count: { userId: true },
      having: { userId: { _count: { gte: MIN_LOGGED_DAYS } } },
    });
    if (candidates.length === 0) return { reviewed: 0 };

    const users = await prisma.user.findMany({
      where: { id: { in: candidates.map((c) => c.userId) } },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        role: true,
        planTier: true,
        image: true,
      },
    });

    let reviewed = 0;
    for (const user of users) {
      try {
        // Skip users already reviewed this week so `reviewed` counts real work.
        const existing = await this.reviewRepo.findByUserAndWeek(user.id, weekStart);
        if (existing) continue;
        const premium = hasFeature(user, 'adaptiveCoaching');
        const row = await this.runWeeklyReview(user.id, now, premium);
        if (row) reviewed += 1;
      } catch (err) {
        console.error(`[coach] review failed for user ${user.id}:`, err);
      }
    }
    return { reviewed };
  }

  /**
   * The banner/card payload: the latest review while it is fresh (≤14 days
   * after its week started), shaped by tier — full for adaptiveCoaching,
   * first-line teaser otherwise.
   */
  async getCurrentReview(user: UserProfile, now: Date = new Date()): Promise<CurrentReviewDto> {
    const latest = await this.reviewRepo.findLatest(user.id);

    if (!latest || now.getTime() - latest.weekStart.getTime() > REVIEW_FRESH_DAYS * DAY_MS) {
      const loggedDaysThisWeek = await prisma.dailyLog.count({
        where: { userId: user.id, date: { gte: weekStartUtc(now) } },
      });
      return {
        status: 'none',
        loggedDaysThisWeek,
        daysNeeded: Math.max(0, MIN_LOGGED_DAYS - loggedDaysThisWeek),
      };
    }

    if (!hasFeature(user, 'adaptiveCoaching')) {
      const lines = latest.reviewText.split('\n').filter((l) => l.trim().length > 0);
      return {
        status: 'teaser',
        weekStart: latest.weekStart,
        firstLine: lines[0] ?? '',
        lockedLineCount: Math.max(1, lines.length - 1),
      };
    }

    return {
      status: 'full',
      review: {
        weekStart: latest.weekStart,
        adherencePct: latest.adherencePct,
        avgDailyKcal: latest.avgDailyKcal,
        weightTrendKg: latest.weightTrendKg,
        adjustmentKcal: latest.adjustmentKcal,
        savedEur: latest.savedEur,
        reviewText: latest.reviewText,
        createdAt: latest.createdAt,
      },
    };
  }

  /** Dish names on the user's active plan — flavour for the review prose. */
  private async loadWeekDishNames(userId: string): Promise<string[]> {
    try {
      const plan = await mealPlanRepository.findActiveWithDays(userId);
      if (!plan) return [];
      const slots = plan.days.flatMap((d) => d.meals as { type: string; recipeId: string }[]);
      const ids = [...new Set(slots.map((s) => s.recipeId))].slice(0, 10);
      const recipes = await mealPlanRepository.findRecipesByIds(ids);
      return recipes.map((r) => r.name);
    } catch {
      return []; // prose flavour only — never fail the review over it
    }
  }
}

export const coachService = new CoachService();
