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
import { findRecipeVisibleTo } from '../recipe/recipe-access.js';
import { isRecipeEntry, mergeLoggedMeals } from './merge-log.js';

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

/** A logged planned-recipe entry whose recipe is no longer in today's plan. */
export interface OffPlanLoggedMeal {
  recipeId: string;
  recipeName: string;
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayTrackerData {
  date: string; // YYYY-MM-DD
  plannedMeals: DayPlanMeal[];
  /**
   * Logged recipes that aren't among today's planned meals — e.g. cooked
   * before a regenerate or swap. The tracker shows and counts them (audit
   * F-PM-1). Additive: older clients ignore it.
   */
  offPlanLogged: OffPlanLoggedMeal[];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayDate(dateStr: string): Date {
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Recipe ids the tracker shows as planned for this date (same source as getDay). */
async function plannedRecipeIdsFor(userId: string, dateStr: string): Promise<Set<string>> {
  const plan = await mealPlanRepository.findActiveWithDays(userId);
  const jsDay = dayDate(dateStr).getUTCDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const day = plan?.days.find((d) => d.dayOfWeek === dayOfWeek);
  const slots = (day?.meals ?? []) as { recipeId: string }[];
  return new Set(slots.map((s) => s.recipeId));
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

    const plannedIds = new Set(plannedMeals.map((m) => m.recipeId));
    const offPlanEntries = ((log?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [])
      .filter(isRecipeEntry)
      .filter((m) => !plannedIds.has(m.recipeId));
    const offPlanNames =
      offPlanEntries.length > 0
        ? new Map(
            (await mealPlanRepository.findRecipesByIds(offPlanEntries.map((m) => m.recipeId))).map(
              (r) => [r.id, r.name],
            ),
          )
        : new Map<string, string>();
    const offPlanLogged: OffPlanLoggedMeal[] = offPlanEntries.map((m) => ({
      recipeId: m.recipeId,
      recipeName: offPlanNames.get(m.recipeId) ?? 'Logged meal',
      mealType: m.mealType,
      kcal: m.kcal,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
    }));

    return {
      date: dateStr,
      plannedMeals,
      offPlanLogged,
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
    const plannedRecipeIds = await plannedRecipeIdsFor(user.id, dateStr);
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(dateStr), (stored) =>
      mergeLoggedMeals(stored, loggedMeals, plannedRecipeIds),
    );
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /**
   * Logs one serving of a recipe ("Made it!" in cook mode). Atomic and
   * idempotent: an existing entry for the same recipe and meal type is
   * replaced, so a double tap can't double-log (F-M-TRK-1-1). Nutrition
   * comes from the stored recipe, never the client.
   */
  async logRecipe(
    user: UserProfile,
    dateStr: string,
    input: { recipeId: string; mealType: string; portionMultiplier: number },
  ): Promise<{ log: DailyLog; rebalance: RebalanceResult | null }> {
    const recipe = await findRecipeVisibleTo(user.id, input.recipeId);
    if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    const n = recipe.nutritionInfo as {
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    };
    const p = input.portionMultiplier;
    const entry: LoggedMealEntry = {
      recipeId: recipe.id,
      mealType: input.mealType,
      portionMultiplier: p,
      kcal: Math.round((n.calories ?? 0) * p),
      protein: Math.round((n.protein ?? 0) * p * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * p * 10) / 10,
      fat: Math.round((n.fat ?? 0) * p * 10) / 10,
    };
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(dateStr), (stored) => [
      ...stored.filter((m) => !(m.recipeId === entry.recipeId && m.mealType === entry.mealType)),
      entry,
    ]);
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
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
    // Atomic append — parallel adds no longer overwrite each other (F-TRK-1-2).
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(dateStr), (stored) => [
      ...stored,
      {
        custom: { name: entry.name, estimatedBy: entry.estimatedBy },
        mealType: entry.mealType,
        portionMultiplier: 1,
        kcal: entry.kcal,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
      },
    ]);
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /**
   * Removes one custom entry (by its index in the day's loggedMeals array).
   * Planned-recipe entries are managed by the tracker page's save flow and
   * cannot be deleted here.
   */
  async deleteCustomMeal(userId: string, dateStr: string, entryIndex: number): Promise<DailyLog> {
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) => {
      if (!stored[entryIndex]?.custom) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No custom entry at that position.' });
      }
      return stored.filter((_, i) => i !== entryIndex);
    });
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
