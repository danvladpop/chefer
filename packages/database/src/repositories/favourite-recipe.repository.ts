import type { FavouriteRecipe, Recipe } from '@prisma/client';
import { RecipeSource } from '@prisma/client';
import { prisma } from '../client.js';

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
}

export interface IFavouriteRecipeRepository {
  findByUserId(userId: string, limit?: number): Promise<FavouriteRecipeWithRecipe[]>;
  isSaved(userId: string, recipeId: string): Promise<boolean>;
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
    },
  ): Promise<Recipe[]>;
  createManualRecipe(userId: string, data: CreateManualRecipeData): Promise<Recipe>;
  updateManualRecipe(
    userId: string,
    recipeId: string,
    data: Partial<CreateManualRecipeData>,
  ): Promise<Recipe>;
  findManualRecipeById(userId: string, recipeId: string): Promise<Recipe | null>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class FavouriteRecipeRepository implements IFavouriteRecipeRepository {
  async findByUserId(userId: string, limit = 4): Promise<FavouriteRecipeWithRecipe[]> {
    return prisma.favouriteRecipe.findMany({
      where: { userId },
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
    } = {},
  ): Promise<Recipe[]> {
    const { search, savedOnly = false, myRecipesOnly = false, cursor, limit = 20 } = opts;

    if (myRecipesOnly) {
      return prisma.recipe.findMany({
        where: {
          creatorId: userId,
          source: RecipeSource.MANUAL,
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    }

    if (savedOnly) {
      const query = {
        where: {
          userId,
          ...(search
            ? { recipe: { name: { contains: search, mode: 'insensitive' as const } } }
            : {}),
        },
        include: { recipe: true as const },
        orderBy: { savedAt: 'desc' as const },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      };
      const favourites = await prisma.favouriteRecipe.findMany(query);
      return favourites.map((f: { recipe: Recipe }) => f.recipe);
    }

    // All recipes referenced in any of the user's meal plans
    const plans = await prisma.mealPlan.findMany({
      where: { userId },
      include: { days: true },
    });

    const recipeIds = new Set<string>();
    for (const plan of plans) {
      for (const day of plan.days) {
        const meals = day.meals as Array<{ type: string; recipeId: string }>;
        for (const m of meals) {
          recipeIds.add(m.recipeId);
        }
      }
    }

    if (recipeIds.size === 0) return [];

    return prisma.recipe.findMany({
      where: {
        id: { in: [...recipeIds] },
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Creates a new MANUAL recipe owned by the given user.
   */
  async createManualRecipe(userId: string, data: CreateManualRecipeData): Promise<Recipe> {
    return prisma.recipe.create({
      data: {
        name: data.name,
        description: data.description,
        ingredients: data.ingredients as object,
        instructions: data.instructions,
        nutritionInfo: data.nutritionInfo as object,
        cuisineType: data.cuisineType,
        dietaryTags: data.dietaryTags,
        prepTimeMins: data.prepTimeMins,
        cookTimeMins: data.cookTimeMins,
        servings: data.servings,
        imageUrl: data.imageUrl ?? null,
        source: RecipeSource.MANUAL,
        creatorId: userId,
      },
    });
  }

  /**
   * Fetches a MANUAL recipe by ID, verifying the user is the creator.
   */
  async findManualRecipeById(userId: string, recipeId: string): Promise<Recipe | null> {
    return prisma.recipe.findFirst({
      where: { id: recipeId, creatorId: userId, source: RecipeSource.MANUAL },
    });
  }

  /**
   * Updates a MANUAL recipe owned by the given user. Only updates provided fields.
   */
  async updateManualRecipe(
    userId: string,
    recipeId: string,
    data: Partial<CreateManualRecipeData>,
  ): Promise<Recipe> {
    // Verify ownership before updating
    const existing = await prisma.recipe.findFirst({
      where: { id: recipeId, creatorId: userId, source: RecipeSource.MANUAL },
    });
    if (!existing) {
      throw new Error('Recipe not found or not owned by user.');
    }

    return prisma.recipe.update({
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
  }
}

export const favouriteRecipeRepository = new FavouriteRecipeRepository();
