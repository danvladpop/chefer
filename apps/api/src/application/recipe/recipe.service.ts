import { TRPCError } from '@trpc/server';
import type { Recipe } from '@chefer/database';
import {
  favouriteRecipeRepository,
  mealRatingRepository,
  type CreateManualRecipeData,
  type IMealRatingRepository,
} from '@chefer/database';

type UpdateManualRecipeData = Partial<CreateManualRecipeData>;

export class RecipeService {
  constructor(private readonly ratingRepo: IMealRatingRepository = mealRatingRepository) {}

  async list(
    userId: string,
    opts: {
      search?: string | undefined;
      savedOnly?: boolean | undefined;
      myRecipesOnly?: boolean | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ): Promise<Recipe[]> {
    return favouriteRecipeRepository.findAllRecipesForUser(userId, opts);
  }

  async create(userId: string, data: CreateManualRecipeData): Promise<Recipe> {
    return favouriteRecipeRepository.createManualRecipe(userId, data);
  }

  async getMyRecipe(userId: string, recipeId: string): Promise<Recipe> {
    const recipe = await favouriteRecipeRepository.findManualRecipeById(userId, recipeId);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    return recipe;
  }

  async update(userId: string, recipeId: string, data: UpdateManualRecipeData): Promise<Recipe> {
    const existing = await favouriteRecipeRepository.findManualRecipeById(userId, recipeId);
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Recipe not found or you do not have permission to edit it.',
      });
    }
    return favouriteRecipeRepository.updateManualRecipe(userId, recipeId, data);
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
