import type { FavouriteRecipe, Recipe } from '@prisma/client';
import { prisma } from '../client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FavouriteRecipeWithRecipe = FavouriteRecipe & { recipe: Recipe };

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
    opts?: { search?: string; savedOnly?: boolean; cursor?: string; limit?: number },
  ): Promise<Recipe[]>;
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
   */
  async findAllRecipesForUser(
    userId: string,
    opts: { search?: string; savedOnly?: boolean; cursor?: string; limit?: number } = {},
  ): Promise<Recipe[]> {
    const { search, savedOnly = false, cursor, limit = 20 } = opts;

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
}

export const favouriteRecipeRepository = new FavouriteRecipeRepository();
