import {
  chefProfileRepository,
  favouriteRecipeRepository,
  mealPlanRepository,
} from '@chefer/database';
import type { NutritionInfo } from '../../lib/ai/index.js';

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
    protein: { planned: number; targetG: number };
    carbs: { planned: number; targetG: number };
    fat: { planned: number; targetG: number };
  };
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

// ─── Service ──────────────────────────────────────────────────────────────────

export class DashboardService {
  async getSummary(userId: string, firstName: string | null): Promise<DashboardSummary> {
    const now = new Date();
    // Monday=0 … Sunday=6 (same as MealPlanDay.dayOfWeek)
    const jsDay = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const todayIndex = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0

    const [chefProfile, plan, favourites] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      mealPlanRepository.findActiveWithDays(userId),
      favouriteRecipeRepository.findByUserId(userId, 4),
    ]);

    const dailyCalorieTarget = chefProfile?.dailyCalorieTarget ?? 2000;

    if (!plan) {
      return this.emptyDashboard(
        userId,
        firstName,
        now,
        todayIndex,
        dailyCalorieTarget,
        favourites,
      );
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
    const currentHour = now.getHours();
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

    // Macro targets (simple % of daily calories approach)
    const proteinTargetG = Math.round((dailyCalorieTarget * 0.3) / 4);
    const carbsTargetG = Math.round((dailyCalorieTarget * 0.45) / 4);
    const fatTargetG = Math.round((dailyCalorieTarget * 0.25) / 9);

    return {
      user: { firstName, displayName: chefProfile?.displayName ?? null },
      today: {
        date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        dayOfWeek: todayIndex,
      },
      weekPlan,
      nextMeal,
      tomorrowFirstMeal,
      restOfToday,
      recentFavourites: favourites.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        imageUrl: f.recipe.imageUrl,
        cuisineType: f.recipe.cuisineType,
        prepTimeMins: f.recipe.prepTimeMins,
      })),
      nutrition: {
        dailyCalorieTarget,
        plannedKcal,
        protein: { planned: Math.round(plannedProtein), targetG: proteinTargetG },
        carbs: { planned: Math.round(plannedCarbs), targetG: carbsTargetG },
        fat: { planned: Math.round(plannedFat), targetG: fatTargetG },
      },
    };
  }

  private emptyDashboard(
    _userId: string,
    firstName: string | null,
    now: Date,
    todayIndex: number,
    dailyCalorieTarget: number,
    favourites: Awaited<ReturnType<typeof favouriteRecipeRepository.findByUserId>>,
  ): DashboardSummary {
    const proteinTargetG = Math.round((dailyCalorieTarget * 0.3) / 4);
    const carbsTargetG = Math.round((dailyCalorieTarget * 0.45) / 4);
    const fatTargetG = Math.round((dailyCalorieTarget * 0.25) / 9);
    return {
      user: { firstName, displayName: null },
      today: {
        date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        dayOfWeek: todayIndex,
      },
      weekPlan: [],
      nextMeal: null,
      tomorrowFirstMeal: null,
      restOfToday: [],
      recentFavourites: favourites.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        imageUrl: f.recipe.imageUrl,
        cuisineType: f.recipe.cuisineType,
        prepTimeMins: f.recipe.prepTimeMins,
      })),
      nutrition: {
        dailyCalorieTarget,
        plannedKcal: 0,
        protein: { planned: 0, targetG: proteinTargetG },
        carbs: { planned: 0, targetG: carbsTargetG },
        fat: { planned: 0, targetG: fatTargetG },
      },
    };
  }
}

export const dashboardService = new DashboardService();
