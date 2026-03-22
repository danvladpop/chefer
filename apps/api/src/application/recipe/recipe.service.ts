import type { Recipe } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { favouriteRecipeRepository } from '@chefer/database';

export class RecipeService {
  async list(
    userId: string,
    opts: { search?: string; savedOnly?: boolean; cursor?: string; limit?: number },
  ): Promise<Recipe[]> {
    return favouriteRecipeRepository.findAllRecipesForUser(userId, opts);
  }

  async toggleFavourite(userId: string, recipeId: string): Promise<{ isSaved: boolean }> {
    const isSaved = await favouriteRecipeRepository.isSaved(userId, recipeId);
    if (isSaved) {
      await favouriteRecipeRepository.remove(userId, recipeId);
      return { isSaved: false };
    } else {
      await favouriteRecipeRepository.save(userId, recipeId);
      return { isSaved: true };
    }
  }

  async isSaved(userId: string, recipeId: string): Promise<boolean> {
    return favouriteRecipeRepository.isSaved(userId, recipeId);
  }

  async toggleUseInNextPlan(
    userId: string,
    recipeId: string,
    useInNextPlan: boolean,
  ): Promise<{ useInNextPlan: boolean }> {
    const isSaved = await favouriteRecipeRepository.isSaved(userId, recipeId);
    if (!isSaved) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Recipe must be saved before toggling use in next plan.',
      });
    }
    await favouriteRecipeRepository.toggleUseInNextPlan(userId, recipeId, useInNextPlan);
    return { useInNextPlan };
  }
}

export const recipeService = new RecipeService();
