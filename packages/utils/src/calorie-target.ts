import { ADULT_AGE } from '@chefer/types';

// ─── Shared calorie-target calculation (App Review R-02, Guideline 1.4.1) ───────
// ONE implementation of Mifflin-St Jeor + goal adjustment + safety rules, used
// by the API (`preferences.service.ts`), the web preview and the mobile
// preview, so the number shown while typing is the number the planner uses.
//
// Safety rules (owner-approved):
//  - Under 18 there is never a calorie deficit: a deficit goal resolves to
//    maintenance (the UI says so — MINOR_NO_DEFICIT_NOTE in @chefer/types).
//  - The calorie floor is sex-specific: 1,500 kcal for men, 1,200 for women
//    and when sex is unknown.
//  - Stored ages below 16 (legacy rows) never throw: they are just numbers
//    here, and count as "under 18" for the deficit rule.

export const ACTIVITY_MULTIPLIERS: Partial<Record<string, number>> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  ATHLETE: 1.9,
};

/** Default multiplier when the activity level is missing or unknown. */
export const DEFAULT_ACTIVITY_MULTIPLIER = 1.55;

// RECOMP and PERFORMANCE are maintenance-calorie goals (no surplus/deficit).
export const GOAL_ADJUSTMENTS: Partial<Record<string, number>> = {
  LOSE_WEIGHT: -500,
  MAINTAIN: 0,
  GAIN_MUSCLE: 300,
  EAT_HEALTHIER: 0,
  RECOMP: 0,
  PERFORMANCE: 0,
};

export const CALORIE_FLOOR_FEMALE = 1200;
export const CALORIE_FLOOR_MALE = 1500;

/** Sex-specific minimum daily calories: 1,500 male, 1,200 female / unknown. */
export function calorieFloor(biologicalSex: string | null | undefined): number {
  return biologicalSex === 'MALE' ? CALORIE_FLOOR_MALE : CALORIE_FLOOR_FEMALE;
}

/** True when the person is under 18 (a null/unknown age is treated as an adult — nothing to protect against). */
export function isMinorAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && age < ADULT_AGE;
}

/**
 * The goal's kcal adjustment for this person. Under 18 any deficit (negative
 * adjustment) becomes 0 — maintenance.
 */
export function goalAdjustmentKcal(goal: string | null | undefined, age: number | null): number {
  const adjustment = goal ? (GOAL_ADJUSTMENTS[goal] ?? 0) : 0;
  return adjustment < 0 && isMinorAge(age) ? 0 : adjustment;
}

/** True when a deficit goal was converted to maintenance because of age. */
export function isDeficitBlockedForAge(
  goal: string | null | undefined,
  age: number | null | undefined,
): boolean {
  return !!goal && (GOAL_ADJUSTMENTS[goal] ?? 0) < 0 && isMinorAge(age);
}

/**
 * Mifflin-St Jeor BMR + activity-multiplied TDEE (male +5, female −161,
 * unknown −78). Unknown activity falls back to moderately active.
 */
export function computeBmrTdee(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string | null | undefined,
  biologicalSex: string | null | undefined,
): { bmr: number; tdee: number } {
  const sexConstant = biologicalSex === 'MALE' ? 5 : biologicalSex === 'FEMALE' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const multiplier =
    (activityLevel ? ACTIVITY_MULTIPLIERS[activityLevel] : undefined) ??
    DEFAULT_ACTIVITY_MULTIPLIER;
  return { bmr: Math.round(bmr), tdee: Math.round(bmr * multiplier) };
}

/**
 * Goal-adjusted daily calorie target: TDEE + the goal's adjustment (no deficit
 * under 18), never below the sex-specific floor.
 */
export function computeCalorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string | null | undefined,
  biologicalSex: string | null | undefined,
  goal?: string | null,
): number {
  const { tdee } = computeBmrTdee(weightKg, heightCm, age, activityLevel, biologicalSex);
  return Math.max(calorieFloor(biologicalSex), tdee + goalAdjustmentKcal(goal, age));
}

/**
 * Everything a form preview needs in one call: maintenance, the (age-safe)
 * target, and whether a deficit was blocked or the floor applied.
 */
export function previewCalorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string | null | undefined,
  biologicalSex: string | null | undefined,
  goal?: string | null,
): { maintenance: number; target: number; deficitBlocked: boolean; flooredAt: number | null } {
  const { tdee } = computeBmrTdee(weightKg, heightCm, age, activityLevel, biologicalSex);
  const floor = calorieFloor(biologicalSex);
  const raw = tdee + goalAdjustmentKcal(goal, age);
  return {
    maintenance: tdee,
    target: Math.max(floor, raw),
    deficitBlocked: isDeficitBlockedForAge(goal, age),
    flooredAt: raw < floor ? floor : null,
  };
}
