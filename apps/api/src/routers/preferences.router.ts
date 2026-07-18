import { z } from 'zod';
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
  servingSize: z.number().int().min(1).max(6),
});

const updateSchema = setupSchema.partial().extend({
  deliveryAddress: z.string().nullable().optional(),
  deliveryCurrency: z.enum(['EUR', 'USD', 'GBP', 'RON']).nullable().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const preferencesRouter = router({
  hasProfile: protectedProcedure.query(async ({ ctx }) => {
    return preferencesService.hasProfile(ctx.user.id);
  }),

  get: protectedProcedure.query(async ({ ctx }) => {
    return preferencesService.get(ctx.user.id);
  }),

  // Profile personalisation is a premium feature — free users use the curated
  // generic plans and are prompted to upgrade. Reads stay open so the locked
  // UI can still render existing state.
  setup: premiumProcedure.input(setupSchema).mutation(async ({ input, ctx }) => {
    await preferencesService.setup(ctx.user.id, input);
    return { success: true as const };
  }),

  update: premiumProcedure.input(updateSchema).mutation(async ({ input, ctx }) => {
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
