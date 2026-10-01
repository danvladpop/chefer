import type { TRPCRouterRecord } from '@trpc/server';
import { addRecipeToWeekInputSchema, undoAddToWeekInputSchema } from '@chefer/types';
import type { MealPlanService } from '../../application/meal-plan/meal-plan.service.js';
import { activeFriendsProcedure } from '../../lib/friends-middleware.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';

// friends.* — another user's recipe into your week (L-XRECIPE):
// addRecipeToWeek, undoAddToWeek.
// Procedure map: docs/friends/implementation-plan.md §4.2.
// A plain procedure RECORD, not a router(): routers/friends/index.ts spreads
// the four records into one friends router, so parallel lanes never share a
// file. Keys must be unique across the four records (index.test.ts checks).
//
// Both act on the CALLER's own plan only. Access to the recipe is the
// extended `findRecipeVisibleTo` (recipe-access.ts, plan §4.3) inside the
// service — the recipe's owner isn't an input, so there is no
// requireSocialAccess here. Handlers only rate-limit and delegate.

const HOUR_MS = 60 * 60 * 1000;

/**
 * MealPlanService, loaded on first use. Its import graph reaches the AI
 * provider setup, which resolves its routes from the env at load — the
 * friends router composition test (index.test.ts) loads every lane record
 * with a stub env, and must not pull that in just to check the kill switch.
 */
async function mealPlans(): Promise<MealPlanService> {
  return (await import('../../application/meal-plan/meal-plan.service.js')).mealPlanService;
}

export const recipesProcedures = {
  /**
   * PRD FR-17.4–17.7 / UX §9.5: add (or replace) a slot of the caller's week
   * with a recipe they may see — another user's recipe goes in as the
   * caller's private copy (made once, reused). A conflict with the caller's
   * table → FORBIDDEN + `data.unsafeForTable` unless `acknowledgeConflict`.
   */
  addRecipeToWeek: activeFriendsProcedure
    .input(addRecipeToWeekInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertWithinRateLimit('friends.addRecipeToWeek', ctx.user.id, 120, HOUR_MS);
      return (await mealPlans()).addRecipeToSlot(ctx.user.id, input);
    }),

  /** The snackbar's Undo: pass `addRecipeToWeek`'s result back. A stale Undo is a no-op. */
  undoAddToWeek: activeFriendsProcedure
    .input(undoAddToWeekInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertWithinRateLimit('friends.undoAddToWeek', ctx.user.id, 120, HOUR_MS);
      return (await mealPlans()).undoAddToSlot(ctx.user.id, input);
    }),
} satisfies TRPCRouterRecord;
