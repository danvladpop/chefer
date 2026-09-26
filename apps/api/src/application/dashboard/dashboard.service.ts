import {
  chefProfileRepository,
  dailyLogRepository,
  favouriteRecipeRepository,
  MealPlanOrigin,
  mealPlanRepository,
  mealRatingRepository,
  type LoggedMealEntry,
} from '@chefer/database';
import type { NutritionTargets, TrainingDayNutrition, UserProfile } from '@chefer/types';
import {
  buildTrainingDayNutrition,
  MEAL_ORDER,
  MEAL_WINDOW_END,
  resolveTodayMeals,
  slotPortion,
} from '@chefer/utils';
import type { NutritionInfo } from '../../lib/ai/index.js';
import { hasFeature, isPremiumUser } from '../../lib/entitlements.js';
import { resolveDailyTargets, type DailyTargets } from '../preferences/preferences.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';

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
    /**
     * P1-1: the plan slot's portion (servings of the recipe) when not 1×;
     * `recipe.kcal` already includes it. Additive — older clients ignore it.
     */
    portion?: number;
    recipe: {
      id: string;
      name: string;
      description: string;
      imageUrl: string | null;
      kcal: number;
      servings: number;
      prepTimeMins: number;
      /** Additive (older clients ignore it): prep + cook is the real time (F-PM-10). */
      cookTimeMins?: number;
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
    /**
     * Lifters only (set-up gym profile, GAIN_MUSCLE, bodyweight known —
     * audit P2-4): today's training-day adjustment. Additive; the fields
     * above keep meaning the BASE targets, so older clients are unchanged.
     */
    trainingDay?: TrainingDayNutrition;
    /**
     * Today's targets with the training-day bump applied — present only when
     * it applies (premium, training day). New clients show these instead of
     * the base targets above.
     */
    adjustedTargets?: NutritionTargets;
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

// Meal order and windows live in @chefer/utils (shared with the Today
// surfaces' next-meal logic); re-exported for existing importers.
export { MEAL_ORDER, MEAL_WINDOW_END };

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

/** YYYY-MM-DD of `now` — UTC fields for a client-supplied date, else server-local. */
function toLocalDateString(now: Date, useUtc: boolean): string {
  const y = useUtc ? now.getUTCFullYear() : now.getFullYear();
  const m = (useUtc ? now.getUTCMonth() : now.getMonth()) + 1;
  const d = useUtc ? now.getUTCDate() : now.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type TrainingResult = ReturnType<typeof buildTrainingDayNutrition>;

/** The additive nutrition fields for a lifter (none for everyone else). */
function trainingFields(
  training: TrainingResult | null,
): Pick<DashboardSummary['nutrition'], 'trainingDay' | 'adjustedTargets'> {
  if (!training) return {};
  return {
    trainingDay: training.trainingDay,
    ...(training.adjustedTargets && { adjustedTargets: training.adjustedTargets }),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class DashboardService {
  async getSummary(
    userId: string,
    firstName: string | null,
    local?: { localDate?: string | undefined; localHour?: number | undefined },
    /** The viewer, for tier-gated extras (training-day bump). Optional for tests. */
    viewer?: UserProfile,
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

    // Lifters get protein from bodyweight; on a training day the bump is
    // applied for premium and previewed for free (audit P2-4).
    const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(userId, chefProfile);
    const targets = resolveDailyTargets(chefProfile, lifterBodyweightKg);
    const training = lifterBodyweightKg
      ? buildTrainingDayNutrition({
          base: targets,
          bodyweightKg: lifterBodyweightKg,
          day: await trainingNutritionService.trainingDayFor(
            userId,
            toLocalDateString(now, useUtc),
            todayIndex,
          ),
          premium: viewer ? hasFeature(viewer, 'trainingNutrition') : false,
        })
      : null;
    const eaten = {
      kcal: todayLog?.totalKcal ?? 0,
      protein: Math.round(todayLog?.totalProtein ?? 0),
      carbs: Math.round(todayLog?.totalCarbs ?? 0),
      fat: Math.round(todayLog?.totalFat ?? 0),
    };

    if (!plan) {
      return this.emptyDashboard(
        userId,
        firstName,
        now,
        todayIndex,
        targets,
        favourites,
        eaten,
        training,
      );
    }

    // Join all recipe IDs
    // P1-1: slots may carry a portion multiplier — every kcal/macro figure
    // below is for the portion actually planned.
    type MealSlot = { type: string; recipeId: string; portion?: number };
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
          kcal: Math.round((nutrition?.calories ?? 0) * slotPortion(m.portion)),
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
        const p = slotPortion(slot.portion);
        plannedKcal += n.calories * p;
        plannedProtein += n.protein * p;
        plannedCarbs += n.carbs * p;
        plannedFat += n.fat * p;
      }
    }

    // Next meal and rest of today — resolved by meal TYPE against the meals
    // this plan actually contains, skipping any meal already logged today:
    // after "Made it!" on dinner the spotlight moves on instead of offering
    // the same dinner again (audit F-PM-10). Shared with the clients via
    // @chefer/utils resolveTodayMeals.
    const orderedMeals = MEAL_ORDER.map((type) => todayMeals.find((m) => m.type === type)).filter(
      (slot): slot is MealSlot => slot !== undefined && recipeMap.has(slot.recipeId),
    );
    const loggedToday = (todayLog?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    const resolved = resolveTodayMeals(orderedMeals, currentHourLocal, loggedToday);

    const toHeroMeal = (slot: MealSlot): DashboardSummary['nextMeal'] => {
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) return null;
      const n = recipe.nutritionInfo as unknown as NutritionInfo;
      const portion = slotPortion(slot.portion);
      return {
        mealType: slot.type,
        ...(portion !== 1 && { portion }),
        recipe: {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          imageUrl: recipe.imageUrl,
          kcal: Math.round(n.calories * portion),
          servings: recipe.servings,
          prepTimeMins: recipe.prepTimeMins,
          cookTimeMins: recipe.cookTimeMins,
        },
      };
    };

    const nextMeal: DashboardSummary['nextMeal'] = resolved.next ? toHeroMeal(resolved.next) : null;
    const restOfToday: DashboardSummary['restOfToday'] = resolved.later.flatMap((slot) => {
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) return [];
      const n = recipe.nutritionInfo as unknown as NutritionInfo;
      return [
        {
          mealType: slot.type,
          scheduledLabel: MEAL_SCHEDULE[slot.type] ?? '',
          recipeName: recipe.name,
          recipeId: recipe.id,
          kcal: Math.round(n.calories * slotPortion(slot.portion)),
        },
      ];
    });

    // Late evening (every window has passed) or everything left today is
    // already eaten — surface tomorrow's first meal so the hero card is never
    // blank while an active plan exists.
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
    // Free users' Sunday week is curated (P2-5): it doesn't learn from
    // ratings, so it never claims to.
    if (plan.origin === MealPlanOrigin.WEEKLY_AUTO) {
      // No viewer (tests, older call sites) keeps the premium behaviour.
      const premium = viewer ? isPremiumUser(viewer) : true;
      const signals = premium ? await mealRatingRepository.findSignalsForUser(userId, 20) : [];
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
        plannedKcal: Math.round(plannedKcal),
        eatenKcal: eaten.kcal,
        protein: {
          planned: Math.round(plannedProtein),
          targetG: targets.proteinG,
          eaten: eaten.protein,
        },
        carbs: { planned: Math.round(plannedCarbs), targetG: targets.carbsG, eaten: eaten.carbs },
        fat: { planned: Math.round(plannedFat), targetG: targets.fatG, eaten: eaten.fat },
        ...trainingFields(training),
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
    training: TrainingResult | null,
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
        ...trainingFields(training),
      },
    };
  }
}

export const dashboardService = new DashboardService();
