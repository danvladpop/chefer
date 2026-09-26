import { z } from 'zod';
import { mealPlanService } from '../application/meal-plan/meal-plan.service.js';
import { hasFeature, isPremiumUser } from '../lib/entitlements.js';
import { reserveAiSwap, reservePlanGeneration } from '../lib/quotas.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// Premium households see the week cost sized for the whole table (P2-3).
const planView = (user: Parameters<typeof hasFeature>[0]) => ({
  householdScaling: hasFeature(user, 'householdPlans'),
});

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
        /** F3 "cook once, eat twice" — premium generation option. */
        leftovers: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Atomic reservation; refunded when generation fails, so an outage or
      // an exhausted curated pool doesn't use up the day's allowance.
      const reservation = await reservePlanGeneration(ctx.user);
      const premium = isPremiumUser(ctx.user);
      try {
        return await mealPlanService.generate(ctx.user.id, input.weekOffset, premium, {
          leftovers: premium && input.leftovers === true,
          usageReserved: true,
        });
      } catch (err) {
        await reservation.release();
        throw err;
      }
    }),

  /**
   * Returns the user's current active meal plan with all recipes, or null.
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return mealPlanService.getActive(ctx.user.id, planView(ctx.user));
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
      return mealPlanService.getForWeek(ctx.user.id, input.weekOffset, planView(ctx.user));
    }),

  /**
   * Returns a single recipe by ID. Used by the recipe detail page.
   */
  getRecipe: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return mealPlanService.getRecipe(ctx.user.id, input.recipeId);
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
      const reservation = await reserveAiSwap(ctx.user);
      try {
        return await mealPlanService.swapRecipe(
          ctx.user.id,
          input.planId,
          input.dayOfWeek,
          input.mealType,
          input.reason,
          isPremiumUser(ctx.user),
        );
      } catch (err) {
        await reservation.release();
        throw err;
      }
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

  // ─── Week templates ("My weeks") — all tiers, no AI ─────────────────────────

  /** Saves a plan as a named week template (max 4 — CONFLICT beyond that). */
  saveAsTemplate: protectedProcedure
    .input(z.object({ planId: z.string().min(1), name: z.string().trim().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.saveAsTemplate(ctx.user.id, input.planId, input.name);
    }),

  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    return mealPlanService.listTemplates(ctx.user.id);
  }),

  renameTemplate: protectedProcedure
    .input(z.object({ templateId: z.string().min(1), name: z.string().trim().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      await mealPlanService.renameTemplate(ctx.user.id, input.templateId, input.name);
      return { ok: true };
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ templateId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await mealPlanService.deleteTemplate(ctx.user.id, input.templateId);
      return { ok: true };
    }),

  /**
   * Marks the template as followed (future carry-forward clones it) and
   * applies it to the given week immediately (replaces that week's plan).
   */
  followTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string().min(1),
        weekOffset: z.union([z.literal(0), z.literal(1)]).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.followTemplate(ctx.user.id, input.templateId, input.weekOffset);
    }),

  /** Stops following any template — carry-forward reverts to the latest plan. */
  unfollowTemplate: protectedProcedure.mutation(async ({ ctx }) => {
    await mealPlanService.unfollowTemplate(ctx.user.id);
    return { ok: true };
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
      return mealPlanService.getById(ctx.user.id, input.planId, planView(ctx.user));
    }),
});
