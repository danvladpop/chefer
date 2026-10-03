import type { FavouriteRecipe, Prisma, Recipe } from '@prisma/client';
import { RecipeSource } from '@prisma/client';
import { prisma } from '../client';
import {
  recipeLineRepository,
  type RecipeLineWrite,
  type RecipeNutritionWrite,
} from './recipe-line.repository';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FavouriteRecipeWithRecipe = FavouriteRecipe & { recipe: Recipe };

export interface CreateManualRecipeData {
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
  /** Provenance of imported recipes (Cheferize F5) — never rendered as a republished page. */
  sourceUrl?: string | null;
  /**
   * Following (PRD §13): set only on a viewer's private copy of another
   * user's recipe (`findOrCreateCopy`). Never taken from client input.
   */
  originRecipeId?: string | null;
  originCreatorId?: string | null;
}

/**
 * Catalog lines for a manual save (plan-ingredient-catalog §3, §6.2): written
 * with the recipe in ONE transaction; they set `ingredients` (the Json mirror)
 * and the nutrition columns, overriding those fields of the data.
 */
export interface ManualRecipeLines {
  lines: RecipeLineWrite[];
  nutrition: RecipeNutritionWrite;
}

/** The name parts a recipe's creator / origin creator is shown with (Following). */
export type RecipePersonName = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
};

/**
 * A `findAllRecipesForUser` row: the full recipe plus the people it is
 * attributed to (Following: `By {name}` on someone else's recipe, `From
 * {first}` on your copy). The service maps these to optional DTO fields and
 * strips the raw relations, so old clients see the same row keys.
 */
export type RecipeWithPeople = Recipe & {
  creator: RecipePersonName | null;
  originCreator: RecipePersonName | null;
};

/** `findOrCreateCopy`'s result: the viewer's copy, and whether this call made it. */
export type RecipeCopyResult = { recipe: Recipe; created: boolean };

export interface IFavouriteRecipeRepository {
  findByUserId(userId: string, limit?: number): Promise<FavouriteRecipeWithRecipe[]>;
  isSaved(userId: string, recipeId: string): Promise<boolean>;
  findFavourite(userId: string, recipeId: string): Promise<FavouriteRecipe | null>;
  findSavedRecipeIds(userId: string): Promise<string[]>;
  findPinnedForNextPlan(userId: string): Promise<FavouriteRecipeWithRecipe[]>;
  clearNextPlanFlags(userId: string): Promise<void>;
  save(userId: string, recipeId: string): Promise<FavouriteRecipe>;
  remove(userId: string, recipeId: string): Promise<void>;
  toggleUseInNextPlan(
    userId: string,
    recipeId: string,
    useInNextPlan: boolean,
  ): Promise<FavouriteRecipe>;
  findAllRecipesForUser(
    userId: string,
    opts?: {
      search?: string | undefined;
      savedOnly?: boolean | undefined;
      myRecipesOnly?: boolean | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
      /**
       * Following (plan §2.4): creators whose recipes the viewer may see
       * (accepted follows sharing recipes). Their own originals (not copies)
       * that the viewer hearted join Saved/All — imported ones included,
       * auto-hidden ones too (Saved is heart-driven: a heart made before the
       * hide keeps working). Omitted/empty = today's rows exactly.
       */
      visibleCreatorIds?: string[] | undefined;
    },
  ): Promise<RecipeWithPeople[]>;
  createManualRecipe(
    userId: string,
    data: CreateManualRecipeData,
    lines?: ManualRecipeLines,
  ): Promise<Recipe>;
  /**
   * Following (PRD §13, plan §4.4): the viewer's private copy of `source`
   * (another user's MANUAL recipe) — the existing one, or a new one carrying
   * the text, ingredients, nutrition, photo URL, `sourceUrl` and origins.
   * At most one per viewer and source: there is no DB unique (plan §2.3), so
   * this is a SERIALIZABLE find-or-create that retries on P2034.
   */
  findOrCreateCopy(viewerId: string, source: Recipe): Promise<RecipeCopyResult>;
  /** Name parts for the given user ids (recipe attribution). Unknown ids are skipped. */
  findPeopleByIds(ids: string[]): Promise<RecipePersonName[]>;
  updateManualRecipe(
    userId: string,
    recipeId: string,
    data: Partial<CreateManualRecipeData>,
    lines?: ManualRecipeLines,
  ): Promise<Recipe>;
  findManualRecipeById(userId: string, recipeId: string): Promise<Recipe | null>;
  /**
   * UX-REC-04: soft-deletes the user's own MANUAL recipe (`deletedAt = now`).
   * Returns false when there is no live recipe of theirs to delete. Their
   * favourite rows for it go with it; slots in existing plans keep resolving
   * the row (a tombstone) so a plan never breaks.
   */
  softDeleteManualRecipe(userId: string, recipeId: string): Promise<boolean>;
  /** The Undo of `softDeleteManualRecipe`. False when the user has no deleted recipe by that id. */
  restoreManualRecipe(userId: string, recipeId: string): Promise<boolean>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/** Serializable find-or-create attempts before the conflict is surfaced. */
const COPY_ATTEMPTS = 6;

const PERSON_NAME = { id: true, firstName: true, lastName: true, name: true } as const;

/** `include` for `RecipeWithPeople` — name parts only, never email or anything else. */
const RECIPE_PEOPLE = {
  creator: { select: PERSON_NAME },
  originCreator: { select: PERSON_NAME },
} as const;

/** The row a manual create writes (MANUAL, owned by `userId`). */
function manualCreateData(
  userId: string,
  data: CreateManualRecipeData,
): Prisma.RecipeUncheckedCreateInput {
  return {
    name: data.name,
    description: data.description,
    ingredients: data.ingredients as Prisma.InputJsonValue,
    instructions: data.instructions,
    nutritionInfo: data.nutritionInfo as Prisma.InputJsonValue,
    cuisineType: data.cuisineType,
    dietaryTags: data.dietaryTags,
    prepTimeMins: data.prepTimeMins,
    cookTimeMins: data.cookTimeMins,
    servings: data.servings,
    imageUrl: data.imageUrl ?? null,
    sourceUrl: data.sourceUrl ?? null,
    ...(data.originRecipeId && { originRecipeId: data.originRecipeId }),
    ...(data.originCreatorId && { originCreatorId: data.originCreatorId }),
    source: RecipeSource.MANUAL,
    creatorId: userId,
  };
}

export class FavouriteRecipeRepository implements IFavouriteRecipeRepository {
  async findByUserId(userId: string, limit = 4): Promise<FavouriteRecipeWithRecipe[]> {
    return prisma.favouriteRecipe.findMany({
      where: { userId, recipe: { deletedAt: null } },
      include: { recipe: true },
      orderBy: { savedAt: 'desc' },
      take: limit,
    });
  }

