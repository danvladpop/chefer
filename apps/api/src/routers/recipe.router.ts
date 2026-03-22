import { z } from 'zod';
import { recipeService } from '../application/recipe/recipe.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const recipeRouter = router({
  /**
   * Returns all recipes for the user (from their meal plan history).
   * When savedOnly=true, returns only favourited recipes.
   */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        savedOnly: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return recipeService.list(ctx.user.id, input);
    }),

  /**
   * Checks whether a recipe is saved by the current user.
   */
  isSaved: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const saved = await recipeService.isSaved(ctx.user.id, input.recipeId);
      return { isSaved: saved };
    }),

  /**
   * Toggles a recipe in the user's favourites. Returns the new saved state.
   */
  toggleFavourite: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return recipeService.toggleFavourite(ctx.user.id, input.recipeId);
    }),

  /**
   * Toggles whether a saved recipe should be included as a hint in the
   * next AI meal plan generation.
   */
  toggleUseInNextPlan: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1), useInNextPlan: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return recipeService.toggleUseInNextPlan(ctx.user.id, input.recipeId, input.useInNextPlan);
    }),

  rate: protectedProcedure
    .input(
      z.object({
        recipeId: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return recipeService.rate(ctx.user.id, input.recipeId, input.rating, input.notes);
    }),

  getMyRating: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return recipeService.getMyRating(ctx.user.id, input.recipeId);
    }),
});
