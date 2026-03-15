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
  // Step 4 — T-011
  cuisinePreferences: string[];
  mealsPerDay: number;
  servingSize: number;
}

export const TOTAL_STEPS = 4;
