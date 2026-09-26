import {
  chefProfileRepository,
  dailyLogRepository,
  favouriteRecipeRepository,
  MealPlanOrigin,
  mealPlanRepository,
  mealRatingRepository,
} from '@chefer/database';
import type { NutritionInfo } from '../../lib/ai/index.js';
import { resolveDailyTargets, type DailyTargets } from '../preferences/preferences.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  user: { firstName: string | null; displayName: string | null };
  today: { date: string; dayOfWeek: number };
  weekPlan: {
    dayOfWeek: number;
    meals: {
      mealType: string;
      recipeId: string;
      recipeName: string;
      imageUrl: string | null;
      kcal: number;
    }[];
  }[];
  nextMeal: {
    mealType: string;
    recipe: {
      id: string;
      name: string;
      description: string;
      imageUrl: string | null;
      kcal: number;
      servings: number;
      prepTimeMins: number;
    };
  } | null;
  /** Set when every meal window today has passed — tomorrow's first meal. */
  tomorrowFirstMeal: DashboardSummary['nextMeal'];
  restOfToday: {
    mealType: string;
    scheduledLabel: string;
    recipeName: string;
    /** Additive (older clients ignore it): lets "Later today" rows open the recipe. */
    recipeId?: string;
    kcal: number;
  }[];
  recentFavourites: {
    id: string;
    name: string;
    imageUrl: string | null;
    cuisineType: string;
    prepTimeMins: number;
  }[];
  nutrition: {
    dailyCalorieTarget: number;
    plannedKcal: number;
    /**
     * What was LOGGED today (tracker), additive — the home ring used to show
     * planned food only, e.g. "540 remaining" with 6,070 kcal eaten
     * (audit F-DASH-1-2). Older clients ignore these fields.
     */
    eatenKcal: number;
    protein: { planned: number; targetG: number; eaten: number };
    carbs: { planned: number; targetG: number; eaten: number };
    fat: { planned: number; targetG: number; eaten: number };
  };
  /**
   * Set when the active plan was created BEFORE its week began (PW-5 Sunday
   * auto-generation, or planning ahead by hand) — the dashboard celebrates
   * "your week is ready" at the start of the week.
   */
  weekReady: { preparedAt: Date; ratedCount: number } | null;
}

// ─── Meal type schedules ───────────────────────────────────────────────────────

const MEAL_SCHEDULE: Record<string, string> = {
  breakfast: '8:00 AM',
  lunch: '12:30 PM',
  snack: '3:30 PM',
  dinner: '7:00 PM',
};

export const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];

/** The hour (exclusive) at which each meal's window closes. */
export const MEAL_WINDOW_END: Record<string, number> = {
  breakfast: 10,
  lunch: 14,
  snack: 17,
  dinner: 21,
};

/**
 * The next meal to surface, resolved by TYPE against the meals the plan
 * actually contains: the first still-open window among `availableTypes`.
 *
 * Resolving by position broke 3-meal plans (the default): the old index
 * pointed into the fixed 4-slot MEAL_ORDER, so from 17:00 it addressed a
 * fourth slot that didn't exist and the dashboard hero went blank at
 * dinner time — and from 14:00 it surfaced dinner while the snack window
 * was still open on 4-meal plans.
 *
 * Returns null when every window has passed (late evening).
 */
export function getNextMealType(currentHour: number, availableTypes: string[]): string | null {
  for (const type of MEAL_ORDER) {
    if (!availableTypes.includes(type)) continue;
    if (currentHour < (MEAL_WINDOW_END[type] ?? 0)) return type;
  }
  return null;
}

/**
 * "Friday, September 25". A client-supplied local date arrives as UTC
 * midnight (see getSummary), so it is formatted in UTC to keep its weekday.
 */
