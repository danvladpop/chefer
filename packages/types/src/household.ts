import { z } from 'zod';

// ─── Audience + household (backlog P2-3; audit F-PM-6, F-PM-8) ────────────────
// One people model: the household (owner + members) is the only answer to
// "who am I cooking for". The onboarding intent routes each audience to its
// first screen and is stored on the chef profile.

/** "What brings you here?" — onboarding step 0. */
export const ONBOARDING_INTENTS = ['EAT_BETTER', 'HOUSEHOLD', 'TRAIN'] as const;
export const onboardingIntentSchema = z.enum(ONBOARDING_INTENTS);
export type OnboardingIntent = z.infer<typeof onboardingIntentSchema>;

// ─── Jobs (§2.4, T-03.1, rev 2) ────────────────────────────────────────────────
// `ChefProfile.onboardingJobs` — what the user is here to do. Replaces the
// single `onboardingIntent` for new clients; `effectiveJobs()` in
// `@chefer/utils` maps a legacy intent onto this set on read, so old clients
// (which only ever wrote an intent) still get a sensible jobs list.
// `TRACK` ("Track what I eat") keeps the ring home on Today (D20) and adds
// the "Your targets" onboarding step.
export const ONBOARDING_JOBS = [
  'TRAIN',
  'PLAN_MEALS',
  'HOUSEHOLD',
  'USE_WHAT_I_HAVE',
  'SAVED_RECIPES',
  'TRACK',
] as const;
export const onboardingJobSchema = z.enum(ONBOARDING_JOBS);
export type OnboardingJob = z.infer<typeof onboardingJobSchema>;

/** preferences.setIntent — free for every tier. */
export const setOnboardingIntentInputSchema = z.object({ intent: onboardingIntentSchema });
export type SetOnboardingIntentInput = z.infer<typeof setOnboardingIntentInputSchema>;

/** Relative portion sizes offered in every member editor (0.5 = a kid). */
export const HOUSEHOLD_PORTION_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/** household.add / household.update fields (validated on the API). */
export const householdMemberFieldsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** 0.5 kid … 1.5 big eater. */
  portionFactor: z.number().min(0.25).max(3).default(1),
  isKid: z.boolean().default(false),
  dietaryRestrictions: z.array(z.string().max(60)).max(20).default([]),
  allergies: z.array(z.string().max(60)).max(20).default([]),
  dislikedIngredients: z.array(z.string().max(60)).max(30).default([]),
});
export type HouseholdMemberFields = z.infer<typeof householdMemberFieldsSchema>;
