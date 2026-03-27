import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  weightEntryRepository,
} from '@chefer/database';
import type { LoggedMealEntry } from '@chefer/database';

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

    const dailyCalorieTarget = profile?.dailyCalorieTarget ?? 2000;

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
      targets: { dailyCalorieTarget },
    };
  },

  async upsertDay(userId: string, dateStr: string, loggedMeals: LoggedMealEntry[]) {
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

  async weeklySummary(userId: string): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    const [logs, profile] = await Promise.all([
      dailyLogRepository.findLastN(userId, 7),
      chefProfileRepository.findByUserId(userId),
    ]);
    const dailyCalorieTarget = profile?.dailyCalorieTarget ?? 2000;

    // Build last 7 days
    const days: DaySummary[] = [];
    for (let i = 6; i >= 0; i--) {
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

  async monthlySummary(
    userId: string,
  ): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    const [logs, profile] = await Promise.all([
      dailyLogRepository.findLastN(userId, 28),
      chefProfileRepository.findByUserId(userId),
    ]);
    const dailyCalorieTarget = profile?.dailyCalorieTarget ?? 2000;

    const days: DaySummary[] = [];
    for (let i = 27; i >= 0; i--) {
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

  async logWeight(userId: string, weightKg: number, dateStr?: string) {
    const recordedAt = dateStr ? new Date(dateStr) : new Date();
    return weightEntryRepository.create({ userId, weightKg, recordedAt });
  },

  async weightHistory(userId: string, days: number) {
    return weightEntryRepository.findLastN(userId, days);
  },
};
