import { z } from 'zod';
import { mealPlanService } from '../application/meal-plan/meal-plan.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Router ───────────────────────────────────────────────────────────────────

export const mealPlanRouter = router({
  /**
   * Generates a new 7-day meal plan for the authenticated user.
   * Archives any previously active plan.
   */
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    return mealPlanService.generate(ctx.user.id);
  }),

  /**
   * Returns the user's current active meal plan with all recipes, or null.
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return mealPlanService.getActive(ctx.user.id);
  }),

  /**
   * Returns a single recipe by ID. Used by the recipe detail page.
   */
  getRecipe: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ input }) => {
      return mealPlanService.getRecipe(input.recipeId);
    }),

  /**
   * Swaps a single meal slot with an AI-generated alternative.
   * Input: planId, dayOfWeek (0=Mon), mealType, optional reason.
   */
  swapRecipe: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(6),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.swapRecipe(
        ctx.user.id,
        input.planId,
        input.dayOfWeek,
        input.mealType,
        input.reason,
      );
    }),

  /**
   * Returns the aggregated shopping list for the user's active plan,
   * grouped by category (Produce, Proteins, Dairy, Grains & Pantry, Other).
   */
  getShoppingList: protectedProcedure.query(async ({ ctx }) => {
    return mealPlanService.getShoppingList(ctx.user.id);
  }),
});
