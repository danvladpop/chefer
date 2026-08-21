import type { MealPlan, MealPlanDay, Prisma, Recipe } from '@prisma/client';
import { MealPlanStatus } from '@prisma/client';
import { prisma } from '../client';

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
  imageStatus?: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  imageRetries?: number;
  imagePriority?: number; // lower = generated first (0 = today's meals)
  source?: 'AI' | 'MANUAL' | 'CURATED';
  creatorId?: string | null;
}

export interface CreateMealPlanData {
  userId: string;
  weekStartDate: Date;
  days: {
    dayOfWeek: number;
    meals: { type: string; recipeId: string }[];
  }[];
  recipeIds: string[]; // ids already persisted
}

export interface IMealPlanRepository {
  upsertRecipes(recipes: CreateRecipeData[]): Promise<void>;
  findRecipesByIds(ids: string[]): Promise<Recipe[]>;
  findRecipeById(id: string): Promise<Recipe | null>;
  findRecipeImagesByNames(names: string[]): Promise<Map<string, string>>;
  findRecipesBySource(source: 'AI' | 'MANUAL' | 'CURATED'): Promise<Recipe[]>;
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
  findByWeekStart(
    userId: string,
    weekStart: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class MealPlanRepository implements IMealPlanRepository {
  /**
   * Upserts a batch of recipes. Uses the AI fixture id as the primary key so
   * repeated plan generations don't create duplicate recipe rows.
   *
   * LLM-generated IDs are name-derived slugs, so the same ID can resurface
   * months later attached to a DIFFERENT dish (or the same dish with a stale
   * image from an earlier pipeline). When the stored name differs from the
   * incoming one, the old image no longer belongs to this recipe — reset it
   * (or apply the caller-resolved image) instead of preserving it.
   */
  async upsertRecipes(recipes: CreateRecipeData[]): Promise<void> {
    const existing = await prisma.recipe.findMany({
      where: { id: { in: recipes.map((r) => r.id) } },
      select: { id: true, name: true },
    });
    const existingNames = new Map(existing.map((e) => [e.id, e.name]));

    await prisma.$transaction(
      recipes.map((r) => {
        const storedName = existingNames.get(r.id);
        const nameChanged =
          storedName !== undefined &&
          storedName.toLowerCase().trim() !== r.name.toLowerCase().trim();

        return prisma.recipe.upsert({
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
            imageStatus: r.imageStatus ?? 'PENDING',
            imageRetries: 0,
            imagePriority: r.imagePriority ?? 100,
            source: r.source ?? 'AI',
            creatorId: r.creatorId ?? null,
          },
          update: {
            name: r.name,
            description: r.description,
            imagePriority: r.imagePriority ?? 100,
            // Same dish (name unchanged): imageUrl/imageStatus are NOT touched —
            // the worker owns them and the existing image stays valid.
            // Different dish under a colliding ID: the stored image is wrong —
            // apply the caller-resolved image or reset to PENDING.
            ...(nameChanged
              ? {
                  imageUrl: r.imageUrl ?? null,
                  imageStatus: r.imageStatus ?? 'PENDING',
                  imageRetries: 0,
                }
              : {}),
          },
        });
      }),
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
   * Returns a map of lowercased recipe name → imageUrl for recipes that already
   * have a completed image. Lets a fresh plan generation reuse images for dishes
   * that were generated before (LLM recipe IDs differ between runs, names don't).
   */
  async findRecipeImagesByNames(names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) return new Map();
    const rows = await prisma.recipe.findMany({
      where: {
        name: { in: names, mode: 'insensitive' },
        imageStatus: 'DONE',
        imageUrl: { not: null },
      },
      select: { name: true, imageUrl: true },
      orderBy: { createdAt: 'desc' },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      const key = row.name.toLowerCase();
      if (!map.has(key) && row.imageUrl) map.set(key, row.imageUrl);
    }
    return map;
  }

  async findRecipesBySource(source: 'AI' | 'MANUAL' | 'CURATED'): Promise<Recipe[]> {
    return prisma.recipe.findMany({ where: { source } });
  }

  /**
   * Archives any existing ACTIVE plan for the same week, then creates a new
   * ACTIVE plan with its days inside a single transaction.
   * Plans for other weeks are left untouched, so current-week and next-week
   * plans can coexist independently.
   */
  async createPlan(data: CreateMealPlanData): Promise<MealPlan> {
    const { userId, weekStartDate, days } = data;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Archive only plans for the same week (same weekStartDate), not all active plans.
      await tx.mealPlan.updateMany({
        where: { userId, status: MealPlanStatus.ACTIVE, weekStartDate },
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

    const meals = day.meals as { type: string; recipeId: string }[];
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

  /**
   * The plan whose weekStartDate falls on the given calendar day (compared as
   * a same-day range so stored times don't matter). Newest first — matches the
   * previous scan-and-filter behaviour, where regeneration archives the old
   * plan and the newest one is the one to show.
   */
  async findByWeekStart(
    userId: string,
    weekStart: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    const dayStart = new Date(weekStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return prisma.mealPlan.findFirst({
      where: { userId, weekStartDate: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: 'desc' },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }
}

export const mealPlanRepository = new MealPlanRepository();
