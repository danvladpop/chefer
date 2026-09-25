// Mirror of the Prisma enums used by preferences.setup / saveProfileBasics
// (apps/api/src/routers/preferences.router.ts). Kept local — same convention
// as apps/web/src/features/onboarding/types.ts — so client code doesn't need
// to import @chefer/database.

export type Goal = 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE' | 'EAT_HEALTHIER';

export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'ATHLETE';

export type BiologicalSex = 'MALE' | 'FEMALE';

export interface GoalOption {
  value: Goal;
  label: string;
  icon: string;
  description: string;
  /** How the goal changes the daily calorie target (web step-goal.tsx). */
  calorieEffect: string;
}

export const GOALS: GoalOption[] = [
  {
    value: 'LOSE_WEIGHT',
    label: 'Lose Weight',
    icon: '⚖️',
    description: 'Reduce body fat and reach a healthier weight',
    calorieEffect: '−500 kcal/day deficit',
  },
  {
    value: 'MAINTAIN',
    label: 'Maintain Weight',
    icon: '🎯',
    description: 'Keep your current weight while eating well',
    calorieEffect: 'Maintenance calories',
  },
  {
    value: 'GAIN_MUSCLE',
    label: 'Gain Muscle',
    icon: '💪',
    description: 'Build strength and increase lean muscle mass',
    calorieEffect: '+300 kcal/day surplus',
  },
  {
    value: 'EAT_HEALTHIER',
    label: 'Eat Healthier',
    icon: '🥗',
    description: 'Improve overall nutrition and eating habits',
    calorieEffect: 'Maintenance calories, better macros',
  },
];

export interface ActivityOption {
  value: ActivityLevel;
  label: string;
  description: string;
}

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  { value: 'SEDENTARY', label: 'Sedentary', description: 'Little or no exercise, desk job' },
  {
    value: 'LIGHTLY_ACTIVE',
    label: 'Lightly Active',
    description: 'Light exercise 1–3 days/week',
  },
  {
    value: 'MODERATELY_ACTIVE',
    label: 'Moderately Active',
    description: 'Moderate exercise 3–5 days/week',
  },
  { value: 'VERY_ACTIVE', label: 'Very Active', description: 'Hard exercise 6–7 days/week' },
  { value: 'ATHLETE', label: 'Athlete', description: 'Very hard exercise or physical job' },
];

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  ATHLETE: 1.9,
};

/** Mirrors the API's GOAL_ADJUSTMENTS (preferences.service.ts) — see step-metrics.tsx on web. */
export const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  LOSE_WEIGHT: -500,
  MAINTAIN: 0,
  GAIN_MUSCLE: 300,
  EAT_HEALTHIER: 0,
};

/**
 * Mifflin-St Jeor, mirrored from web's step-metrics.tsx so the preview shows
 * the same number the API's computeCalorieTarget will use.
 */
export function estimateCalories(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel | null,
  biologicalSex: BiologicalSex | null,
): number {
  const sexConstant = biologicalSex === 'MALE' ? 5 : biologicalSex === 'FEMALE' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const multiplier = activityLevel ? ACTIVITY_MULTIPLIERS[activityLevel] : 1.55;
  return Math.round(bmr * multiplier);
}

/** Same floor as the API (computeCalorieTarget): never below 1200 kcal. */
export function estimateCalorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel | null,
  biologicalSex: BiologicalSex | null,
  goal: Goal | null,
): number {
  const maintenance = estimateCalories(weightKg, heightCm, age, activityLevel, biologicalSex);
  const adjustment = goal ? GOAL_ADJUSTMENTS[goal] : 0;
  return Math.max(1200, maintenance + adjustment);
}

export const DIET_OPTIONS: { value: string; icon: string }[] = [
  { value: 'Omnivore', icon: '🍖' },
  { value: 'Vegetarian', icon: '🥦' },
  { value: 'Vegan', icon: '🌱' },
  { value: 'Pescatarian', icon: '🐟' },
  { value: 'Keto', icon: '🥑' },
  { value: 'Paleo', icon: '🍗' },
  { value: 'Gluten-Free', icon: '🌾' },
  { value: 'Dairy-Free', icon: '🥛' },
];

export const CUISINE_OPTIONS: { value: string; icon: string }[] = [
  { value: 'Italian', icon: '🍝' },
  { value: 'Mexican', icon: '🌮' },
  { value: 'Asian', icon: '🍜' },
  { value: 'Mediterranean', icon: '🫒' },
  { value: 'American', icon: '🍔' },
  { value: 'Indian', icon: '🍛' },
  { value: 'Middle Eastern', icon: '🧆' },
  { value: 'Japanese', icon: '🍱' },
  { value: 'Thai', icon: '🌶️' },
  { value: 'Greek', icon: '🥙' },
  { value: 'French', icon: '🥐' },
  { value: 'Korean', icon: '🥢' },
];

export interface MetricsValue {
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

export interface SafetyValue {
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}
