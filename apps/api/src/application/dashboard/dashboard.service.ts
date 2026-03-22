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
    meals: { mealType: string; recipeId: string; recipeName: string }[];
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

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];

// Determine the "next" meal type based on current hour
function getNextMealIndex(currentHour: number): number {
  if (currentHour < 10) return 0; // breakfast
  if (currentHour < 14) return 1; // lunch
  if (currentHour < 17) return 2; // snack
  if (currentHour < 21) return 3; // dinner
  return -1; // all done for today
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
      meals: meals.map((m) => ({
        mealType: m.type,
        recipeId: m.recipeId,
        recipeName: recipeMap.get(m.recipeId)?.name ?? 'Unknown',
      })),
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
        const n = recipe.nutritionInfo as NutritionInfo;
        plannedKcal += n.calories;
        plannedProtein += n.protein;
        plannedCarbs += n.carbs;
        plannedFat += n.fat;
      }
    }

    // Determine next meal and rest of today
    const currentHour = now.getHours();
    const nextMealIndex = getNextMealIndex(currentHour);
    const orderedMeals = MEAL_ORDER.map((type) => todayMeals.find((m) => m.type === type)).filter(
      Boolean,
    ) as MealSlot[];

    let nextMeal: DashboardSummary['nextMeal'] = null;
    const restOfToday: DashboardSummary['restOfToday'] = [];

    for (let i = 0; i < orderedMeals.length; i++) {
      const slot = orderedMeals[i];
      if (!slot) continue;
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) continue;
      const n = recipe.nutritionInfo as NutritionInfo;

      if (i === nextMealIndex && !nextMeal) {
        nextMeal = {
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
      } else if (i > nextMealIndex && nextMealIndex >= 0) {
        restOfToday.push({
          mealType: slot.type,
          scheduledLabel: MEAL_SCHEDULE[slot.type] ?? '',
          recipeName: recipe.name,
          kcal: n.calories,
        });
      }
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
