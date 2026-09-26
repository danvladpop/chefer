import type { MealPlan, MealPlanDay, Prisma, Recipe } from '@prisma/client';
import { MealPlanOrigin, MealPlanStatus } from '@prisma/client';
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

/**
 * One stored plan slot (MealPlanDay.meals Json). `leftoverOf` and `portion`
 * are optional and additive — older rows and clients simply lack them.
 */
export type PlanMealSlotJson = {
  type: string;
  recipeId: string;
  /** F3 leftovers: source-day name ("Tuesday"). */
  leftoverOf?: string;
  /**
   * P1-1: portion multiplier of one recipe serving (0.75–2, quarter steps);
   * absent = 1×. Set by the free curated planner so days meet the targets.
   */
  portion?: number;
};

export interface CreateMealPlanData {
  userId: string;
  weekStartDate: Date;
  days: {
    dayOfWeek: number;
    meals: PlanMealSlotJson[];
  }[];
  recipeIds: string[]; // ids already persisted
  /**
   * Plan whose shopping check-offs and custom items the new plan inherits.
   * Defaults to the same-week active plan being replaced (regenerate, follow
   * a template); restore passes the plan it brings back.
   */
  carryShoppingFromPlanId?: string | undefined;
  /** How the plan came to exist (default USER) — see MealPlanOrigin. */
  origin?: MealPlanOrigin | undefined;
}

