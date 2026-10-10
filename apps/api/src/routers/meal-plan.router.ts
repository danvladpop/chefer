import { z } from 'zod';
import { planSettingsInputSchema, planShapeSchema, removeSlotInputSchema } from '@chefer/types';
import { mealPlanService } from '../application/meal-plan/meal-plan.service.js';
import { planShapeService } from '../application/meal-plan/plan-shape.service.js';
import { rebalanceService } from '../application/meal-plan/rebalance.service.js';
import { hasFeature, isPremiumUser } from '../lib/entitlements.js';
import { env } from '../lib/env.js';
import { reserveAiSwap, reservePlanGeneration } from '../lib/quotas.js';
import { protectedProcedure, requireAiConsent, router } from '../lib/trpc.js';

// A one-off override on `generate`: every field optional, merged over the
// user's stored shape for this call only (never persisted) — e.g.
// `Plan this day` sends `{ days: [d] }`.
const planShapeOverrideSchema = planShapeSchema.partial();

// Premium households see the week cost sized for the whole table (P2-3).
const planView = (user: Parameters<typeof hasFeature>[0]) => ({
  householdScaling: hasFeature(user, 'householdPlans'),
  // UX-06 (T-06.1): whether the training-day bump is applied or only previewed.
  trainingAccess: hasFeature(user, 'trainingDayTargets'),
});

// A slot's index in `day.meals` (a curated day can hold two snacks). Optional
// and additive: shipped mobile builds omit it and get the first slot of
// `mealType`, as before. When sent, the slot must be of `mealType`.
const slotIndexSchema = z.number().int().min(0).max(20).optional();