function formatDayLabel(now: Date): string {
  const isUtcMidnight =
    now.getUTCHours() === 0 && now.getUTCMinutes() === 0 && now.getUTCSeconds() === 0;
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(isUtcMidnight && { timeZone: 'UTC' }),
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class DashboardService {
  async getSummary(
    userId: string,
    firstName: string | null,
    local?: { localDate?: string | undefined; localHour?: number | undefined },
  ): Promise<DashboardSummary> {
    // "Today" is the client's calendar day when it tells us; server time is
    // the fallback for older clients. A local date is kept as UTC midnight so
    // the weekday and label below read it without any time-zone shift.
    const now = local?.localDate ? new Date(`${local.localDate}T00:00:00Z`) : new Date();
    const useUtc = Boolean(local?.localDate);
    // Monday=0 … Sunday=6 (same as MealPlanDay.dayOfWeek)
    const jsDay = useUtc ? now.getUTCDay() : now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const todayIndex = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
    const currentHourLocal = local?.localHour ?? new Date().getHours();

    const [chefProfile, plan, favourites, todayLog] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      mealPlanRepository.findActiveWithDays(userId),
      favouriteRecipeRepository.findByUserId(userId, 4),
      dailyLogRepository.findByDate(userId, local?.localDate ? now : new Date()),
    ]);

    const targets = resolveDailyTargets(chefProfile);
    const eaten = {
      kcal: todayLog?.totalKcal ?? 0,
      protein: Math.round(todayLog?.totalProtein ?? 0),
      carbs: Math.round(todayLog?.totalCarbs ?? 0),
      fat: Math.round(todayLog?.totalFat ?? 0),
    };

    if (!plan) {
      return this.emptyDashboard(userId, firstName, now, todayIndex, targets, favourites, eaten);
    }

    // Join all recipe IDs
    type MealSlot = { type: string; recipeId: string };
    const allMealSlots = plan.days.flatMap((d: { dayOfWeek: number; meals: unknown }) => ({
      dayOfWeek: d.dayOfWeek,
      meals: d.meals as MealSlot[],
    }));

    const uniqueIds = [...new Set(allMealSlots.flatMap((d) => d.meals.map((m) => m.recipeId)))];
    const recipeRows = await mealPlanRepository.findRecipesByIds(uniqueIds);
    const recipeMap = new Map(recipeRows.map((r) => [r.id, r]));

    // Build weekPlan
    const weekPlan = allMealSlots.map(({ dayOfWeek, meals }) => ({
      dayOfWeek,
      meals: meals.map((m) => {
        const recipe = recipeMap.get(m.recipeId);
        const nutrition = recipe?.nutritionInfo as NutritionInfo | undefined;
        return {
          mealType: m.type,
          recipeId: m.recipeId,
          recipeName: recipe?.name ?? 'Unknown',
          imageUrl: recipe?.imageUrl ?? null,
          kcal: nutrition?.calories ?? 0,
        };
      }),
    }));

    // Get today's meals
    const todayDay = plan.days.find((d: { dayOfWeek: number }) => d.dayOfWeek === todayIndex);
    const todayMeals = todayDay ? (todayDay.meals as MealSlot[]) : [];

    // Compute planned kcal + macros for today
    let plannedKcal = 0;
    let plannedProtein = 0;
    let plannedCarbs = 0;
    let plannedFat = 0;
    for (const slot of todayMeals) {
      const recipe = recipeMap.get(slot.recipeId);
      if (recipe) {
        const n = recipe.nutritionInfo as unknown as NutritionInfo;
        plannedKcal += n.calories;
        plannedProtein += n.protein;
        plannedCarbs += n.carbs;
        plannedFat += n.fat;
      }
    }

    // Determine next meal and rest of today — resolved by meal TYPE against
    // the meals this plan actually contains (see getNextMealType).
    const currentHour = currentHourLocal;
    const orderedMeals = MEAL_ORDER.map((type) => todayMeals.find((m) => m.type === type)).filter(
      (slot): slot is MealSlot => slot !== undefined,
    );
    const nextMealType = getNextMealType(
      currentHour,
      orderedMeals.map((m) => m.type),
    );

    const toHeroMeal = (slot: MealSlot): DashboardSummary['nextMeal'] => {
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) return null;
      const n = recipe.nutritionInfo as unknown as NutritionInfo;
      return {
        mealType: slot.type,
        recipe: {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          imageUrl: recipe.imageUrl,
          kcal: n.calories,
          servings: recipe.servings,
          prepTimeMins: recipe.prepTimeMins,
        },
      };
    };

    let nextMeal: DashboardSummary['nextMeal'] = null;
    const restOfToday: DashboardSummary['restOfToday'] = [];
    let pastNext = false;

    for (const slot of orderedMeals) {
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) continue;
      const n = recipe.nutritionInfo as unknown as NutritionInfo;

      if (slot.type === nextMealType) {
        nextMeal = toHeroMeal(slot);
        pastNext = true;
      } else if (pastNext) {
        restOfToday.push({
          mealType: slot.type,
          scheduledLabel: MEAL_SCHEDULE[slot.type] ?? '',
          recipeName: recipe.name,
          recipeId: recipe.id,
          kcal: n.calories,
        });
      }
    }

    // Late evening: every window has passed — surface tomorrow's first meal
    // so the hero card is never blank while an active plan exists.
    let tomorrowFirstMeal: DashboardSummary['tomorrowFirstMeal'] = null;
    if (!nextMeal) {
      const tomorrowIndex = (todayIndex + 1) % 7;
      const tomorrowDay = plan.days.find(
        (d: { dayOfWeek: number }) => d.dayOfWeek === tomorrowIndex,
      );
      const tomorrowMeals = tomorrowDay ? (tomorrowDay.meals as MealSlot[]) : [];
      const firstSlot = MEAL_ORDER.map((type) => tomorrowMeals.find((m) => m.type === type)).find(
        (slot) => slot !== undefined,
      );
      if (firstSlot) tomorrowFirstMeal = toHeroMeal(firstSlot);
    }

    // PW-5: did the Sunday worker prepare this week? Only WEEKLY_AUTO plans —
    // a carry-forward copy or a manual plan made early used to claim "the
    // chef prepared this week's plan for you on Sunday" (audit F-PLAN-4-2).
    let weekReady: DashboardSummary['weekReady'] = null;
    if (plan.origin === MealPlanOrigin.WEEKLY_AUTO) {
      const signals = await mealRatingRepository.findSignalsForUser(userId, 20);
      weekReady = { preparedAt: plan.createdAt, ratedCount: signals.length };
    }

    return {
      user: { firstName, displayName: chefProfile?.displayName ?? null },
      today: {
        date: formatDayLabel(now),
        dayOfWeek: todayIndex,
      },
      weekPlan,
      nextMeal,
      tomorrowFirstMeal,
      restOfToday,
      weekReady,
      recentFavourites: favourites.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        imageUrl: f.recipe.imageUrl,
        cuisineType: f.recipe.cuisineType,
        prepTimeMins: f.recipe.prepTimeMins,
      })),
      nutrition: {
        dailyCalorieTarget: targets.dailyCalorieTarget,
        plannedKcal,
        eatenKcal: eaten.kcal,
        protein: {
          planned: Math.round(plannedProtein),
          targetG: targets.proteinG,
          eaten: eaten.protein,
        },
        carbs: { planned: Math.round(plannedCarbs), targetG: targets.carbsG, eaten: eaten.carbs },
        fat: { planned: Math.round(plannedFat), targetG: targets.fatG, eaten: eaten.fat },
      },
    };
  }

  private emptyDashboard(
    _userId: string,
    firstName: string | null,
    now: Date,
    todayIndex: number,
    targets: DailyTargets,
    favourites: Awaited<ReturnType<typeof favouriteRecipeRepository.findByUserId>>,
    eaten: { kcal: number; protein: number; carbs: number; fat: number },
  ): DashboardSummary {
    return {
      user: { firstName, displayName: null },
      today: {
        date: formatDayLabel(now),
        dayOfWeek: todayIndex,
      },
      weekPlan: [],
      nextMeal: null,
      tomorrowFirstMeal: null,
      restOfToday: [],
      weekReady: null,
      recentFavourites: favourites.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        imageUrl: f.recipe.imageUrl,
        cuisineType: f.recipe.cuisineType,
        prepTimeMins: f.recipe.prepTimeMins,
      })),
      nutrition: {
        dailyCalorieTarget: targets.dailyCalorieTarget,
        plannedKcal: 0,
        eatenKcal: eaten.kcal,
        protein: { planned: 0, targetG: targets.proteinG, eaten: eaten.protein },
        carbs: { planned: 0, targetG: targets.carbsG, eaten: eaten.carbs },
        fat: { planned: 0, targetG: targets.fatG, eaten: eaten.fat },
      },
    };
  }
}

export const dashboardService = new DashboardService();
