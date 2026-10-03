// Mirror of the Prisma enums used by preferences.setup / saveProfileBasics
// (apps/api/src/routers/preferences.router.ts). Kept local — same convention
// as apps/web/src/features/onboarding/types.ts — so client code doesn't need
// to import @chefer/database.

import type { Ionicons } from '@expo/vector-icons';
import { computeBmrTdee, computeCalorieTarget } from '@chefer/utils';

// §2.11, T-35.2 (rev 2): RECOMP and PERFORMANCE are additive over the
// original four — old server responses/requests that only know the original
// four keep working (preferences.get downgrades them to MAINTAIN for a
// level-0 client; this app build sends `x-chefer-api-level: 1` and gets the
// true value).
export type Goal =
  | 'LOSE_WEIGHT'
  | 'MAINTAIN'
  | 'GAIN_MUSCLE'
  | 'EAT_HEALTHIER'
  | 'RECOMP'
  | 'PERFORMANCE';

export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'ATHLETE';

export type BiologicalSex = 'MALE' | 'FEMALE';

type IconName = keyof typeof Ionicons.glyphMap;

export interface GoalOption {
  value: Goal;
  label: string;
  /** Ionicons glyph (UX-ONB-10: the goal cards used emoji next to Ionicons everywhere else). */
  icon: IconName;
  description: string;
  /** How the goal changes the daily calorie target (web step-goal.tsx). */
  calorieEffect: string;
}

export const GOALS: GoalOption[] = [
  {
    value: 'LOSE_WEIGHT',
    label: 'Lose Weight',
    icon: 'scale-outline',
    description: 'Reduce body fat and reach a healthier weight',
    calorieEffect: '−500 kcal/day deficit',
  },
  {
    value: 'MAINTAIN',
    label: 'Maintain Weight',
    icon: 'locate-outline',
    description: 'Keep your current weight while eating well',
    calorieEffect: 'Maintenance calories',
  },
  {
    value: 'GAIN_MUSCLE',
    label: 'Gain Muscle',
    icon: 'barbell-outline',
    description: 'Build strength and increase lean muscle mass',
    calorieEffect: '+300 kcal/day surplus',
  },
  {
    value: 'EAT_HEALTHIER',
    label: 'Eat Healthier',
    icon: 'leaf-outline',
    description: 'Improve overall nutrition and eating habits',
    calorieEffect: 'Maintenance calories, better macros',
  },
  {
    value: 'RECOMP',
    label: 'Recomposition',
    icon: 'sync-outline',
    description: 'Lose fat and build muscle at the same time',
    calorieEffect: 'Maintenance calories',
  },
  {
    value: 'PERFORMANCE',
    label: 'Performance',
    icon: 'speedometer-outline',
    description: 'Fuel training and recovery, not a scale number',
    calorieEffect: 'Maintenance calories',
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

/**
 * Maintenance calories (Mifflin-St Jeor TDEE). The calculation itself lives in
 * @chefer/utils (calorie-target.ts), shared with the API and web, so the preview
 * always shows the number the planner will use.
 */
export function estimateCalories(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel | null,
  biologicalSex: BiologicalSex | null,
): number {
  return computeBmrTdee(weightKg, heightCm, age, activityLevel, biologicalSex).tdee;
}

/**
 * Goal-adjusted target as the API computes it: no deficit under 18 and a
 * sex-specific floor (1,500 male / 1,200 otherwise) — App Review R-02.
 */
export function estimateCalorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel | null,
  biologicalSex: BiologicalSex | null,
  goal: Goal | null,
): number {
  return computeCalorieTarget(weightKg, heightCm, age, activityLevel, biologicalSex, goal);
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
