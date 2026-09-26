import { z } from 'zod';
import { setDisplayPreferencesInputSchema, setOnboardingIntentInputSchema } from '@chefer/types';
import {
  computeMacroTargets,
  preferencesService,
  type UpdatePreferencesInput,
} from '../application/preferences/preferences.service.js';
import { premiumProcedure, protectedProcedure, router } from '../lib/trpc.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const setupSchema = z.object({
  goal: z.enum(['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_MUSCLE', 'EAT_HEALTHIER']),
  biologicalSex: z.enum(['MALE', 'FEMALE']),
  age: z.number().int().min(10).max(110),
  heightCm: z.number().positive().max(300),
  weightKg: z.number().positive().max(500),
  activityLevel: z.enum([
    'SEDENTARY',
    'LIGHTLY_ACTIVE',
    'MODERATELY_ACTIVE',
    'VERY_ACTIVE',
    'ATHLETE',
  ]),
  dietaryRestrictions: z.array(z.string()),
  allergies: z.array(z.string()),
  dislikedIngredients: z.array(z.string()),
  cuisinePreferences: z.array(z.string()),
  mealsPerDay: z.number().int().min(2).max(5),
  // Legacy "cooking for N" (backlog P2-3, audit F-PM-8): optional now —
  // current clients size the table through household members; builds in
  // the stores still send it and the service turns it into members.
  servingSize: z.number().int().min(1).max(6).optional(),
});

// Safety fields are free for every account (P1-2): a plan that ignores an
// allergy is not a lesser product, it's a dangerous one. Only the
// personalisation-depth fields (goal, body metrics, cadence) stay premium.
const safetySchema = z.object({
  dietaryRestrictions: z.array(z.string().max(60)).max(20),
  allergies: z.array(z.string().max(60)).max(20),
  dislikedIngredients: z.array(z.string().max(60)).max(30),
});

const targetsSchema = setupSchema
  .omit({ dietaryRestrictions: true, allergies: true, dislikedIngredients: true })
  .partial()
  .extend({
    deliveryAddress: z.string().nullable().optional(),
    deliveryCurrency: z.enum(['EUR', 'USD', 'GBP', 'RON']).nullable().optional(),
    preferredUnits: z.enum(['METRIC', 'IMPERIAL']).optional(),
    // P2-4: weekly ingredient budget — null clears it.
    weeklyBudgetEur: z.number().positive().max(2000).nullable().optional(),
  });

// ─── Router ───────────────────────────────────────────────────────────────────

export const preferencesRouter = router({
  hasProfile: protectedProcedure.query(async ({ ctx }) => {
    return preferencesService.hasProfile(ctx.user.id);
  }),

  get: protectedProcedure.query(async ({ ctx }) => {
    return preferencesService.get(ctx.user.id);
  }),

  // Personalisation depth (goal, body metrics, cadence) is premium — free
  // users use the curated plans and are prompted to upgrade. Reads stay open
  // so the locked UI can still render existing state.
  setup: premiumProcedure.input(setupSchema).mutation(async ({ input, ctx }) => {
    await preferencesService.setup(ctx.user.id, input);
    return { success: true as const };
  }),

  /**
   * "What brings you here?" — onboarding step 0 (backlog P2-3, audit
   * F-PM-6). Free for every tier; stored on the chef profile.
   */
  setIntent: protectedProcedure
    .input(setOnboardingIntentInputSchema)
    .mutation(async ({ input, ctx }) => {
      return preferencesService.setIntent(ctx.user.id, input.intent);
    }),

  /** Allergies, restrictions, dislikes — free for every account (P1-2). */
  updateSafety: protectedProcedure.input(safetySchema).mutation(async ({ input, ctx }) => {
    return preferencesService.update(ctx.user.id, input);
  }),

  /**
   * Unit system + currency — free for every tier (backlog P2-6, audit
   * F-DASH-3-2). A unit change also moves the gym KG/LB unit. updateTargets
   * keeps accepting both fields for app builds already in the stores.
   */
  setDisplayPreferences: protectedProcedure
    .input(setDisplayPreferencesInputSchema)
    .mutation(async ({ input, ctx }) => {
      return preferencesService.setDisplayPreferences(ctx.user.id, input);
    }),

  /** Goal, body metrics, cuisine and cadence — premium personalisation. */
  updateTargets: premiumProcedure.input(targetsSchema).mutation(async ({ input, ctx }) => {
    return preferencesService.update(ctx.user.id, input as UpdatePreferencesInput);
  }),

  /**
   * "Plan my week every Sunday" (audit F-PLAN-4-3). Only premium accounts get
   * Sunday plans, but the switch is harmless on free, so it isn't gated —
   * a user who downgrades and comes back keeps their choice.
   */
  setAutoPlanWeekly: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      return preferencesService.setAutoPlanWeekly(ctx.user.id, input.enabled);
    }),

  /**
   * Goal + body metrics are storable on EVERY tier (ux-fixes-plan.md 3.1):
   * the dashboard ring and tracker then show a real target instead of the
   * 2,000 kcal default. Consuming them for AI generation stays premium.
   */
  saveProfileBasics: protectedProcedure
    .input(
      setupSchema
        .pick({
          goal: true,
          biologicalSex: true,
          age: true,
          heightCm: true,
          weightKg: true,
          activityLevel: true,
        })
        .partial(),
    )
    .mutation(async ({ input, ctx }) => {
      return preferencesService.update(ctx.user.id, input as UpdatePreferencesInput);
    }),

  computeTargets: protectedProcedure
    .input(
      z.object({
        goal: z.enum(['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_MUSCLE', 'EAT_HEALTHIER']),
        biologicalSex: z.enum(['MALE', 'FEMALE']),
        age: z.number().int().min(10).max(110),
        heightCm: z.number().positive().max(300),
        weightKg: z.number().positive().max(500),
        activityLevel: z.enum([
          'SEDENTARY',
          'LIGHTLY_ACTIVE',
          'MODERATELY_ACTIVE',
          'VERY_ACTIVE',
          'ATHLETE',
        ]),
      }),
    )
    .query(async ({ input }) => {
      return computeMacroTargets(
        input.weightKg,
        input.heightCm,
        input.age,
        input.activityLevel,
        input.biologicalSex,
        input.goal,
      );
    }),
});
