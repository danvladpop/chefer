// ─── Training-aware nutrition (audit P2-4, gym_plan.md D11 follow-up) ─────────
// Shapes shared by the API (dashboard summary) and both clients. The pure
// maths lives in @chefer/utils (training-nutrition.ts).

import { z } from 'zod';

// ─── Weekday kinds (§2.6, UX-06, rev 2) ────────────────────────────────────────
// Each weekday is one of these. `lift` comes from the active routine; `run` /
// `long_run` / `rest` are set by the user (`training.setDayKinds`, wave 1
// T-06.1) and stored on `ChefProfile.trainingDayKinds Json` (`{ "5": "long_run" }`).
export const dayKindSchema = z.enum(['lift', 'run', 'long_run', 'rest']);
export type DayKind = z.infer<typeof dayKindSchema>;

/** `ChefProfile.trainingDayKinds` — weekday (0 = Monday, matches `planDays`) → kind. */
export const trainingDayKindsSchema = z.record(z.string(), dayKindSchema);
export type TrainingDayKinds = z.infer<typeof trainingDayKindsSchema>;

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
  /**
   * §2.6 (rev 2): which kind of training day this is. Absent on responses
   * from before kinds existed — clients read it as `lift`.
   */
  kind?: DayKind;
  /** Extra carbs (g) the bump adds (all of a run day's bump; the kcal left after the extra protein on a lift day). */
  carbsBonus?: number;
  /** How the protein numbers were derived, for the "why" copy. */
  basis: { bodyweightKg: number; proteinGPerKg: number; trainingDayProteinGPerKg: number };
}

// ─── Plan + Today payloads (UX-06, T-06.2 / T-06.3) ────────────────────────────
// Additive shapes the API sends and both clients render. The maths lives in
// @chefer/utils (training-nutrition.ts); these are only the wire shapes.

/**
 * One training weekday of a plan week — `mealPlan.getForWeek.trainingDays`.
 * Present for every weekday that is a lift day (the routine's planned
 * weekdays or a workout completed that date) or a user-set run kind, on
 * every tier and for every goal: the MARKER is universal, the numbers are
 * not — `kcalBonus`/`proteinBonus` are 0 where the bump does not apply to
 * this user's goal (so non-goal users see no kcal).
 */
export interface PlanTrainingDay {
  /** 0 = Monday … 6 = Sunday (matches `planDays`). */
  dayOfWeek: number;
  /** "Wednesday". */
  dayName: string;
  kind: DayKind;
  /** "Upper A" for a lift day, when known. */
  workoutName: string | null;
  /** Extra kcal on this day (0 where the bump does not apply). */
  kcalBonus: number;
  proteinBonus: number;
  carbsBonus: number;
  /** A workout was completed on this date. */
  done: boolean;
  /**
   * The viewer's tier/flag gets the bump on this day's targets. When false
   * the numbers above are an Explain-sheet preview and the day target does
   * not move (D-2 alternative).
   */
  applied: boolean;
  /** This day's calorie target with the bump applied when `applied`. */
  targetKcal?: number;
  targetProteinG?: number;
  /** `long_run` only: the evening-before carb snack idea (shown on the day before). */
  preRunSnack?: string;
}

/** `mealPlan.getForWeek.trainingBasis` — the numbers the Explain sheet quotes. */
export interface PlanTrainingBasis {
  restKcal: number;
  restProteinG: number;
  /** Lifter base protein (g per kg), null for a runner without the lifter rule. */
  proteinGPerKg: number | null;
  bodyweightKg: number | null;
}

/** One column of `dashboard.summary.weekGlance` (Mon…Sun, always 7). */
export interface WeekGlanceDay {
  dayOfWeek: number;
  /** Planned meals that day. */
  meals: number;
  /** Training that day, when any: `done` = a workout was completed. */
  training?: { kind: DayKind; status: 'planned' | 'done'; workoutName: string | null };
}

/** One curated refuel snack after safety filtering — `dashboard.summary.refuelSnacks`. */
export interface RefuelSnackDto {
  id: string;
  name: string;
  proteinG: number;
  kcal: number;
  carbsG: number;
  fatG: number;
}