// The client's local calendar day, YYYY-MM-DD.
const calendarDateInputSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  }, 'Not a real calendar date');

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
        /** §T-07.2/T-07.3: a one-off shape override for this call only. */
        shape: planShapeOverrideSchema.optional(),
        /** §T-07.4/T-08.3: keep slots the user pinned when they still pass safety. */
        keepPinned: z.boolean().optional(),
        /**
         * §T-06.7: premium `Fit meals to my training days`. Omitted = the
         * user's saved choice (`setShape({ fitTrainingDays })`), else the
         * default (on for lifters whose goal gets the bump); `false` turns it
         * off for this week. Ignored on the free tier (the switch is a locked
         * preview there).
         */
        fitTrainingDays: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Atomic reservation; refunded when generation fails, so an outage or
      // an exhausted curated pool doesn't use up the day's allowance.
      const premium = isPremiumUser(ctx.user);
      const reservation = await reservePlanGeneration(ctx.user, premium);
      try {
        return await mealPlanService.generate(ctx.user.id, input.weekOffset, premium, {
          leftovers: premium && input.leftovers === true,
          usageReserved: true,
          // Premium: the curated week at once, then the chef tailors it live
          // (the response carries `tailoring`; poll getForWeek while RUNNING).
          instant: premium && env.AI_PLAN_TAILORING,
          ...(input.shape && { shape: input.shape }),
          ...(input.keepPinned !== undefined && { keepPinned: input.keepPinned }),
          ...(premium &&
            input.fitTrainingDays !== undefined && { fitTrainingDays: input.fitTrainingDays }),
        });
      } catch (err) {
        await reservation.release();
        throw err;
      }
    }),

  /**
   * §wave-1 L-PLAN (UX-07 "Plan this day"): adds meals to ONE currently
   * unplanned day of an existing plan, without rewriting the rest of the
   * week (unlike `generate({ shape: { days: [d] } })`, which replaces the
   * whole plan document today). Always the curated, zero-AI-cost picker —
   * see `MealPlanService.planDay` — so it's reserved against the same
   * `CURATED_PLAN` daily quota `generate`'s free path uses, for every tier.
   */
  planDay: protectedProcedure
    .input(z.object({ planId: z.string().min(1), dayOfWeek: z.number().int().min(0).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const reservation = await reservePlanGeneration(ctx.user, false);
      try {
        return await mealPlanService.planDay(ctx.user.id, input.planId, input.dayOfWeek);
      } catch (err) {
        await reservation.release();
        throw err;
      }
    }),

  /**
   * "Tailor the rest": re-queues the days live tailoring did not get to
   * (PARTIAL/FAILED) — only those days, premium only, capped per plan. No
   * quota reservation: it completes the generation the user already paid
   * for (see MealPlanService.resumeTailoring). Returns the plan.
   */
  resumeTailoring: protectedProcedure
    .input(z.object({ planId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.resumeTailoring(
        ctx.user.id,
        input.planId,
        isPremiumUser(ctx.user),
        planView(ctx.user),
      );
    }),

  /**
   * §T-07.1: the user's "how you cook" plan shape (legacy default when unset),
   * plus `leftovers` and the saved `fitTrainingDays` (null = not chosen).
   */
  getShape: protectedProcedure.query(async ({ ctx }) => {
    return planShapeService.getShape(ctx.user.id);
  }),

  /**
   * §T-07.1: persists the plan shape (onboarding, Settings, or the Plan
   * settings sheet). §2.3 S1: `leftovers` (bug B-27) and, optionally, the
   * saved `fitTrainingDays` (T-06.7 follow-up — omitted = left as stored)
   * live on the same DietaryPreferences row.
   */
  setShape: protectedProcedure.input(planSettingsInputSchema).mutation(async ({ ctx, input }) => {
    return planShapeService.setShape(ctx.user.id, input);
  }),

  /** §T-07.4: toggles `Your pick` on an existing slot. */
  setSlotPinned: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(6),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        slotIndex: slotIndexSchema,
        pinned: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await mealPlanService.setSlotPinned(
        ctx.user.id,
        input.planId,
        input.dayOfWeek,
        input.mealType,
        input.slotIndex,
        input.pinned,
      );
      return { ok: true };
    }),

  /**
   * FB7-04: removes one slot of a day — a side dish. Refused (BAD_REQUEST)
   * unless another slot of the same meal type remains that day. Re-indexes
   * that day's tracker state.
   */
  removeSlot: protectedProcedure.input(removeSlotInputSchema).mutation(async ({ ctx, input }) => {
    return mealPlanService.removeSlot(ctx.user.id, input);
  }),

  /**
   * §T-11.3: previews (default) or applies scaling every slot of one day by
   * `factor` (0.75–1.5×; each slot's own resulting portion is still capped
   * to the plan's 0.75–2× steps, T-11.4).
   */
  scaleDay: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(6),
        factor: z.number().min(0.75).max(1.5),
        apply: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.scaleDay(
        ctx.user.id,
        input.planId,
        input.dayOfWeek,
        input.factor,
        input.apply,
      );
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
   * Input: planId, dayOfWeek (0=Mon), mealType, optional slotIndex, optional reason.
   * Only the premium swap reaches the AI (free swaps are curated), so only
   * that one needs AI-data consent (R-10) — checked before the quota is reserved.
   */
  swapRecipe: protectedProcedure
    .use(requireAiConsent(({ user }) => isPremiumUser(user)))
    .input(
      z.object({
        planId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(6),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        slotIndex: slotIndexSchema,
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
          input.slotIndex,
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
        slotIndex: slotIndexSchema,
        recipeId: z.string().min(1),
        /**
         * T-00.11 (B-34/B-46): confirms the pick despite an UNSAFE_FOR_TABLE
         * rejection — the service only honours it for the user's own manual
         * recipe. Optional and additive; old clients that omit it get
         * today's rejection with no bypass.
         */
        acknowledgeConflict: z.boolean().optional(),
        /**
         * UX-PLAN-04: whether the slot becomes "Your pick" (default true).
         * Undo sends the previous state (`previousPinned` on the swap response,
         * absent = false) so an undone swap doesn't leave the slot pinned.
         */
        pinned: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.replaceRecipe(
        ctx.user.id,
        input.planId,
        input.dayOfWeek,
        input.mealType,
        input.recipeId,
        input.slotIndex,
        input.acknowledgeConflict,
        input.pinned,
      );
    }),

  // ─── Week rebalance (WP-07, UX-PLAN-09) — all tiers, no AI ──────────────────

  /**
   * What a week rebalance WOULD do, without doing it: up to two swaps from
   * the user's safe curated pool, each with a one-line `explanation`, a
   * `headline` for the week's gap and protein `snacks` when swaps cannot close
   * a protein gap. `null` = nothing to offer. Also what Plan's "Rebalance my
   * week" shows. `localDate` = the client's local today.
   */
  previewRebalance: protectedProcedure
    .input(
      z
        .object({
          planId: z.string().min(1).optional(),
          localDate: calendarDateInputSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return rebalanceService.preview(ctx.user, {
        planId: input?.planId,
        localDate: input?.localDate,
      });
    }),

  /**
   * Applies the swaps the user accepted in a preview. Stale or unsafe swaps
   * are skipped (never an error), so a preview that went out of date cannot
   * rewrite a week the user has changed. Returns the same shape as a log's
   * `rebalance` (swaps with `previousRecipeId`/`slotIndex`), so Undo through
   * `replaceRecipe` is unchanged.
   */
  applyRebalance: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        swaps: z
          .array(
            z.object({
              dayOfWeek: z.number().int().min(0).max(6),
              mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
              slotIndex: slotIndexSchema,
              previousRecipeId: z.string().min(1),
              newRecipeId: z.string().min(1),
            }),
          )
          .min(1)
          .max(6),
        localDate: calendarDateInputSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return rebalanceService.apply(ctx.user, input);
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
    .input(
      z.object({
        planId: z.string().min(1),
        /**
         * UX-PLAN-11: bring the plan back into this (0) or next (1) week instead
         * of its own. Optional and additive — omitted keeps today's behaviour
         * (Undo after Regenerate relies on it).
         */
        weekOffset: z.union([z.literal(0), z.literal(1)]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mealPlanService.restore(ctx.user.id, input.planId, input.weekOffset);
    }),

  getById: protectedProcedure
    .input(z.object({ planId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return mealPlanService.getById(ctx.user.id, input.planId, planView(ctx.user));
    }),
});