export interface IMealPlanRepository {
  upsertRecipes(recipes: CreateRecipeData[]): Promise<void>;
  findRecipesByIds(ids: string[]): Promise<Recipe[]>;
  findRecipeById(id: string): Promise<Recipe | null>;
  /** True when any of the user's plans or templates has a slot pointing at the recipe. */
  isRecipeInUserPlans(userId: string, recipeId: string): Promise<boolean>;
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
    /** The new slot's portion; omitted = the recipe as written (1×). */
    portion?: number,
  ): Promise<void>;
  /** True when the plan's shopping list has ticks or custom items. */
  hasShoppingProgress(planId: string): Promise<boolean>;
  findAllByUserId(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<(MealPlan & { days: MealPlanDay[] })[]>;
  findByIdForUser(
    userId: string,
    planId: string,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  findByWeekStart(
    userId: string,
    weekStart: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  findLatestWithDaysBefore(
    userId: string,
    before: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  createTemplate(
    userId: string,
    name: string,
    days: { dayOfWeek: number; meals: PlanMealSlotJson[] }[],
  ): Promise<MealPlan>;
  findTemplates(userId: string): Promise<(MealPlan & { days: MealPlanDay[] })[]>;
  findTemplateById(
    userId: string,
    templateId: string,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  countTemplates(userId: string): Promise<number>;
  renameTemplate(userId: string, templateId: string, name: string): Promise<void>;
  deleteTemplate(userId: string, templateId: string): Promise<void>;
  setFollowedTemplate(userId: string, templateId: string | null): Promise<void>;
  findFollowedTemplate(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
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
            // Same dish (name unchanged): imageUrl/imageStatus are NOT touched
            // for AI recipes — the worker owns them and the existing image
            // stays valid. CURATED recipes are the exception: their images
            // ship with the fixture, so a fixture image fix must reach the
            // stored row (a dead stock URL was unfixable otherwise —
            // prod-followups #5). Different dish under a colliding ID: the
            // stored image is wrong — apply the caller's or reset to PENDING.
            ...(nameChanged || (r.source === 'CURATED' && r.imageUrl)
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

  async isRecipeInUserPlans(userId: string, recipeId: string): Promise<boolean> {
    // `meals` is a JSON array of { type, recipeId } — array_contains maps to
    // jsonb @>, which matches an element carrying this recipeId.
    const hit = await prisma.mealPlanDay.findFirst({
      where: { mealPlan: { userId }, meals: { array_contains: [{ recipeId }] } },
      select: { id: true },
    });
    return hit !== null;
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
      const sameWeekActive = {
        userId,
        status: MealPlanStatus.ACTIVE,
        weekStartDate,
        isTemplate: false,
      };
      const carryFromId =
        data.carryShoppingFromPlanId ??
        (
          await tx.mealPlan.findFirst({
            where: sameWeekActive,
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
        )?.id;

      // Archive only plans for the same week (same weekStartDate), not all active plans.
      await tx.mealPlan.updateMany({
        where: sameWeekActive,
        data: { status: MealPlanStatus.ARCHIVED },
      });

      // Create the new plan with its days
      const plan = await tx.mealPlan.create({
        data: {
          userId,
          weekStartDate,
          status: MealPlanStatus.ACTIVE,
          origin: data.origin ?? MealPlanOrigin.USER,
          days: {
            create: days.map((d) => ({
              dayOfWeek: d.dayOfWeek,
              meals: d.meals,
            })),
          },
        },
      });

      // Shopping state is keyed by planId, so a new plan used to start with no
      // ticks and no custom items (audit F-SHOP-2-1). Carry both over as a bare
      // row (aiGenerated=false: the list itself is re-derived for the new plan).
      if (carryFromId) {
        const previous = await tx.shoppingList.findUnique({ where: { planId: carryFromId } });
        const custom = previous?.customItems as unknown[] | null | undefined;
        if (previous && (previous.checkedKeys.length > 0 || (custom?.length ?? 0) > 0)) {
          await tx.shoppingList.create({
            data: {
              planId: plan.id,
              items: [],
              aiGenerated: false,
              checkedKeys: previous.checkedKeys,
              customItems: previous.customItems ?? [],
            },
          });
        }
      }
      return plan;
    });
  }

  async findActiveWithDays(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return prisma.mealPlan.findFirst({
      where: { userId, status: MealPlanStatus.ACTIVE, isTemplate: false },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async archiveOldPlans(userId: string): Promise<void> {
    await prisma.mealPlan.updateMany({
      where: { userId, status: MealPlanStatus.ACTIVE, isTemplate: false },
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
    portion?: number,
  ): Promise<void> {
    const day = await prisma.mealPlanDay.findFirst({
      where: { mealPlanId: planId, dayOfWeek },
    });
    if (!day) throw new Error(`Day ${dayOfWeek} not found in plan ${planId}`);

    // A different dish drops the old slot's portion unless the caller sized
    // the new one (P1-1): 1.5× of the old recipe means nothing for the new.
    const meals = day.meals as unknown as PlanMealSlotJson[];
    const updated = meals.map((m) => {
      if (m.type !== mealType) return m;
      const { portion: _old, ...rest } = m;
      return {
        ...rest,
        recipeId: newRecipeId,
        ...(portion !== undefined && portion !== 1 && { portion }),
      };
    });

    await prisma.mealPlanDay.update({
      where: { id: day.id },
      data: { meals: updated },
    });
    // An edited copy is the user's week now: the Sunday worker must not
    // replace it (audit F-PLAN-4-2).
    await prisma.mealPlan.updateMany({
      where: { id: planId, origin: MealPlanOrigin.CARRY_FORWARD },
      data: { origin: MealPlanOrigin.USER },
    });
  }

  async hasShoppingProgress(planId: string): Promise<boolean> {
    const list = await prisma.shoppingList.findUnique({
      where: { planId },
      select: { checkedKeys: true, customItems: true },
    });
    if (!list) return false;
    const custom = list.customItems as unknown[] | null;
    return list.checkedKeys.length > 0 || (custom?.length ?? 0) > 0;
  }

  async findAllByUserId(
    userId: string,
    limit = 10,
    offset = 0,
  ): Promise<(MealPlan & { days: MealPlanDay[] })[]> {
    return prisma.mealPlan.findMany({
      where: { userId, isTemplate: false },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
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
      where: { userId, isTemplate: false, weekStartDate: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: 'desc' },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }

  /**
   * The user's most recent plan that started strictly before the given day —
   * the carry-forward source when a new week has no plan of its own. Only
   * ACTIVE plans count: an archived plan was replaced, so it is not what the
   * user is currently following.
   */
  async findLatestWithDaysBefore(
    userId: string,
    before: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    const dayStart = new Date(before);
    dayStart.setHours(0, 0, 0, 0);

    return prisma.mealPlan.findFirst({
      where: {
        userId,
        status: MealPlanStatus.ACTIVE,
        isTemplate: false,
        weekStartDate: { lt: dayStart },
      },
      orderBy: { weekStartDate: 'desc' },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }

  // ─── Week templates ("My weeks") ────────────────────────────────────────────
  // Saved, named weeks the user rotates through. isTemplate=true rows are
  // excluded from every week/active/history query above; weekStartDate is
  // informational (creation time). The 4-template cap lives in the service.

  async createTemplate(
    userId: string,
    name: string,
    days: { dayOfWeek: number; meals: PlanMealSlotJson[] }[],
  ): Promise<MealPlan> {
    return prisma.mealPlan.create({
      data: {
        userId,
        name,
        isTemplate: true,
        status: MealPlanStatus.DRAFT,
        weekStartDate: new Date(),
        days: { create: days.map((d) => ({ dayOfWeek: d.dayOfWeek, meals: d.meals })) },
      },
    });
  }

  async findTemplates(userId: string): Promise<(MealPlan & { days: MealPlanDay[] })[]> {
    return prisma.mealPlan.findMany({
      where: { userId, isTemplate: true },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findTemplateById(
    userId: string,
    templateId: string,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return prisma.mealPlan.findFirst({
      where: { id: templateId, userId, isTemplate: true },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }

  async countTemplates(userId: string): Promise<number> {
    return prisma.mealPlan.count({ where: { userId, isTemplate: true } });
  }

  async renameTemplate(userId: string, templateId: string, name: string): Promise<void> {
    await prisma.mealPlan.updateMany({
      where: { id: templateId, userId, isTemplate: true },
      data: { name },
    });
  }

  async deleteTemplate(userId: string, templateId: string): Promise<void> {
    await prisma.mealPlan.deleteMany({
      where: { id: templateId, userId, isTemplate: true },
    });
  }

  /** Marks one template as followed (or none) — at most one per user. */
  async setFollowedTemplate(userId: string, templateId: string | null): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.mealPlan.updateMany({
        where: { userId, isTemplate: true, isFollowed: true },
        data: { isFollowed: false },
      });
      if (templateId) {
        await tx.mealPlan.updateMany({
          where: { id: templateId, userId, isTemplate: true },
          data: { isFollowed: true },
        });
      }
    });
  }

  async findFollowedTemplate(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return prisma.mealPlan.findFirst({
      where: { userId, isTemplate: true, isFollowed: true },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }
}

export const mealPlanRepository = new MealPlanRepository();
