import type { OnboardingIntent } from '@chefer/types';

// Mirror of the Prisma enums — kept here so client components don't need
// to import @chefer/database (which pulls in the Prisma server runtime).

export type Goal = 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE' | 'EAT_HEALTHIER';

export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'ATHLETE';

export type BiologicalSex = 'MALE' | 'FEMALE';

// Accumulated state across all 4 wizard steps.
// Fields for steps 3–4 are added as those tasks are implemented.
export interface WizardData {
  // Step 1 — T-008
  goal: Goal | null;
  // Step 2 — T-009
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  // Step 3 — T-010
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
  // Step 4 — T-011. No serving size: the household is the one people
  // model (P2-3, audit F-PM-8).
  cuisinePreferences: string[];
  mealsPerDay: number;
}

export const TOTAL_STEPS = 4;

export const EMPTY_WIZARD_DATA: WizardData = {
  goal: null,
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
  cuisinePreferences: [],
  mealsPerDay: 3,
};

/** Shape of preferences.get, narrowed to what the wizard reads. */
export interface SavedPreferences {
  chefProfile: {
    goal: string | null;
    biologicalSex: string | null;
    age: number | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: string | null;
    /** Onboarding step 0 answer (P2-3); absent on older API responses. */
    onboardingIntent?: string | null;
  } | null;
  dietaryPreferences: {
    dietaryRestrictions: string[];
    allergies: string[];
    dislikedIngredients: string[];
    cuisinePreferences: string[];
    mealsPerDay: number;
  } | null;
}

/**
 * Starts the wizard from what the user already saved. Opening onboarding
 * again (e.g. "Set up now" after upgrading) used to start blank, and Finish
 * then saved empty allergy lists over the real ones (audit F-ONB-1-1).
 */
export function wizardDataFromPreferences(saved: SavedPreferences | null): WizardData {
  if (!saved) return EMPTY_WIZARD_DATA;
  const profile = saved.chefProfile;
  const diet = saved.dietaryPreferences;
  return {
    goal: (profile?.goal as Goal | null | undefined) ?? null,
    biologicalSex: (profile?.biologicalSex as BiologicalSex | null | undefined) ?? null,
    age: profile?.age ?? null,
    heightCm: profile?.heightCm ?? null,
    weightKg: profile?.weightKg ?? null,
    activityLevel: (profile?.activityLevel as ActivityLevel | null | undefined) ?? null,
    dietaryRestrictions: diet?.dietaryRestrictions ?? [],
    allergies: diet?.allergies ?? [],
    dislikedIngredients: diet?.dislikedIngredients ?? [],
    cuisinePreferences: diet?.cuisinePreferences ?? [],
    mealsPerDay: diet?.mealsPerDay ?? EMPTY_WIZARD_DATA.mealsPerDay,
  };
}

const INTENTS: readonly OnboardingIntent[] = ['EAT_BETTER', 'HOUSEHOLD', 'TRAIN'];

/** The saved onboarding intent, or null when never answered (P2-3). */
export function savedIntent(saved: SavedPreferences | null): OnboardingIntent | null {
  const raw = saved?.chefProfile?.onboardingIntent;
  return INTENTS.find((i) => i === raw) ?? null;
}
