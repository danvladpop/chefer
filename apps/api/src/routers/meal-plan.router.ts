import { z } from 'zod';
import { mealPlanService } from '../application/meal-plan/meal-plan.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Router ───────────────────────────────────────────────────────────────────

export const mealPlanRouter = router({
  /**
   * Generates a new 7-day meal plan for the authenticated user.
   * Only the plan for the specified week is archived — other weeks are untouched.
   * weekOffset: 0 = current week, 1 = next week (past weeks are rejected).
   */
  generate: protectedProcedure
    .input(
      z.object({
        weekOffset: z.number().int().min(0).max(52).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.generate(ctx.user.id, input.weekOffset);
    }),

  /**
   * Returns the user's current active meal plan with all recipes, or null.
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return mealPlanService.getActive(ctx.user.id);
  }),

  /**
   * Returns the meal plan for a given week offset (0 = current, -1 = last week, 1 = next week).
   */
  getForWeek: protectedProcedure
    .input(
      z.object({
        weekOffset: z.number().int().min(-52).max(52).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return mealPlanService.getForWeek(ctx.user.id, input.weekOffset);
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
   * Replaces a single meal slot with a specific saved recipe chosen by the user.
   */
  replaceRecipe: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(6),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        recipeId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.replaceRecipe(
        ctx.user.id,
        input.planId,
        input.dayOfWeek,
        input.mealType,
        input.recipeId,
      );
    }),

  /**
   * Returns the aggregated shopping list for the user's active plan,
   * grouped by category (Produce, Proteins, Dairy, Grains & Pantry, Other).
   */
  getShoppingList: protectedProcedure.query(async ({ ctx }) => {
    return mealPlanService.getShoppingList(ctx.user.id);
  }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return mealPlanService.list(ctx.user.id, input.limit, input.offset);
    }),

  restore: protectedProcedure
    .input(z.object({ planId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.restore(ctx.user.id, input.planId);
    }),

  getById: protectedProcedure
    .input(z.object({ planId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return mealPlanService.getById(ctx.user.id, input.planId);
    }),
});
