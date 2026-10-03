import { z } from 'zod';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN } from '@chefer/utils';
import { trackerService } from '../application/tracker/tracker.service.js';
import { protectedProcedure, requireHealthConsent, router } from '../lib/trpc.js';

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
    // The plan slot a planned entry was ticked from (two identical snacks
    // tick separately). Optional: older clients don't send it.
    slotIndex: z.number().int().min(0).max(20).optional(),
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

// §2.12, T-21.1: the client's local "today" — optional, back-compat with
// clients that only ever anchored on the server's UTC day.
const localDateSchema = calendarDateSchema.optional();

// A full custom-entry snapshot, for restoreCustomMeal's Undo (T-19.2, B-34):
// the client sends back exactly what it had before deleting.
// UX-FOOD-11: macros the client left blank (stored as 0 g, flagged unknown).
const unknownMacrosSchema = z
  .array(z.enum(['protein', 'carbs', 'fat']))
  .max(3)
  .optional();

const customEntrySnapshotSchema = z.object({
  entryId: z.string().min(1).optional(),
  custom: z.object({
    name: z.string().min(1).max(200),
    estimatedBy: z.enum(['vision', 'manual']),
  }),
  mealType: z.string().min(1).max(20),
  portionMultiplier: z.number().min(0.5).max(2),
  kcal: z.number().finite().min(0).max(10000),
  protein: z.number().finite().min(0).max(1000),
  carbs: z.number().finite().min(0).max(2000),
  fat: z.number().finite().min(0).max(1000),
  unknownMacros: unknownMacrosSchema,
});

export const trackerRouter = router({
  getDay: protectedProcedure
    .input(z.object({ date: calendarDateSchema }))
    .query(async ({ ctx, input }) => {
      return trackerService.getDay(ctx.user.id, input.date, ctx.user);
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
        // Today's "I ate this" names the plan slot (additive, optional).
        slotIndex: z.number().int().min(0).max(20).optional(),
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
        unknownMacros: unknownMacrosSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, ...entry } = input;
      return trackerService.logCustomMeal(ctx.user, date, entry);
    }),

  // The tracker's untick (T-19.4, one-save model): removes the planned-recipe
  // entry `logRecipe` would have written for this slot. A no-op when nothing
  // matches (already unticked) — additive, older clients keep using upsertDay.
  unlogRecipe: protectedProcedure
    .input(
      z.object({
        date: calendarDateSchema,
        recipeId: z.string().min(1),
        mealType: z.string().min(1).max(20),
        slotIndex: z.number().int().min(0).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, ...target } = input;
      return trackerService.unlogRecipe(ctx.user.id, date, target);
    }),

  // Removes any entries (recipe or custom) by stable id — undoes copyDay
  // (deletes exactly the returned copies) and any other batch a client
  // already holds ids for. Idempotent: an unmatched id is ignored.
  deleteEntries: protectedProcedure
    .input(
      z.object({ date: calendarDateSchema, entryIds: z.array(z.string().min(1)).min(1).max(50) }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.deleteEntries(ctx.user.id, input.date, input.entryIds);
    }),

  // F4: delete one custom entry. UX-FOOD-17: by stable `entryId` (new
  // clients) or, for 1.0.1 builds that only ever send it, by position in the
  // day's loggedMeals — the server resolves either against the current array
  // in one transaction, and `entryId` wins when both are sent.
  deleteCustomMeal: protectedProcedure
    .input(
      z
        .object({
          date: calendarDateSchema,
          entryIndex: z.number().int().min(0).optional(),
          entryId: z.string().min(1).optional(),
        })
        .refine((v) => v.entryIndex !== undefined || v.entryId !== undefined, {
          message: 'entryId or entryIndex is required',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      return trackerService.deleteCustomMeal(ctx.user.id, input.date, {
        entryId: input.entryId,
        entryIndex: input.entryIndex,
      });
    }),

  // UX-FOOD-03: edit a logged recipe entry (portion / meal) by stable id —
  // the "Also eaten" rows for recipes that have left the plan. Additive.
  updateRecipeEntry: protectedProcedure
    .input(
      z.object({
        date: calendarDateSchema,
        entryId: z.string().min(1),
        portionMultiplier: z.number().min(0.5).max(2).optional(),
        mealType: z.string().min(1).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, entryId, ...updates } = input;
      return trackerService.updateRecipeEntry(ctx.user.id, date, entryId, updates);
    }),

  // Edit any custom entry by its stable id (bug B-34, T-19.2). Additive —
  // older clients keep deleting/re-adding via entryIndex.
  updateCustomMeal: protectedProcedure
    .input(
      z.object({
        date: calendarDateSchema,
        entryId: z.string().min(1),
        name: z.string().min(1).max(200).optional(),
        estimatedBy: z.enum(['vision', 'manual']).optional(),
        mealType: z.string().min(1).max(20).optional(),
        kcal: z.number().finite().min(0).max(10000),
        protein: z.number().finite().min(0).max(1000),
        carbs: z.number().finite().min(0).max(2000),
        fat: z.number().finite().min(0).max(1000),
        // Present = replace the flag (an empty list clears it); absent = keep it.
        unknownMacros: unknownMacrosSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, entryId, ...updates } = input;
      return trackerService.updateCustomMeal(ctx.user.id, date, entryId, updates);
    }),

  // The bin's `Undo` snackbar (8s): re-adds the exact entry the client had
  // before deleting (bug B-34, T-19.2). Idempotent on entryId.
  restoreCustomMeal: protectedProcedure
    .input(z.object({ date: calendarDateSchema, entry: customEntrySnapshotSchema }))
    .mutation(async ({ ctx, input }) => {
      return trackerService.restoreCustomMeal(ctx.user.id, input.date, input.entry);
    }),

  // "Copy {yesterday} to today" (T-19.3). Returns the new entries' ids so the
  // header's own Undo can delete exactly the copies.
  copyDay: protectedProcedure
    .input(z.object({ fromDate: calendarDateSchema, toDate: logDateSchema }))
    .mutation(async ({ ctx, input }) => {
      return trackerService.copyDay(ctx.user, input.fromDate, input.toDate);
    }),

  // Search-first Log sheet (T-19.1): the last 15 distinct things logged,
  // most frequent first.
  recents: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(30).default(15) }).optional())
    .query(async ({ ctx, input }) => {
      return trackerService.recents(ctx.user.id, input?.limit ?? 15);
    }),

  weeklySummary: protectedProcedure
    .input(z.object({ localDate: localDateSchema }).optional())
    .query(async ({ ctx, input }) => {
      return trackerService.weeklySummary(ctx.user.id, input?.localDate);
    }),

  monthlySummary: protectedProcedure
    .input(z.object({ localDate: localDateSchema }).optional())
    .query(async ({ ctx, input }) => {
      return trackerService.monthlySummary(ctx.user.id, input?.localDate);
    }),

  logWeight: protectedProcedure
    .input(
      z.object({
        weightKg: bodyWeightKgSchema,
        date: weightDateSchema.optional(),
      }),
    )
    .use(requireHealthConsent()) // T-26.3: a weigh-in is health data
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
    .use(requireHealthConsent())
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