  async isSaved(userId: string, recipeId: string): Promise<boolean> {
    const row = await prisma.favouriteRecipe.findUnique({
      where: { userId_recipeId: { userId, recipeId } },
    });
    return row !== null;
  }

  async findFavourite(userId: string, recipeId: string): Promise<FavouriteRecipe | null> {
    return prisma.favouriteRecipe.findUnique({
      where: { userId_recipeId: { userId, recipeId } },
    });
  }

  async findSavedRecipeIds(userId: string): Promise<string[]> {
    const rows = await prisma.favouriteRecipe.findMany({
      where: { userId },
      select: { recipeId: true },
    });
    return rows.map((r: { recipeId: string }) => r.recipeId);
  }

  /** Favourites the user pinned for their next generated plan (P1-1). */
  async findPinnedForNextPlan(userId: string): Promise<FavouriteRecipeWithRecipe[]> {
    return prisma.favouriteRecipe.findMany({
      where: { userId, useInNextPlan: true, recipe: { deletedAt: null } },
      include: { recipe: true },
      orderBy: { savedAt: 'desc' },
    });
  }

  /**
   * Resets all useInNextPlan flags after a successful generation — a pin
   * means "next plan", not "every plan forever".
   */
  async clearNextPlanFlags(userId: string): Promise<void> {
    await prisma.favouriteRecipe.updateMany({
      where: { userId, useInNextPlan: true },
      data: { useInNextPlan: false },
    });
  }

  async save(userId: string, recipeId: string): Promise<FavouriteRecipe> {
    return prisma.favouriteRecipe.upsert({
      where: { userId_recipeId: { userId, recipeId } },
      create: { userId, recipeId },
      update: {},
    });
  }

  async remove(userId: string, recipeId: string): Promise<void> {
    await prisma.favouriteRecipe.deleteMany({
      where: { userId, recipeId },
    });
  }

  async toggleUseInNextPlan(
    userId: string,
    recipeId: string,
    useInNextPlan: boolean,
  ): Promise<FavouriteRecipe> {
    return prisma.favouriteRecipe.update({
      where: { userId_recipeId: { userId, recipeId } },
      data: { useInNextPlan },
    });
  }

