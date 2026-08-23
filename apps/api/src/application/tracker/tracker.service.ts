import { TRPCError } from '@trpc/server';
import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  weightEntryRepository,
} from '@chefer/database';
import type { DailyLog, LoggedMealEntry } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { hasFeature } from '../../lib/entitlements.js';
import { rebalanceWeek, type RebalanceResult } from '../meal-plan/rebalance.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';

export type { LoggedMealEntry };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayPlanMeal {
  recipeId: string;
  mealType: string;
  recipeName: string;
  imageUrl: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayTrackerData {
  date: string; // YYYY-MM-DD
  plannedMeals: DayPlanMeal[];
  log: {
    loggedMeals: LoggedMealEntry[];
    totalKcal: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
  } | null;
  targets: {
    dailyCalorieTarget: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}

export interface DaySummary {
  date: string;
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hasLog: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const trackerService = {
  async getDay(userId: string, dateStr: string): Promise<DayTrackerData> {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);

    // Get active plan
    const plan = await mealPlanRepository.findActiveWithDays(userId);
    const [profile, log] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      dailyLogRepository.findByDate(userId, date),
    ]);

    // Full resolved targets — the tracker's macro bars must show the SAME
    // numbers as the dashboard (prod-followups #4: it used to hardcode
    // 150/250/70, which doesn't even sum to the calorie target).
    const { dailyCalorieTarget, proteinG, carbsG, fatG } = resolveDailyTargets(profile);

    // Determine day-of-week (0=Mon)
    const jsDay = date.getUTCDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

    const plannedMeals: DayPlanMeal[] = [];

    if (plan) {
      const dayPlan = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
      if (dayPlan) {
        const mealSlots = dayPlan.meals as { type: string; recipeId: string }[];
        const recipeIds = mealSlots.map((m) => m.recipeId);
        const recipes = await mealPlanRepository.findRecipesByIds(recipeIds);
        const recipeMap = new Map(recipes.map((r) => [r.id, r]));

        for (const slot of mealSlots) {
          const recipe = recipeMap.get(slot.recipeId);
          if (!recipe) continue;
          const nutrition = recipe.nutritionInfo as {
            calories?: number;
            protein?: number;
            carbs?: number;
            fat?: number;
          };
          plannedMeals.push({
            recipeId: slot.recipeId,
            mealType: slot.type,
            recipeName: recipe.name,
            imageUrl: recipe.imageUrl ?? null,
            kcal: nutrition.calories ?? 0,
            protein: nutrition.protein ?? 0,
            carbs: nutrition.carbs ?? 0,
            fat: nutrition.fat ?? 0,
          });
        }
      }
    }

    return {
      date: dateStr,
      plannedMeals,
      log: log
        ? {
            loggedMeals: log.loggedMeals as unknown as LoggedMealEntry[],
            totalKcal: log.totalKcal,
            totalProtein: log.totalProtein,
            totalCarbs: log.totalCarbs,
            totalFat: log.totalFat,
          }
        : null,
      targets: { dailyCalorieTarget, proteinG, carbsG, fatG },
    };
  },

  async upsertDay(
    user: UserProfile,
    dateStr: string,
    loggedMeals: LoggedMealEntry[],
  ): Promise<{ log: DailyLog; rebalance: RebalanceResult | null }> {
    const log = await this.writeDay(user.id, dateStr, loggedMeals);
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /** Persists a day's logged meals with recomputed totals (no rebalance). */
  async writeDay(
    userId: string,
    dateStr: string,
    loggedMeals: LoggedMealEntry[],
  ): Promise<DailyLog> {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);

    // Compute totals from loggedMeals
    const totalKcal = Math.round(loggedMeals.reduce((s, m) => s + m.kcal, 0));
    const totalProtein = loggedMeals.reduce((s, m) => s + m.protein, 0);
    const totalCarbs = loggedMeals.reduce((s, m) => s + m.carbs, 0);
    const totalFat = loggedMeals.reduce((s, m) => s + m.fat, 0);

    return dailyLogRepository.upsert({
      userId,
      date,
      loggedMeals,
      totalKcal,
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10,
    });
  },

  /**
   * Appends one custom entry (photo scan or manual quick-add, F4) to the
   * day's log. Custom entries store pre-scaled macros with portionMultiplier
   * 1 — the confirm sheet already let the user edit the numbers.
   */
  async logCustomMeal(
    user: UserProfile,
    dateStr: string,
    entry: {
      name: string;
      estimatedBy: 'vision' | 'manual';
      mealType: string;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
    },
  ): Promise<{ log: DailyLog; rebalance: RebalanceResult | null }> {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    const existing = await dailyLogRepository.findByDate(user.id, date);
    const loggedMeals = [
      ...((existing?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? []),
      {
        custom: { name: entry.name, estimatedBy: entry.estimatedBy },
        mealType: entry.mealType,
        portionMultiplier: 1,
        kcal: entry.kcal,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
      },
    ];
    const log = await this.writeDay(user.id, dateStr, loggedMeals);
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /**
   * Removes one custom entry (by its index in the day's loggedMeals array).
   * Planned-recipe entries are managed by the tracker page's save flow and
   * cannot be deleted here.
   */
  async deleteCustomMeal(userId: string, dateStr: string, entryIndex: number): Promise<DailyLog> {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    const existing = await dailyLogRepository.findByDate(userId, date);
    const loggedMeals = (existing?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    const target = loggedMeals[entryIndex];
    if (!target?.custom) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No custom entry at that position.' });
    }
    const remaining = loggedMeals.filter((_, i) => i !== entryIndex);
    return this.writeDay(userId, dateStr, remaining);
  },

  /**
   * F4 rebalance hook — runs after any log write. Premium-only (gated by the
   * photoLogging matrix key: free tier logs honestly but the chef doesn't
   * re-plan the week). Failures are swallowed: a broken rebalance must never
   * fail the log save itself.
   */
  async maybeRebalance(user: UserProfile): Promise<RebalanceResult | null> {
    if (!hasFeature(user, 'photoLogging')) return null;
    try {
      const plan = await mealPlanRepository.findActiveWithDays(user.id);
      if (!plan) return null;
      return await rebalanceWeek(user.id, plan.id);
    } catch (err) {
      console.error('[tracker] rebalanceWeek failed (log save unaffected):', err);
      return null;
    }
  },

  /**
   * Daily totals for the trailing `dayCount` days (today inclusive), zero-
   * filled for unlogged days. weeklySummary/monthlySummary used to be
   * byte-identical copies of this differing only in N.
   */
  async summary(
    userId: string,
    dayCount: number,
  ): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    const [logs, profile] = await Promise.all([
      dailyLogRepository.findLastN(userId, dayCount),
      chefProfileRepository.findByUserId(userId),
    ]);
    const dailyCalorieTarget = resolveDailyTargets(profile).dailyCalorieTarget;

    const days: DaySummary[] = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      d.setUTCHours(0, 0, 0, 0);
      const dateStr = d.toISOString().split('T')[0]!;
      const log = logs.find((l) => {
        const ld = new Date(l.date);
        ld.setUTCHours(0, 0, 0, 0);
        return ld.toISOString().split('T')[0] === dateStr;
      });
      days.push({
        date: dateStr,
        totalKcal: log?.totalKcal ?? 0,
        totalProtein: log?.totalProtein ?? 0,
        totalCarbs: log?.totalCarbs ?? 0,
        totalFat: log?.totalFat ?? 0,
        hasLog: !!log,
      });
    }
    return { days, dailyCalorieTarget };
  },

  async weeklySummary(userId: string): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    return this.summary(userId, 7);
  },

  async monthlySummary(
    userId: string,
  ): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    return this.summary(userId, 28);
  },

  async logWeight(userId: string, weightKg: number, dateStr?: string) {
    const recordedAt = dateStr ? new Date(dateStr) : new Date();
    return weightEntryRepository.create({ userId, weightKg, recordedAt });
  },

  async weightHistory(userId: string, days: number) {
    return weightEntryRepository.findLastN(userId, days);
  },
};
