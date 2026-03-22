import { TRPCError } from '@trpc/server';
import {
  chefProfileRepository,
  dietaryPreferencesRepository,
  mealPlanRepository,
  type IMealPlanRepository,
  type Recipe,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import type { Ingredient, MealType, NutritionInfo, RecipeData } from '../../lib/ai/index.js';

// ─── Shopping list types ───────────────────────────────────────────────────────

export interface ShoppingListItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

export interface ShoppingListGroup {
  category: string;
  items: ShoppingListItem[];
}

// Simple keyword → category mapping
const CATEGORY_MAP: Record<string, string> = {
  // Produce
  tomato: 'Produce',
  spinach: 'Produce',
  onion: 'Produce',
  garlic: 'Produce',
  lemon: 'Produce',
  lime: 'Produce',
  avocado: 'Produce',
  mushroom: 'Produce',
  pepper: 'Produce',
  lettuce: 'Produce',
  cucumber: 'Produce',
  zucchini: 'Produce',
  carrot: 'Produce',
  broccoli: 'Produce',
  celery: 'Produce',
  kale: 'Produce',
  // Proteins
  chicken: 'Proteins',
  beef: 'Proteins',
  salmon: 'Proteins',
  tuna: 'Proteins',
  egg: 'Proteins',
  tofu: 'Proteins',
  shrimp: 'Proteins',
  turkey: 'Proteins',
  pork: 'Proteins',
  lamb: 'Proteins',
  cod: 'Proteins',
  // Dairy
  milk: 'Dairy',
  cheese: 'Dairy',
  yogurt: 'Dairy',
  butter: 'Dairy',
  cream: 'Dairy',
  parmesan: 'Dairy',
  mozzarella: 'Dairy',
  feta: 'Dairy',
  // Grains & Pantry
  rice: 'Grains & Pantry',
  pasta: 'Grains & Pantry',
  flour: 'Grains & Pantry',
  bread: 'Grains & Pantry',
  oat: 'Grains & Pantry',
  quinoa: 'Grains & Pantry',
  lentil: 'Grains & Pantry',
  bean: 'Grains & Pantry',
  oil: 'Grains & Pantry',
  vinegar: 'Grains & Pantry',
  soy: 'Grains & Pantry',
  honey: 'Grains & Pantry',
  salt: 'Grains & Pantry',
  pepper: 'Grains & Pantry',
  cumin: 'Grains & Pantry',
  paprika: 'Grains & Pantry',
  cinnamon: 'Grains & Pantry',
  stock: 'Grains & Pantry',
  broth: 'Grains & Pantry',
  coconut: 'Grains & Pantry',
  almond: 'Grains & Pantry',
  walnut: 'Grains & Pantry',
  cashew: 'Grains & Pantry',
};

// ─── Output DTOs ──────────────────────────────────────────────────────────────

export interface RecipeDto {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  nutritionInfo: NutritionInfo;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
}

export interface MealSlotDto {
  type: MealType;
  recipe: RecipeDto;
}

export interface DayPlanDto {
  dayOfWeek: number;
  meals: MealSlotDto[];
}

export interface WeekPlanDto {
  planId: string;
  weekStartDate: Date;
  days: DayPlanDto[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MealPlanService {
  constructor(private readonly repo: IMealPlanRepository) {}

  /**
   * Generates a fresh 7-day meal plan for the user, persists it, and returns
   * the assembled DTO. Archives any previously active plan.
   */
  async generate(userId: string): Promise<WeekPlanDto> {
    // 1. Load user preferences
    const [chefProfile, dietaryPrefs] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      dietaryPreferencesRepository.findByUserId(userId),
    ]);

    if (!chefProfile) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Complete your profile setup before generating a meal plan.',
      });
    }

    // 2. Build the AI input from stored preferences
    const aiInput = {
      userId,
      goal: chefProfile.goal ?? 'MAINTAIN',
      biologicalSex: chefProfile.biologicalSex ?? 'MALE',
      age: chefProfile.age ?? 30,
      heightCm: chefProfile.heightCm ?? 175,
      weightKg: chefProfile.weightKg ?? 75,
      activityLevel: chefProfile.activityLevel ?? 'MODERATELY_ACTIVE',
      dailyCalorieTarget: chefProfile.dailyCalorieTarget ?? 2000,
      dietaryRestrictions: dietaryPrefs?.dietaryRestrictions ?? [],
      allergies: dietaryPrefs?.allergies ?? [],
      dislikedIngredients: dietaryPrefs?.dislikedIngredients ?? [],
      cuisinePreferences: dietaryPrefs?.cuisinePreferences ?? [],
      mealsPerDay: dietaryPrefs?.mealsPerDay ?? 3,
      servingSize: dietaryPrefs?.servingSize ?? 1,
    };

    // 3. Call AI service
    let weekPlan;
    try {
      weekPlan = await aiService.generateMealPlan(aiInput);
    } catch (err) {
      console.error('AI generateMealPlan failed:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate meal plan. Please try again.',
      });
    }

    // 4. Collect unique recipes across all days
    const recipeMap = new Map<string, RecipeData>();
    for (const day of weekPlan.days) {
      for (const slot of day.meals) {
        recipeMap.set(slot.recipe.id, slot.recipe);
      }
    }
    const recipes = Array.from(recipeMap.values());

    // 5. Persist recipes (upsert so reruns are idempotent)
    await this.repo.upsertRecipes(
      recipes.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        ingredients: r.ingredients,
        instructions: r.instructions,
        nutritionInfo: r.nutritionInfo,
        cuisineType: r.cuisineType,
        dietaryTags: r.dietaryTags,
        prepTimeMins: r.prepTimeMins,
        cookTimeMins: r.cookTimeMins,
        servings: r.servings,
        imageUrl: r.imageUrl ?? null,
      })),
    );

    // 6. Persist the meal plan (archives old active plan)
    const weekStartDate = getMondayOfCurrentWeek();
    const plan = await this.repo.createPlan({
      userId,
      weekStartDate,
      days: weekPlan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => ({ type: m.type, recipeId: m.recipe.id })),
      })),
      recipeIds: recipes.map((r) => r.id),
    });

    // 7. Assemble the DTO
    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      days: weekPlan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => ({
          type: m.type as MealType,
          recipe: toRecipeDto(m.recipe),
        })),
      })),
    };
  }

  /**
   * Returns the active meal plan for the user with all recipes joined,
   * or null if no active plan exists.
   */
  async getActive(userId: string): Promise<WeekPlanDto | null> {
    const plan = await this.repo.findActiveWithDays(userId);
    if (!plan) return null;

    type MealSlotJson = { type: string; recipeId: string };

    // Collect all recipe IDs referenced in the day JSON
    const allMeals = plan.days.flatMap((d: { meals: unknown }) => d.meals as MealSlotJson[]);
    const uniqueIds = [...new Set(allMeals.map((m: MealSlotJson) => m.recipeId))];
    const recipeRows: Recipe[] = await this.repo.findRecipesByIds(uniqueIds);
    const recipeMap = new Map<string, Recipe>(recipeRows.map((r) => [r.id, r]));

    const days: DayPlanDto[] = plan.days.map((d: { dayOfWeek: number; meals: unknown }) => {
      const meals = (d.meals as MealSlotJson[]).map((m: MealSlotJson) => {
        const row = recipeMap.get(m.recipeId);
        if (!row) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Recipe ${m.recipeId} not found in database.`,
          });
        }
        return {
          type: m.type as MealType,
          recipe: rowToRecipeDto(row),
        };
      });
      return { dayOfWeek: d.dayOfWeek, meals };
    });

    return { planId: plan.id, weekStartDate: plan.weekStartDate, days };
  }

  /**
   * Returns a single recipe by ID. Accessible to any authenticated user so
   * recipe detail pages work without a meal plan.
   */
  async getRecipe(recipeId: string): Promise<RecipeDto> {
    const row = await this.repo.findRecipeById(recipeId);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    return rowToRecipeDto(row);
  }

  /**
   * Swaps a single meal slot with an AI-generated alternative recipe.
   */
  async swapRecipe(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    reason?: string,
  ): Promise<RecipeDto> {
    // Verify the plan belongs to this user
    const plan = await this.repo.findActiveWithDays(userId);
    if (!plan || plan.id !== planId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Active meal plan not found.' });
    }

    // Call AI swap
    let newRecipe: RecipeData;
    try {
      newRecipe = await aiService.generateRecipeSwap({
        userId,
        mealType: mealType as MealType,
        currentRecipeId: '',
        reason,
      });
    } catch (err) {
      console.error('AI generateRecipeSwap failed:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to swap recipe. Please try again.',
      });
    }

    // Persist new recipe
    await this.repo.upsertRecipes([
      {
        id: newRecipe.id,
        name: newRecipe.name,
        description: newRecipe.description,
        ingredients: newRecipe.ingredients,
        instructions: newRecipe.instructions,
        nutritionInfo: newRecipe.nutritionInfo,
        cuisineType: newRecipe.cuisineType,
        dietaryTags: newRecipe.dietaryTags,
        prepTimeMins: newRecipe.prepTimeMins,
        cookTimeMins: newRecipe.cookTimeMins,
        servings: newRecipe.servings,
        imageUrl: newRecipe.imageUrl ?? null,
      },
    ]);

    // Update the day's meal slot
    await this.repo.updateDayMeal(planId, dayOfWeek, mealType, newRecipe.id);

    return toRecipeDto(newRecipe);
  }

  /**
   * Aggregates all ingredients from the active plan, merges duplicates,
   * and groups them by category.
   */
  async getShoppingList(userId: string): Promise<ShoppingListGroup[]> {
    const plan = await this.repo.findActiveWithDays(userId);
    if (!plan) return [];

    // Collect all recipe IDs
    type MealSlotJson = { type: string; recipeId: string };
    const allMeals = plan.days.flatMap((d: { meals: unknown }) => d.meals as MealSlotJson[]);
    const uniqueIds = [...new Set(allMeals.map((m) => m.recipeId))];
    const recipes = await this.repo.findRecipesByIds(uniqueIds);

    // Aggregate ingredients
    const merged = new Map<string, { quantity: number; unit: string; category: string }>();

    for (const recipe of recipes) {
      const ingredients = recipe.ingredients as Ingredient[];
      for (const ing of ingredients) {
        const key = ing.name.toLowerCase().trim();
        const existing = merged.get(key);
        if (existing && existing.unit === ing.unit) {
          existing.quantity += ing.quantity;
        } else {
          merged.set(key, {
            quantity: ing.quantity,
            unit: ing.unit,
            category: inferCategory(ing.name),
          });
        }
      }
    }

    // Group by category
    const grouped = new Map<string, ShoppingListItem[]>();
    for (const [name, data] of merged) {
      const { category, quantity, unit } = data;
      const items = grouped.get(category) ?? [];
      items.push({ name, quantity, unit, category });
      grouped.set(category, items);
    }

    const CATEGORY_ORDER = ['Produce', 'Proteins', 'Dairy', 'Grains & Pantry', 'Other'];
    return CATEGORY_ORDER.filter((c) => grouped.has(c)).map((c) => ({
      category: c,
      items: grouped.get(c)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const mealPlanService = new MealPlanService(mealPlanRepository);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function toRecipeDto(r: RecipeData): RecipeDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    ingredients: r.ingredients,
    instructions: r.instructions,
    nutritionInfo: r.nutritionInfo,
    cuisineType: r.cuisineType,
    dietaryTags: r.dietaryTags,
    prepTimeMins: r.prepTimeMins,
    cookTimeMins: r.cookTimeMins,
    servings: r.servings,
    imageUrl: r.imageUrl,
  };
}

// ─── Shopping list helper ──────────────────────────────────────────────────────

function inferCategory(ingredientName: string): string {
  const lower = ingredientName.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) return category;
  }
  return 'Other';
}

// Converts a Prisma Recipe row (with JSON fields) to a RecipeDto
function rowToRecipeDto(row: {
  id: string;
  name: string;
  description: string;
  ingredients: unknown;
  instructions: string[];
  nutritionInfo: unknown;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
}): RecipeDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients as Ingredient[],
    instructions: row.instructions,
    nutritionInfo: row.nutritionInfo as NutritionInfo,
    cuisineType: row.cuisineType,
    dietaryTags: row.dietaryTags,
    prepTimeMins: row.prepTimeMins,
    cookTimeMins: row.cookTimeMins,
    servings: row.servings,
    imageUrl: row.imageUrl,
  };
}
