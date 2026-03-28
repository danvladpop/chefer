import { z } from 'zod';
import { recipeService } from '../application/recipe/recipe.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const recipeRouter = router({
  /**
   * Returns all recipes for the user (from their meal plan history).
   * When savedOnly=true, returns only favourited recipes.
   * When myRecipesOnly=true, returns only the user's manually created recipes.
   */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        savedOnly: z.boolean().optional(),
        myRecipesOnly: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return recipeService.list(ctx.user.id, input);
    }),

  /**
   * Returns a single manual recipe owned by the authenticated user.
   * Used to pre-fill the edit form.
   */
  getMyRecipe: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return recipeService.getMyRecipe(ctx.user.id, input.recipeId);
    }),

  /**
   * Creates a new manual recipe owned by the authenticated user.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(500),
        ingredients: z.array(
          z.object({
            name: z.string().min(1),
            quantity: z.number().positive(),
            unit: z.string().min(1),
          }),
        ),
        instructions: z.array(z.string().min(1)).min(1),
        nutritionInfo: z.object({
          calories: z.number().int().min(0),
          protein: z.number().min(0),
          carbs: z.number().min(0),
          fat: z.number().min(0),
          fiber: z.number().min(0).default(0),
        }),
        cuisineType: z.string().min(1).max(60),
        dietaryTags: z.array(z.string()).default([]),
        prepTimeMins: z.number().int().min(0),
        cookTimeMins: z.number().int().min(0),
        servings: z.number().int().min(1),
        imageUrl: z.string().url().optional().or(z.literal('')),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return recipeService.create(ctx.user.id, {
        ...input,
        imageUrl: input.imageUrl || null,
      });
    }),

  /**
   * Updates an existing manual recipe owned by the authenticated user.
   */
  update: protectedProcedure
    .input(
      z.object({
        recipeId: z.string().min(1),
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(500),
        ingredients: z.array(
          z.object({
            name: z.string().min(1),
            quantity: z.number().positive(),
            unit: z.string().min(1),
          }),
        ),
        instructions: z.array(z.string().min(1)).min(1),
        nutritionInfo: z.object({
          calories: z.number().int().min(0),
          protein: z.number().min(0),
          carbs: z.number().min(0),
          fat: z.number().min(0),
          fiber: z.number().min(0).default(0),
        }),
        cuisineType: z.string().min(1).max(60),
        dietaryTags: z.array(z.string()).default([]),
        prepTimeMins: z.number().int().min(0),
        cookTimeMins: z.number().int().min(0),
        servings: z.number().int().min(1),
        imageUrl: z.string().url().optional().or(z.literal('')),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { recipeId, imageUrl, ...data } = input;
      return recipeService.update(ctx.user.id, recipeId, {
        ...data,
        imageUrl: imageUrl || null,
      });
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
