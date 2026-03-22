import { TRPCError } from '@trpc/server';
import type { Recipe } from '@chefer/database';
import {
  favouriteRecipeRepository,
  mealRatingRepository,
  type IMealRatingRepository,
} from '@chefer/database';

export class RecipeService {
  constructor(private readonly ratingRepo: IMealRatingRepository = mealRatingRepository) {}
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

  async rate(
    userId: string,
    recipeId: string,
    rating: number,
    notes?: string,
  ): Promise<{ rating: number; notes: string | null }> {
    const upsertData: { userId: string; recipeId: string; rating: number; notes?: string } = {
      userId,
      recipeId,
      rating,
    };
    if (notes !== undefined) upsertData.notes = notes;
    const result = await this.ratingRepo.upsert(upsertData);
    return { rating: result.rating, notes: result.notes };
  }

  async getMyRating(
    userId: string,
    recipeId: string,
  ): Promise<{ rating: number; notes: string | null } | null> {
    const result = await this.ratingRepo.findByUserAndRecipe(userId, recipeId);
    if (!result) return null;
    return { rating: result.rating, notes: result.notes };
  }
}

export const recipeService = new RecipeService();
