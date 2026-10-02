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
  /**
   * §2.3, T-07.4: the user chose this exact dish (Replace, an own recipe, or
   * `Keep this meal`) — the card shows `Your pick`, and Regenerate keeps it
   * by default (`generate({ keepPinned: true })`). Absent/false = not pinned.
   */
  pinned?: boolean;
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
  /**
   * §T-08.3: `previousPlanId` is the same-week plan this call archived (or
   * `carryShoppingFromPlanId` when the caller supplied one), `null` when
   * there wasn't one — lets `generate`/regenerate offer an `Undo` that calls
   * the existing `restore(previousPlanId)`.
   */
  createPlan(data: CreateMealPlanData): Promise<MealPlan & { previousPlanId: string | null }>;
  /**
   * The newest ACTIVE plan of ANY week.
   * @deprecated Wrong for any "this week" / "the plan for date X" read — it
   * returns next week's plan once next week has been opened (UX-FOOD-02).
   * Use `findForWeek`, via `planForDate` / `planForThisWeek` in the API.
   */
  findActiveWithDays(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  /**
   * The plan whose week matches `weekStart` (B-13, T-00.15) — unlike
   * `findActiveWithDays`, which returns the newest ACTIVE plan across ANY
   * week and can leak a later week's plan into a "this week" view once that
   * later week becomes the sole active plan. `getActive`, `getForWeek`
   * offset 0, `dashboard.summary` and `shoppingList.getForWeek` all read
   * this instead. Same match as `findByWeekStart` (see there for the
   * same-calendar-day comparison).
   */
  findForWeek(
    userId: string,
    weekStart: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  archiveOldPlans(userId: string): Promise<void>;
  updateDayMeal(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    newRecipeId: string,
    /** The new slot's portion; omitted = the recipe as written (1×). */
    portion?: number,
    /**
     * The slot's index in `day.meals` — a curated day can hold two snacks.
     * Omitted = the first slot of `mealType`. Only that one slot changes.
     */
    slotIndex?: number,
    /** T-07.4: explicitly sets the new slot's `pinned` flag (absent = not pinned). */
    pinned?: boolean,
  ): Promise<void>;
  /**
   * T-07.4: toggles `pinned` on an existing slot without touching its recipe
   * or portion. No-op (resolves) when the slot doesn't exist.
   */
  setSlotPinned(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    slotIndex: number | null,
    pinned: boolean,
  ): Promise<void>;
  /**
   * T-11.3: overwrites one day's slot portions in place (by index, same
   * order as the day's `meals`), leaving recipe, `leftoverOf` and `pinned`
   * untouched. A `portions[i]` of `undefined` leaves that slot's portion
   * unchanged. No-op when the day doesn't exist.
   */
  setDayPortions(
    planId: string,
    dayOfWeek: number,
    portions: (number | undefined)[],
  ): Promise<void>;
  /**
   * §wave-1 planDay: overwrites one day's `meals` array in full — unlike
   * `updateDayMeal`/`setDayPortions`, which patch one slot or a portions
   * vector index-aligned to the day's CURRENT meals, this is for a day that
   * had none. Every other day is untouched. No-op when the day doesn't
   * exist in this plan.
   */
  setDayMeals(planId: string, dayOfWeek: number, meals: PlanMealSlotJson[]): Promise<void>;
  /**
   * Following (`friends.addRecipeToWeek`, plan §2.4): appends one slot to the
   * day — creating the day row when the plan has none for it — and returns
   * the new slot's index. Appending never moves an existing slot's index.
   * SERIALIZABLE read-modify-write of the day's JSON, retried on conflict.
   */
  appendDayMeal(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    recipeId: string,
    opts?: { pinned?: boolean },
  ): Promise<number>;
  /**
   * Following Undo (`friends.undoAddToWeek`): removes the slot at `slotIndex`
   * only if it still holds `recipeId` (and `mealType`, when given). Returns
   * whether a slot was removed — a stale or repeated Undo is a no-op.
   */
  removeDayMealIfMatches(
    planId: string,
    dayOfWeek: number,
    slotIndex: number,
    recipeId: string,
    mealType?: string,
  ): Promise<boolean>;
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

const DAY_WRITE_ATTEMPTS = 5;

/**
 * A day's `meals` JSON is read-modify-written; two concurrent writers would
 * otherwise both read the same array and the second write would drop the
 * first one's slot. SERIALIZABLE aborts the loser (P2034) and it retries on
 * top of the winner's result (the daily-log `mutateDay` pattern).
 */
async function serializableDayWrite<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (err) {
      const conflict =
        typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
      if (!conflict || attempt >= DAY_WRITE_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 25));
    }
  }
}

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
            // The fixture is authoritative for CURATED servings too: their
            // catalog lines are computed per fixture serving, so the row must
            // agree (plan-ingredient-catalog §6.2).
            ...(r.source === 'CURATED' ? { servings: r.servings } : {}),
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
  async createPlan(
    data: CreateMealPlanData,
  ): Promise<MealPlan & { previousPlanId: string | null }> {
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
      return { ...plan, previousPlanId: carryFromId ?? null };
    });
  }

  async findActiveWithDays(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return prisma.mealPlan.findFirst({
      where: { userId, status: MealPlanStatus.ACTIVE, isTemplate: false },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * B-13 (T-00.15): "this week", matched by calendar week rather than by
   * whichever plan happens to be ACTIVE (see the interface doc comment).
   * Delegates to findByWeekStart, which already does this same-day
   * comparison — kept as its own named method since callers reason about it
   * as "the plan for this week", not "the plan whose weekStartDate is X".
   */
  async findForWeek(
    userId: string,
    weekStart: Date,
  ): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    return this.findByWeekStart(userId, weekStart);
  }

  async archiveOldPlans(userId: string): Promise<void> {
    await prisma.mealPlan.updateMany({
      where: { userId, status: MealPlanStatus.ACTIVE, isTemplate: false },
      data: { status: MealPlanStatus.ARCHIVED },
    });
  }

  /**
   * Replaces a single meal slot in a day's JSON with a new recipe ID: the
   * slot at `slotIndex` when given (its type must be `mealType`), else the
   * first slot of `mealType`. It used to rewrite EVERY slot of the type, so
   * swapping one snack on a two-snack day turned both into the same dish.
   */
  async updateDayMeal(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    newRecipeId: string,
    portion?: number,
    slotIndex?: number,
    pinned?: boolean,
  ): Promise<void> {
    const day = await prisma.mealPlanDay.findFirst({
      where: { mealPlanId: planId, dayOfWeek },
    });
    if (!day) throw new Error(`Day ${dayOfWeek} not found in plan ${planId}`);

    // A different dish drops the old slot's portion and pinned flag unless
    // the caller explicitly sets a new one (P1-1, T-07.4): 1.5× — or "Your
    // pick" — of the old recipe means nothing for the new one.
    const meals = day.meals as unknown as PlanMealSlotJson[];
    const target =
      slotIndex !== undefined
        ? meals[slotIndex]?.type === mealType
          ? slotIndex
          : -1
        : meals.findIndex((m) => m.type === mealType);
    if (target === -1) return;
    const updated = meals.map((m, i) => {
      if (i !== target) return m;
      const { portion: _old, pinned: _oldPinned, ...rest } = m;
      return {
        ...rest,
        recipeId: newRecipeId,
        ...(portion !== undefined && portion !== 1 && { portion }),
        ...(pinned && { pinned: true }),
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

  /** T-07.4: toggles `pinned` on an existing slot without touching its recipe. */
  async setSlotPinned(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    slotIndex: number | null,
    pinned: boolean,
  ): Promise<void> {
    const day = await prisma.mealPlanDay.findFirst({
      where: { mealPlanId: planId, dayOfWeek },
    });
    if (!day) return;

    const meals = day.meals as unknown as PlanMealSlotJson[];
    const target =
      slotIndex !== null
        ? meals[slotIndex]?.type === mealType
          ? slotIndex
          : -1
        : meals.findIndex((m) => m.type === mealType);
    if (target === -1) return;

    const updated = meals.map((m, i) => {
      if (i !== target) return m;
      if (!pinned) {
        const { pinned: _drop, ...rest } = m;
        return rest;
      }
      return { ...m, pinned: true };
    });

    await prisma.mealPlanDay.update({
      where: { id: day.id },
      data: { meals: updated },
    });
  }

  /** T-11.3: overwrites one day's slot portions in place, by index. */
  async setDayPortions(
    planId: string,
    dayOfWeek: number,
    portions: (number | undefined)[],
  ): Promise<void> {
    const day = await prisma.mealPlanDay.findFirst({
      where: { mealPlanId: planId, dayOfWeek },
    });
    if (!day) return;

    const meals = day.meals as unknown as PlanMealSlotJson[];
    const updated = meals.map((m, i) => {
      const portion = portions[i];
      if (portion === undefined) return m;
      const { portion: _old, ...rest } = m;
      return { ...rest, ...(portion !== 1 && { portion }) };
    });

    await prisma.mealPlanDay.update({
      where: { id: day.id },
      data: { meals: updated },
    });
  }

  /** §wave-1 planDay: overwrites one day's `meals` array in full, by day. */
  async setDayMeals(planId: string, dayOfWeek: number, meals: PlanMealSlotJson[]): Promise<void> {
    const day = await prisma.mealPlanDay.findFirst({
      where: { mealPlanId: planId, dayOfWeek },
    });
    if (!day) return;

    await prisma.mealPlanDay.update({
      where: { id: day.id },
      data: { meals },
    });
    // An edited copy is the user's week now: the Sunday worker must not
    // replace it (audit F-PLAN-4-2), same as updateDayMeal/setSlotPinned.
    await prisma.mealPlan.updateMany({
      where: { id: planId, origin: MealPlanOrigin.CARRY_FORWARD },
      data: { origin: MealPlanOrigin.USER },
    });
  }

  async appendDayMeal(
    planId: string,
    dayOfWeek: number,
    mealType: string,
    recipeId: string,
    opts: { pinned?: boolean } = {},
  ): Promise<number> {
    const slot: PlanMealSlotJson = {
      type: mealType,
      recipeId,
      ...(opts.pinned && { pinned: true }),
    };
    const index = await serializableDayWrite(async (tx) => {
      const day = await tx.mealPlanDay.findFirst({ where: { mealPlanId: planId, dayOfWeek } });
      if (!day) {
        await tx.mealPlanDay.create({
          data: { mealPlanId: planId, dayOfWeek, meals: [slot] as Prisma.InputJsonValue },
        });
        return 0;
      }
      const meals = (day.meals as unknown as PlanMealSlotJson[] | null) ?? [];
      await tx.mealPlanDay.update({
        where: { id: day.id },
        data: { meals: [...meals, slot] as Prisma.InputJsonValue },
      });
      return meals.length;
    });
    // An edited copy is the user's week now (audit F-PLAN-4-2), as updateDayMeal.
    await prisma.mealPlan.updateMany({
      where: { id: planId, origin: MealPlanOrigin.CARRY_FORWARD },
      data: { origin: MealPlanOrigin.USER },
    });
    return index;
  }

  async removeDayMealIfMatches(
    planId: string,
    dayOfWeek: number,
    slotIndex: number,
    recipeId: string,
    mealType?: string,
  ): Promise<boolean> {
    return serializableDayWrite(async (tx) => {
      const day = await tx.mealPlanDay.findFirst({ where: { mealPlanId: planId, dayOfWeek } });
      if (!day) return false;
      const meals = (day.meals as unknown as PlanMealSlotJson[] | null) ?? [];
      const slot: PlanMealSlotJson | undefined = meals[slotIndex];
      if (slot?.recipeId !== recipeId) return false;
      if (mealType !== undefined && slot.type !== mealType) return false;
      await tx.mealPlanDay.update({
        where: { id: day.id },
        data: { meals: meals.filter((_, i) => i !== slotIndex) },
      });
      return true;
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
