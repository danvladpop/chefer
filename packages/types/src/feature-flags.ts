import { z } from 'zod';

// ─── Feature flags (§2.9, T-00.8) ──────────────────────────────────────────────
// Minimal, typed, server-owned. Every key optional; a missing key means OFF.
// Values come from one env var, FEATURE_FLAGS (comma list of enabled keys),
// parsed in apps/api/src/lib/env.ts and exposed by the public profile.flags
// query (apps/api/src/lib/flags.ts holds the parsed set used server-side).
// Clients treat a failed or absent profile.flags as all-off, so old APIs and
// old clients behave exactly as today.

export const featureFlagsSchema = z
  .object({
    /** D-2: the training-day calorie/protein bump, free tier. */
    trainingBumpFree: z.boolean(),
    /** D-2: own-target overrides (UX-35), free tier. */
    ownTargetsFree: z.boolean(),
    /** D-7: household's first week free. */
    householdFirstWeekFree: z.boolean(),
    /** D-7: 2-serving cooking-for, free tier. */
    servingsTwoFree: z.boolean(),
    /** D-2: an editable weekly budget, free tier. */
    budgetFree: z.boolean(),
    /** D-6: structured recipe-link import, free tier. */
    structuredLinkImportFree: z.boolean(),
    /** Q-24 (T-42.3, UX-42): cardio as a first-class exercise type. Off by
     *  default; the owner flips it after checking the W2 minimal slice. */
    cardioLogging: z.boolean(),
    /** Following (code name `friends`): follow people, see their shared
     *  meals/recipes/workouts. Dark by default; ships behind this flag plus
     *  the FRIENDS_ALLOWLIST env var (implementation-plan §8). */
    friends: z.boolean(),
    /** Mobile UX revamp (docs/mobile-ux-revamp/plan.md): the one-tab-bar
     *  shell (Today · Plan · Shop · Train · You) instead of the Food|Gym
     *  tab groups. Off by default; admins and dev builds can preview it
     *  per device from Settings. Mobile only — web ignores it. */
    mobileShellV2: z.boolean(),
    /** Onboarding V4 (docs/onboarding-review-2026-10): the short, Biscuit-led
     *  welcome → sign-up → setup flow with the first-week reveal and the
     *  Premium step. Off by default; both platforms keep today's wizard
     *  until it is flipped. */
    onboardingV4: z.boolean(),
    /** Simple training mode (docs/prd-2026-10/casual-training-mode.md,
     *  phase 1): the "How do you like to train?" question, "Keep it simple"
     *  Today/logger/summary, My week and the training-style switch. Off by
     *  default for a dark launch to testers. */
    simpleTraining: z.boolean(),
  })
  .partial();
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/** Every flag name, for the env parser and tests. */
export const FEATURE_FLAG_KEYS = Object.keys(featureFlagsSchema.shape) as (keyof FeatureFlags)[];

/** All flags off — the default for old/absent `profile.flags` responses. */
export const ALL_FEATURE_FLAGS_OFF: Required<FeatureFlags> = Object.fromEntries(
  FEATURE_FLAG_KEYS.map((key) => [key, false]),
) as Required<FeatureFlags>;
