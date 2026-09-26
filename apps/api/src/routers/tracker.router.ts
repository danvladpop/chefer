import { z } from 'zod';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN } from '@chefer/utils';
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
    mealType: z.string().min(1).max(20),
    portionMultiplier: z.number().min(0.5).max(2),
    // Bounded (audit F-TRK-1-4): negative, huge or Infinity values used to be
    // stored and poisoned charts and coaching.
    kcal: z.number().finite().min(0).max(10000),
    protein: z.number().finite().min(0).max(1000),
    carbs: z.number().finite().min(0).max(2000),
    fat: z.number().finite().min(0).max(1000),
  })
  .refine((m) => (m.recipeId != null) !== (m.custom != null), {
    message: 'A logged meal needs exactly one of recipeId or custom',
  });

// A real calendar day (audit F-TRK-1-5): 2026-13-45 used to reach Prisma
// and 500, and 2026-02-31 silently rolled over to 03-03.
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  }, 'Not a real calendar date');

/** The client's LOCAL day; today+1 (UTC) covers every timezone. */
const notFuture = (d: string) => new Date(d).getTime() <= Date.now() + 24 * 60 * 60 * 1000;

// Logging writes a day: it must be a real date and not in the future.
const logDateSchema = calendarDateSchema.refine(notFuture, "You can't log a future day");

// Body weight (audit F-DASH-3-1): 1000 kg, 0.001 kg and 2099 dates used to be
// accepted and poisoned /progress and the coach's trend. The date is the
// client's LOCAL day; allowing today+1 (UTC) covers every timezone.
const bodyWeightKgSchema = z.number().finite().min(BODY_WEIGHT_KG_MIN).max(BODY_WEIGHT_KG_MAX);
const weightDateSchema = calendarDateSchema.refine(notFuture, "A weigh-in can't be in the future");

export const trackerRouter = router({
  getDay: protectedProcedure
    .input(z.object({ date: calendarDateSchema }))
    .query(async ({ ctx, input }) => {
      return trackerService.getDay(ctx.user.id, input.date);
    }),

  upsertDay: protectedProcedure
    .input(
      z.object({
        date: logDateSchema,
        // May be empty: unticking every planned meal un-logs them (F-TRK-1-3).
        // Custom and off-plan entries survive — the server merges.
        loggedMeals: z.array(loggedMealSchema).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Returns { log, rebalance } — rebalance (F4) is non-null only when the
      // premium week-projection guard actually swapped future meals.
      return trackerService.upsertDay(ctx.user, input.date, input.loggedMeals);
    }),

  // Cook mode "Made it!": log one recipe, atomically and idempotently.
  // Additive — older clients keep using upsertDay, which now merges.
  logRecipe: protectedProcedure
    .input(
      z.object({
        date: logDateSchema,
        recipeId: z.string().min(1),
        mealType: z.string().min(1).max(20),
        portionMultiplier: z.number().min(0.5).max(2).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, ...entry } = input;
      return trackerService.logRecipe(ctx.user, date, entry);
    }),

  // F4 Snap-to-Log: append one custom entry (photo scan or quick-add) to the
  // day. Manual quick-adds are FREE (data honesty); the photo-scan pipeline
  // that produces `estimatedBy: 'vision'` entries is metered upstream in
  // /api/scan-meal.
  logCustomMeal: protectedProcedure
    .input(
      z.object({
        date: logDateSchema,
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
        date: calendarDateSchema,
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
        weightKg: bodyWeightKgSchema,
        date: weightDateSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.logWeight(ctx.user.id, input.weightKg, input.date);
    }),

  // Correct or remove a weigh-in (audit F-DASH-3-1). Owner-scoped: someone
  // else's entry id answers NOT_FOUND.
  updateWeight: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        weightKg: bodyWeightKgSchema,
        date: weightDateSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.updateWeight(ctx.user.id, input.id, input.weightKg, input.date);
    }),

  deleteWeight: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return trackerService.deleteWeight(ctx.user.id, input.id);
    }),

  weightHistory: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(90) }))
    .query(async ({ ctx, input }) => {
      return trackerService.weightHistory(ctx.user.id, input.days);
    }),
});
