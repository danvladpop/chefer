import { z } from 'zod';
import { trackerService } from '../application/tracker/tracker.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// Planned recipes carry recipeId; custom entries (photo scans, quick-adds —
// F4) carry `custom` instead. Exactly one of the two must be present.
const loggedMealSchema = z
  .object({
    recipeId: z.string().optional(),
    custom: z
      .object({
        name: z.string().min(1).max(200),
        estimatedBy: z.enum(['vision', 'manual']),
      })
      .optional(),
    mealType: z.string(),
    portionMultiplier: z.number().min(0.5).max(2),
    kcal: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  })
  .refine((m) => (m.recipeId != null) !== (m.custom != null), {
    message: 'A logged meal needs exactly one of recipeId or custom',
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
      // Returns { log, rebalance } — rebalance (F4) is non-null only when the
      // premium week-projection guard actually swapped future meals.
      return trackerService.upsertDay(ctx.user, input.date, input.loggedMeals);
    }),

  // F4 Snap-to-Log: append one custom entry (photo scan or quick-add) to the
  // day. Manual quick-adds are FREE (data honesty); the photo-scan pipeline
  // that produces `estimatedBy: 'vision'` entries is metered upstream in
  // /api/scan-meal.
  logCustomMeal: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(1).max(200),
        estimatedBy: z.enum(['vision', 'manual']),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        kcal: z.number().min(0).max(5000),
        protein: z.number().min(0).max(500).default(0),
        carbs: z.number().min(0).max(1000).default(0),
        fat: z.number().min(0).max(500).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, ...entry } = input;
      return trackerService.logCustomMeal(ctx.user, date, entry);
    }),

  // F4: delete one custom entry by its position in the day's loggedMeals.
  deleteCustomMeal: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        entryIndex: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.deleteCustomMeal(ctx.user.id, input.date, input.entryIndex);
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
