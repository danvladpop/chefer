import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  bodyMetricsAgeSchema,
  goalSchema,
  LEVEL_0_UNKNOWN_GOALS,
  setDisplayPreferencesInputSchema,
  setHomeDisplayInputSchema,
  setJobsInputSchema,
  setNumbersModeInputSchema,
  setOnboardingIntentInputSchema,
} from '@chefer/types';
import {
  preferencesService,
  type UpdatePreferencesInput,
} from '../application/preferences/preferences.service.js';
import { trainingNutritionService } from '../application/training-nutrition/training-nutrition.service.js';
import { writesBodyMetrics, writesSafetyTerms } from '../lib/health-consent.js';
import { premiumProcedure, protectedProcedure, requireHealthConsent, router } from '../lib/trpc.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const setupSchema = z.object({
  goal: goalSchema,
  biologicalSex: z.enum(['MALE', 'FEMALE']),
  age: bodyMetricsAgeSchema,
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

// T-BUG-X4 (was 43): `setup`'s safety arrays were uncapped, unlike the same
// fields on `updateSafety` (20/20/30 above). The cap is enforced only for
// clients that say `x-chefer-api-level >= 2` (wave 1 on) — installed apps
// (level 0, and the wave-0 JS at level 1, §2.8) are silently truncated
// instead of rejected, so they keep working.
const SAFETY_ARRAY_CAPS = {
  dietaryRestrictions: 20,
  allergies: 20,
  dislikedIngredients: 30,
} as const;

function capSetupSafetyArrays<T extends Record<keyof typeof SAFETY_ARRAY_CAPS, string[]>>(
  input: T,
  clientApiLevel: number,
): T {
  for (const key of Object.keys(SAFETY_ARRAY_CAPS) as (keyof typeof SAFETY_ARRAY_CAPS)[]) {
    const cap = SAFETY_ARRAY_CAPS[key];
    if (input[key].length <= cap) continue;
    if (clientApiLevel >= 2) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${key} can have at most ${cap} entries.`,
      });
    }
    input[key] = input[key].slice(0, cap);
  }
  return input;
}

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
    const result = await preferencesService.get(ctx.user.id);
    const chefProfile = result.chefProfile;
    if (!chefProfile) return result;
    // §2.11, T-35.2: RECOMP/PERFORMANCE are additive goals. Installed apps
    // below x-chefer-api-level 2 (level 0, and the wave-0 JS at level 1)
    // render a fixed GOALS list that predates them — `goal` downgrades to
    // MAINTAIN for those clients; `goalV2` (additive) always carries the
    // true value.
    const goalV2 = chefProfile.goal;
    const needsDowngrade =
      ctx.clientApiLevel < 2 && goalV2 !== null && LEVEL_0_UNKNOWN_GOALS.has(goalV2);
    return {
      ...result,
      chefProfile: {
        ...chefProfile,
        ...(needsDowngrade && { goal: 'MAINTAIN' as const }),
        goalV2,
      },
    };
  }),

  // Personalisation depth (goal, body metrics, cadence) is premium — free
  // users use the curated plans and are prompted to upgrade. Reads stay open
  // so the locked UI can still render existing state.
  // T-26.3: goal + body metrics + safety lists are health data — gated per HEALTH_CONSENT_ENFORCE.
  setup: premiumProcedure
    .input(setupSchema)
    .use(requireHealthConsent())
    .mutation(async ({ input, ctx }) => {
      const capped = capSetupSafetyArrays(input, ctx.clientApiLevel);
      await preferencesService.setup(ctx.user.id, capped);
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

  /**
   * "What should Chefer help with?" (§2.4, T-03.1) — free for every tier,
   * the multi-select onboarding-by-job question and its Settings ›
   * "What you use Chefer for" screen (T-03.5).
   */
  setJobs: protectedProcedure.input(setJobsInputSchema).mutation(async ({ input, ctx }) => {
    return preferencesService.setJobs(ctx.user.id, input, ctx.isMobileClient ? 'mobile' : 'web');
  }),

  /**
   * "Show calories and macros on Today" (§2.4, T-04.1) — free for every
   * tier. Overrides the goal-derived default either way.
   */
  setHomeDisplay: protectedProcedure
    .input(setHomeDisplayInputSchema)
    .mutation(async ({ input, ctx }) => {
      return preferencesService.setHomeDisplay(ctx.user.id, input.showNutritionOnToday);
    }),

  /**
   * WP-08 numbers mode: `FULL` | `PROTEIN_ONLY` | `NONE` (reserved for
   * WP-16) — free for every tier. Independent of `setHomeDisplay`, which
   * older app builds still call.
   */
  setNumbersMode: protectedProcedure
    .input(setNumbersModeInputSchema)
    .mutation(async ({ input, ctx }) => {
      return preferencesService.setNumbersMode(ctx.user.id, input.numbersMode);
    }),

  /** Allergies, restrictions, dislikes — free for every account (P1-2). */
  updateSafety: protectedProcedure
    .input(safetySchema)
    .use(requireHealthConsent(writesSafetyTerms)) // T-26.3 — clearing lists needs no consent
    .mutation(async ({ input, ctx }) => {
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
  updateTargets: premiumProcedure
    .input(targetsSchema)
    .use(requireHealthConsent(writesBodyMetrics)) // T-26.3 — body fields only
    .mutation(async ({ input, ctx }) => {
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
      return preferencesService.setAutoPlanWeekly(
        ctx.user.id,
        input.enabled,
        ctx.isMobileClient ? 'mobile' : 'web',
      );
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
    .use(requireHealthConsent(writesBodyMetrics)) // T-26.3
    .mutation(async ({ input, ctx }) => {
      return preferencesService.update(ctx.user.id, input as UpdatePreferencesInput);
    }),

  computeTargets: protectedProcedure
    .input(
      z.object({
        goal: goalSchema,
        biologicalSex: z.enum(['MALE', 'FEMALE']),
        age: bodyMetricsAgeSchema,
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
    // The preferences macro preview. Lifters get the bodyweight protein rule,
    // like the dashboard; `lifter` (additive) says so for the form's note.
    .query(async ({ input, ctx }) => {
      return trainingNutritionService.previewTargets(ctx.user.id, input);
    }),
});
