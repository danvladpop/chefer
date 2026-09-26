// ─── Training-aware nutrition (audit P2-4, gym_plan.md D11 follow-up) ─────────
// Shapes shared by the API (dashboard summary) and both clients. The pure
// maths lives in @chefer/utils (training-nutrition.ts).

/** Why today counts as a training day: a finished workout wins over the schedule. */
export type TrainingDayReason = 'COMPLETED' | 'SCHEDULED';

/** A day's calorie and macro targets (the same four numbers resolveDailyTargets returns). */
export interface NutritionTargets {
  dailyCalorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Today's training-day adjustment, sent on `dashboard.summary.nutrition`
 * for lifters (set-up gym profile, goal GAIN_MUSCLE, bodyweight known).
 * Additive: older clients ignore it and keep showing the base targets.
 */
export interface TrainingDayNutrition {
  isTrainingDay: boolean;
  reason: TrainingDayReason | null;
  /** The finished or scheduled workout's name ("Full Body A"), when known. */
  workoutName: string | null;
  /** Extra kcal on a training day (0 on rest days). */
  kcalBonus: number;
  /** Extra protein grams on a training day (0 on rest days). */
  proteinBonus: number;
  /**
   * Whether the bump is applied to today's targets. Premium only
   * (PLAN_FEATURES.trainingNutrition); free users get the same numbers as a
   * locked preview and their targets stay at the base.
   */
  applied: boolean;
  /** How the protein numbers were derived, for the "why" copy. */
  basis: { bodyweightKg: number; proteinGPerKg: number; trainingDayProteinGPerKg: number };
}