  /**
   * Returns all distinct recipes associated with a user's meal plans.
   * When savedOnly=true, returns only those in the user's favourites.
   * When myRecipesOnly=true, returns only recipes created by this user (source=MANUAL).
   */
  async findAllRecipesForUser(
    userId: string,
    opts: {
      search?: string | undefined;
      savedOnly?: boolean | undefined;
      myRecipesOnly?: boolean | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
      visibleCreatorIds?: string[] | undefined;
    } = {},
  ): Promise<RecipeWithPeople[]> {
    const { search, savedOnly = false, myRecipesOnly = false, cursor, limit = 20 } = opts;
    const visibleCreatorIds = opts.visibleCreatorIds ?? [];

    // Never list another user's private (MANUAL) recipe, even if it was
    // favourited by id before saves checked visibility (audit F-REC-2-2) —
    // except, with Following, the originals of people the viewer may see
    // (never their copies of someone else's recipe: no laundering, PRD §13).
    const favouriteRecipeVisible: Prisma.RecipeWhereInput[] = [
      { source: { not: RecipeSource.MANUAL } },
      { creatorId: userId },
      ...(visibleCreatorIds.length > 0
        ? [{ creatorId: { in: visibleCreatorIds }, originRecipeId: null }]
        : []),
    ];
    // UX-REC-04: a soft-deleted recipe is in no list.
    const notDeleted = { deletedAt: null } as const;

    if (myRecipesOnly) {
      return prisma.recipe.findMany({
        where: {
          creatorId: userId,
          source: RecipeSource.MANUAL,
          ...notDeleted,
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        include: RECIPE_PEOPLE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    }

    if (savedOnly) {
      const query = {
        where: {
          userId,
          recipe: {
            OR: favouriteRecipeVisible,
            ...notDeleted,
            ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
          },
        },
        include: { recipe: { include: RECIPE_PEOPLE } },
        orderBy: { savedAt: 'desc' as const },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      };
      const favourites = await prisma.favouriteRecipe.findMany(query);
      return favourites.map((f) => f.recipe);
    }

    // bug B-11: "All" = plan recipes ∪ own MANUAL recipes ∪ favourites,
    // de-duplicated. This used to be plan recipes ONLY, from an UNBOUNDED
    // scan of every plan the user ever generated — a recipe created or
    // imported but never placed in a plan, or favourited from Discover,
    // never showed up in "All" at all. Each source is now one bounded query.
    const searchFilter = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};
    const [recentPlans, ownRecipes, favourites] = await Promise.all([
      // Bounded: the last 12 weeks of plans is generous and avoids scanning
      // a long-lived account's entire history on every "All" tab open.
      prisma.mealPlan.findMany({
        where: { userId },
        orderBy: { weekStartDate: 'desc' },
        take: 12,
        select: { days: { select: { meals: true } } },
      }),
      prisma.recipe.findMany({
        where: { creatorId: userId, source: RecipeSource.MANUAL, ...notDeleted, ...searchFilter },
        include: RECIPE_PEOPLE,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.favouriteRecipe.findMany({
        where: {
          userId,
          recipe: { OR: favouriteRecipeVisible, ...notDeleted, ...searchFilter },
        },
        include: { recipe: { include: RECIPE_PEOPLE } },
        orderBy: { savedAt: 'desc' as const },
        take: 200,
      }),
    ]);

    const planRecipeIds = new Set<string>();
    for (const plan of recentPlans) {
      for (const day of plan.days) {
        const meals = day.meals as { type: string; recipeId: string }[];
        for (const m of meals) planRecipeIds.add(m.recipeId);
      }
    }
    const planRecipes =
      planRecipeIds.size > 0
        ? await prisma.recipe.findMany({
            where: { id: { in: [...planRecipeIds] }, ...notDeleted, ...searchFilter },
            include: RECIPE_PEOPLE,
            take: 200,
          })
        : [];

    const merged = new Map<string, RecipeWithPeople>();
    for (const recipe of [...planRecipes, ...ownRecipes, ...favourites.map((f) => f.recipe)]) {
      if (!merged.has(recipe.id)) merged.set(recipe.id, recipe);
    }
    let all = [...merged.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (cursor) {
      const cursorIndex = all.findIndex((r) => r.id === cursor);
      all = cursorIndex >= 0 ? all.slice(cursorIndex + 1) : all;
    }
    return all.slice(0, limit);
  }

  /**
   * Creates a new MANUAL recipe owned by the given user.
   */
  async createManualRecipe(
    userId: string,
    data: CreateManualRecipeData,
    lines?: ManualRecipeLines,
  ): Promise<Recipe> {
    if (lines) {
      return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.recipe.create({ data: manualCreateData(userId, data) });
        await recipeLineRepository.writeLines(created.id, lines.lines, lines.nutrition, tx);
        return tx.recipe.findUniqueOrThrow({ where: { id: created.id } });
      });
    }
    return prisma.recipe.create({ data: manualCreateData(userId, data) });
  }

  async findOrCreateCopy(viewerId: string, source: Recipe): Promise<RecipeCopyResult> {
    // Two concurrent "Add to my week" taps (or a tap racing a generation that
    // places the same pinned favourite) both read "no copy" and both insert —
    // the index is not unique (plan §2.3). SERIALIZABLE turns that into a
    // read/write conflict: Postgres aborts one transaction (P2034) and the
    // retry finds the winner's copy.
    for (let attempt = 1; ; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const existing = await tx.recipe.findFirst({
              where: {
                creatorId: viewerId,
                originRecipeId: source.id,
                source: RecipeSource.MANUAL,
                deletedAt: null,
              },
              orderBy: { createdAt: 'asc' },
            });
            if (existing) return { recipe: existing, created: false };
            const recipe = await tx.recipe.create({
              data: {
                name: source.name,
                description: source.description,
                ingredients: source.ingredients as Prisma.InputJsonValue,
                instructions: source.instructions,
                nutritionInfo: source.nutritionInfo as Prisma.InputJsonValue,
                cuisineType: source.cuisineType,
                dietaryTags: source.dietaryTags,
                prepTimeMins: source.prepTimeMins,
                cookTimeMins: source.cookTimeMins,
                servings: source.servings,
                imageUrl: source.imageUrl,
                // Q-F-7: an imported recipe keeps its attribution on the copy.
                sourceUrl: source.sourceUrl,
                source: RecipeSource.MANUAL,
                creatorId: viewerId,
                originRecipeId: source.id,
                originCreatorId: source.creatorId,
              },
            });
            return { recipe, created: true };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (err) {
        const conflict =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
        if (!conflict || attempt >= COPY_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 25));
      }
    }
  }

  async findPeopleByIds(ids: string[]): Promise<RecipePersonName[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    return prisma.user.findMany({ where: { id: { in: unique } }, select: PERSON_NAME });
  }

  /**
   * Fetches a MANUAL recipe by ID, verifying the user is the creator.
   */
  async findManualRecipeById(userId: string, recipeId: string): Promise<Recipe | null> {
    return prisma.recipe.findFirst({
      where: { id: recipeId, creatorId: userId, source: RecipeSource.MANUAL, deletedAt: null },
    });
  }

  async softDeleteManualRecipe(userId: string, recipeId: string): Promise<boolean> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const res = await tx.recipe.updateMany({
        where: { id: recipeId, creatorId: userId, source: RecipeSource.MANUAL, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (res.count === 0) return false;
      // The owner's own hearts/pins go; plan slots are left alone (tombstone).
      await tx.favouriteRecipe.deleteMany({ where: { userId, recipeId } });
      return true;
    });
  }

  async restoreManualRecipe(userId: string, recipeId: string): Promise<boolean> {
    const res = await prisma.recipe.updateMany({
      where: {
        id: recipeId,
        creatorId: userId,
        source: RecipeSource.MANUAL,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
    return res.count > 0;
  }

  /**
   * Updates a MANUAL recipe owned by the given user. Only updates provided fields.
   */
  async updateManualRecipe(
    userId: string,
    recipeId: string,
    data: Partial<CreateManualRecipeData>,
    lines?: ManualRecipeLines,
  ): Promise<Recipe> {
    // Verify ownership before updating
    const existing = await prisma.recipe.findFirst({
      where: { id: recipeId, creatorId: userId, source: RecipeSource.MANUAL, deletedAt: null },
    });
    if (!existing) {
      throw new Error('Recipe not found or not owned by user.');
    }

    const update = (db: Prisma.TransactionClient | typeof prisma) =>
      db.recipe.update({
        where: { id: recipeId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.ingredients !== undefined && { ingredients: data.ingredients as object }),
          ...(data.instructions !== undefined && { instructions: data.instructions }),
          ...(data.nutritionInfo !== undefined && { nutritionInfo: data.nutritionInfo as object }),
          ...(data.cuisineType !== undefined && { cuisineType: data.cuisineType }),
          ...(data.dietaryTags !== undefined && { dietaryTags: data.dietaryTags }),
          ...(data.prepTimeMins !== undefined && { prepTimeMins: data.prepTimeMins }),
          ...(data.cookTimeMins !== undefined && { cookTimeMins: data.cookTimeMins }),
          ...(data.servings !== undefined && { servings: data.servings }),
          ...('imageUrl' in data && { imageUrl: data.imageUrl ?? null }),
        },
      });
    if (!lines) return update(prisma);
    // The lines then rewrite `ingredients` and the nutrition columns.
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await update(tx);
      await recipeLineRepository.writeLines(recipeId, lines.lines, lines.nutrition, tx);
      return tx.recipe.findUniqueOrThrow({ where: { id: recipeId } });
    });
  }
}

export const favouriteRecipeRepository = new FavouriteRecipeRepository();
