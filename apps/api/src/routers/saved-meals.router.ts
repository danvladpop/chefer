import { z } from 'zod';
import { savedMealNameSchema } from '@chefer/types';
import { QUICK_ADD_MEAL_TYPES } from '@chefer/utils';
import { savedMealsService } from '../application/saved-meals/saved-meals.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Saved meals (lane A2) ────────────────────────────────────────────────────
// Free. Logging one is `tracker.logSavedMeal`; copying a meal is `tracker.copyMeal`.

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const savedMealsRouter = router({
  /** The user's saved meals, most recently logged first. */
  list: protectedProcedure.query(async ({ ctx }) => savedMealsService.list(ctx.user.id)),

  /** Saves what is logged for one meal of a day under a name (CONFLICT if the name is taken). */
  createFromDay: protectedProcedure
    .input(
      z.object({
        name: savedMealNameSchema,
        date: calendarDateSchema,
        mealType: z.enum(QUICK_ADD_MEAL_TYPES),
      }),
    )
    .mutation(async ({ ctx, input }) => savedMealsService.createFromDay(ctx.user.id, input)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => savedMealsService.delete(ctx.user.id, input.id)),
});
