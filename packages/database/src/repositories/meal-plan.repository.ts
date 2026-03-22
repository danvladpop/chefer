import type { MealPlan, MealPlanDay, Prisma, Recipe } from '@prisma/client';
import { MealPlanStatus } from '@prisma/client';
import { prisma } from '../client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateRecipeData {
  id: string; // use AI fixture id or generated cuid
  name: string;
  description: string;
  ingredients: unknown; // JSON
  instructions: string[];
  nutritionInfo: unknown; // JSON
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl?: string | null;
}

export interface CreateMealPlanData {
  userId: string;
  weekStartDate: Date;
  days: Array<{
    dayOfWeek: number;
    meals: Array<{ type: string; recipeId: string }>;
  }>;
  recipeIds: string[]; // ids already persisted
}

export interface IMealPlanRepository {
  upsertRecipes(recipes: CreateRecipeData[]): Promise<void>;
  findRecipesByIds(ids: string[]): Promise<Recipe[]>;
  findRecipeById(id: string): Promise<Recipe | null>;
  createPlan(data: CreateMealPlanData): Promise<MealPlan>;
  findActiveWithDays(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  archiveOldPlans(userId: string): Promise<void>;
  updateDayMeal(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    newRecipeId: string,
  ): Promise<void>;
  findAllByUserId(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<(MealPlan & { days: MealPlanDay[] })[]>;
  restorePlan(userId: string, planId: string): Promise<void>;
  findByIdForUser(
    userId: string,
    planId: string,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class MealPlanRepository implements IMealPlanRepository {
  /**
   * Upserts a batch of recipes. Uses the AI fixture id as the primary key so
   * repeated plan generations don't create duplicate recipe rows.
   */
  async upsertRecipes(recipes: CreateRecipeData[]): Promise<void> {
    await prisma.$transaction(
      recipes.map((r) =>
        prisma.recipe.upsert({
          where: { id: r.id },
          create: {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredients: r.ingredients as Prisma.InputJsonValue,
            instructions: r.instructions,
            nutritionInfo: r.nutritionInfo as Prisma.InputJsonValue,
            cuisineType: r.cuisineType,
            dietaryTags: r.dietaryTags,
            prepTimeMins: r.prepTimeMins,
            cookTimeMins: r.cookTimeMins,
            servings: r.servings,
            imageUrl: r.imageUrl ?? null,
          },
          update: {
            name: r.name,
            description: r.description,
          },
        }),
      ),
    );
  }

  async findRecipesByIds(ids: string[]): Promise<Recipe[]> {
    if (ids.length === 0) return [];
    return prisma.recipe.findMany({ where: { id: { in: ids } } });
  }

  async findRecipeById(id: string): Promise<Recipe | null> {
    return prisma.recipe.findUnique({ where: { id } });
  }

  /**
   * Archives all existing plans for the user then creates a new ACTIVE plan
   * with its days inside a single transaction.
   */
  async createPlan(data: CreateMealPlanData): Promise<MealPlan> {
    const { userId, weekStartDate, days } = data;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Archive all previous plans
      await tx.mealPlan.updateMany({
        where: { userId, status: MealPlanStatus.ACTIVE },
        data: { status: MealPlanStatus.ARCHIVED },
      });

      // Create the new plan with its days
      return tx.mealPlan.create({
        data: {
          userId,
          weekStartDate,
          status: MealPlanStatus.ACTIVE,
          days: {
            create: days.map((d) => ({
              dayOfWeek: d.dayOfWeek,
              meals: d.meals,
            })),
          },
        },
      });
    });
  }

  async findActiveWithDays(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return prisma.mealPlan.findFirst({
      where: { userId, status: MealPlanStatus.ACTIVE },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async archiveOldPlans(userId: string): Promise<void> {
    await prisma.mealPlan.updateMany({
      where: { userId, status: MealPlanStatus.ACTIVE },
      data: { status: MealPlanStatus.ARCHIVED },
    });
  }

  /**
   * Replaces a single meal slot in a day's JSON with a new recipe ID.
   */
  async updateDayMeal(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    newRecipeId: string,
  ): Promise<void> {
    const day = await prisma.mealPlanDay.findFirst({
      where: { mealPlanId: planId, dayOfWeek },
    });
    if (!day) throw new Error(`Day ${dayOfWeek} not found in plan ${planId}`);

    const meals = day.meals as Array<{ type: string; recipeId: string }>;
    const updated = meals.map((m) => (m.type === mealType ? { ...m, recipeId: newRecipeId } : m));

    await prisma.mealPlanDay.update({
      where: { id: day.id },
      data: { meals: updated },
    });
  }

  async findAllByUserId(
    userId: string,
    limit = 10,
    offset = 0,
  ): Promise<(MealPlan & { days: MealPlanDay[] })[]> {
    return prisma.mealPlan.findMany({
      where: { userId },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async restorePlan(userId: string, planId: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.mealPlan.updateMany({
        where: { userId, status: MealPlanStatus.ACTIVE },
        data: { status: MealPlanStatus.ARCHIVED },
      });
      await tx.mealPlan.update({
        where: { id: planId },
        data: { status: MealPlanStatus.ACTIVE },
      });
    });
  }

  async findByIdForUser(
    userId: string,
    planId: string,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return prisma.mealPlan.findFirst({
      where: { id: planId, userId },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }
}

export const mealPlanRepository = new MealPlanRepository();
