import { z } from 'zod';
import { trackerService } from '../application/tracker/tracker.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

const loggedMealSchema = z.object({
  recipeId: z.string(),
  mealType: z.string(),
  portionMultiplier: z.number().min(0.5).max(2),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const trackerRouter = router({
  getDay: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      return trackerService.getDay(ctx.user.id, input.date);
    }),

  upsertDay: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        loggedMeals: z.array(loggedMealSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.upsertDay(ctx.user.id, input.date, input.loggedMeals);
    }),

  weeklySummary: protectedProcedure.query(async ({ ctx }) => {
    return trackerService.weeklySummary(ctx.user.id);
  }),

  monthlySummary: protectedProcedure.query(async ({ ctx }) => {
    return trackerService.monthlySummary(ctx.user.id);
  }),

  logWeight: protectedProcedure
    .input(
      z.object({
        weightKg: z.number().positive(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.logWeight(ctx.user.id, input.weightKg, input.date);
    }),

  weightHistory: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(90) }))
    .query(async ({ ctx, input }) => {
      return trackerService.weightHistory(ctx.user.id, input.days);
    }),
});
