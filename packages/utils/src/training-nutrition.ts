import type { NutritionTargets, TrainingDayNutrition, TrainingDayReason } from '@chefer/types';

// ─── Training-aware nutrition (audit P2-4, gym_plan.md D11 follow-up) ─────────
// Deterministic rules that connect the gym to the food side. No AI.
//
// Who: a LIFTER is a user with a set-up gym profile, a goal and a known
// bodyweight (latest weight log, else the nutrition profile).
//
// 1. Base protein (every tier), by goal, replacing the goal's percentage
//    split. Calories never change: the grams moved go to/from carbs.
//      GAIN_MUSCLE   1.8 g/kg — the split, capped at 2.2 g/kg, put every
//                    lifter at the cap (175 g for 80 kg), a target no free
//                    plan came near. Inside the 1.6–2.2 g/kg range (ISSN
//                    position stand; Morton et al. 2018: gains plateau
//                    around 1.6, upper CI 2.2).
//      LOSE_WEIGHT   2.0 g/kg — a deficit raises the protein needed to keep
//                    muscle (Helms et al. 2014: ~2.3–3.1 g/kg of lean mass,
//                    roughly 1.8–2.7 g/kg of bodyweight). 2.0 is reachable
//                    on a cut without crowding out carbs.
//      MAINTAIN,
//      EAT_HEALTHIER 1.6 g/kg — at maintenance calories the plateau point
//                    of Morton et al. is enough; the 20–25% splits gave
//                    lifters ~1.2–1.5 g/kg.
// 2. Training day — GAIN_MUSCLE lifters only (a surplus goal; eating back
//    training calories would erode a cut's deficit). Premium applies it,
//    free sees a locked preview: on a day with a completed or scheduled
//    workout, protein rises to 2.2 g/kg and calories by 10% of the base
//    target (rounded to 10, kept within 150–300 kcal); the kcal not covered
//    by the extra protein goes to carbs.
// 3. Post-workout meal (every tier): ~0.4 g protein per kg (per-meal dose
//    from Schoenfeld & Aragon 2018), rounded to 5 g, 20–45 g; 30 g when
//    bodyweight is unknown.

/** Base protein for GAIN_MUSCLE lifters, every tier (the training-day rules build on it). */
export const LIFTER_PROTEIN_G_PER_KG = 1.8;
/** Base protein for lifters by goal, every tier. Goals not listed get no lifter rule. */
export const LIFTER_PROTEIN_G_PER_KG_BY_GOAL: Readonly<Record<string, number>> = {
  GAIN_MUSCLE: LIFTER_PROTEIN_G_PER_KG,
  LOSE_WEIGHT: 2.0,
  MAINTAIN: 1.6,
  EAT_HEALTHIER: 1.6,
};
/** Protein on a training day (premium). */
export const TRAINING_DAY_PROTEIN_G_PER_KG = 2.2;
/** Training-day calorie bump: a share of the base target, rounded and clamped. */
export const TRAINING_DAY_KCAL = { share: 0.1, min: 150, max: 300 } as const;
/** Post-workout meal protein per kg bodyweight. */
export const POST_WORKOUT_PROTEIN_G_PER_KG = 0.4;

const POST_WORKOUT_DEFAULT_G = 30;
const POST_WORKOUT_MIN_G = 20;
const POST_WORKOUT_MAX_G = 45;

/** A lifter's base protein (g/kg) for this goal, or null when the goal has no lifter rule. */
export function lifterProteinGPerKg(goal: string | null | undefined): number | null {
  return (goal && LIFTER_PROTEIN_G_PER_KG_BY_GOAL[goal]) || null;
}

/** Whether a lifter with this goal gets the training-day bump (GAIN_MUSCLE only). */
export function hasTrainingDayBump(goal: string | null | undefined): boolean {
  return goal === 'GAIN_MUSCLE';
}

/** Whether the lifter rules apply: set-up gym profile + a goal with a g/kg rule + bodyweight. */
export function isLifter(input: {
  goal: string | null | undefined;
  hasGymProfile: boolean;
  bodyweightKg: number | null | undefined;
}): boolean {
  return (
    input.hasGymProfile &&
    lifterProteinGPerKg(input.goal) !== null &&
    typeof input.bodyweightKg === 'number' &&
    input.bodyweightKg > 0
  );
}

/**
 * Replaces the protein target with the lifter's g/kg base for their goal
 * (GAIN_MUSCLE's 1.8 when the goal is omitted). Calories stay fixed: the
 * protein grams removed (or added) move to carbs (both 4 kcal/g), never
 * below zero.
 */
export function withLifterProtein<T extends NutritionTargets>(
  targets: T,
  bodyweightKg: number,
  goal?: string | null,
): T {
  const perKg = lifterProteinGPerKg(goal ?? 'GAIN_MUSCLE') ?? LIFTER_PROTEIN_G_PER_KG;
  const proteinG = Math.round(bodyweightKg * perKg);
  const carbsG = Math.max(0, targets.carbsG + (targets.proteinG - proteinG));
  return { ...targets, proteinG, carbsG };
}

export interface TrainingDayBonus {
  kcalBonus: number;
  proteinBonus: number;
  carbsBonus: number;
}

/** The training-day bump for a lifter with this base calorie target and bodyweight. */
export function trainingDayBonus(baseKcal: number, bodyweightKg: number): TrainingDayBonus {
  const raw = Math.round((baseKcal * TRAINING_DAY_KCAL.share) / 10) * 10;
  const kcalBonus = Math.min(TRAINING_DAY_KCAL.max, Math.max(TRAINING_DAY_KCAL.min, raw));
  const proteinBonus = Math.round(
    bodyweightKg * (TRAINING_DAY_PROTEIN_G_PER_KG - LIFTER_PROTEIN_G_PER_KG),
  );
  const carbsBonus = Math.max(0, Math.round((kcalBonus - proteinBonus * 4) / 4));
  return { kcalBonus, proteinBonus, carbsBonus };
}

/** Base targets plus the training-day bump (fat unchanged). */
export function applyTrainingDayBonus(
  base: NutritionTargets,
  bonus: TrainingDayBonus,
): NutritionTargets {
  return {
    dailyCalorieTarget: base.dailyCalorieTarget + bonus.kcalBonus,
    proteinG: base.proteinG + bonus.proteinBonus,
    carbsG: base.carbsG + bonus.carbsBonus,
    fatG: base.fatG,
  };
}

export interface ResolvedTrainingDay {
  isTrainingDay: boolean;
  reason: TrainingDayReason | null;
  workoutName: string | null;
}

/**
 * Is `localDate` a training day? A workout COMPLETED that day always counts
 * (even off-schedule); otherwise a routine day planned for that weekday
 * counts unless a training pause covers the date.
 *
 * @param weekday Monday = 0 … Sunday = 6 (RoutineDay.plannedWeekday).
 */
export function resolveTrainingDay(input: {
  localDate: string;
  weekday: number;
  scheduled: { plannedWeekday: number | null; name: string }[];
  completed: { localDate: string; name: string }[];
  paused: boolean;
}): ResolvedTrainingDay {
  const done = input.completed.find((s) => s.localDate === input.localDate);
  if (done) return { isTrainingDay: true, reason: 'COMPLETED', workoutName: done.name };
  if (!input.paused) {
    const planned = input.scheduled.find((d) => d.plannedWeekday === input.weekday);
    if (planned) return { isTrainingDay: true, reason: 'SCHEDULED', workoutName: planned.name };
  }
  return { isTrainingDay: false, reason: null, workoutName: null };
}

/**
 * The dashboard payload for a lifter's day. `applied` = the viewer's tier
 * gets the bump (premium); free users get the same numbers as a preview.
 * Rest days carry zero bonuses.
 */
export function buildTrainingDayNutrition(input: {
  base: NutritionTargets;
  bodyweightKg: number;
  day: ResolvedTrainingDay;
  premium: boolean;
}): { trainingDay: TrainingDayNutrition; adjustedTargets: NutritionTargets | null } {
  const bonus = input.day.isTrainingDay
    ? trainingDayBonus(input.base.dailyCalorieTarget, input.bodyweightKg)
    : { kcalBonus: 0, proteinBonus: 0, carbsBonus: 0 };
  const applied = input.premium && input.day.isTrainingDay;
  return {
    trainingDay: {
      ...input.day,
      kcalBonus: bonus.kcalBonus,
      proteinBonus: bonus.proteinBonus,
      applied,
      basis: {
        bodyweightKg: Math.round(input.bodyweightKg * 10) / 10,
        proteinGPerKg: LIFTER_PROTEIN_G_PER_KG,
        trainingDayProteinGPerKg: TRAINING_DAY_PROTEIN_G_PER_KG,
      },
    },
    adjustedTargets: applied ? applyTrainingDayBonus(input.base, bonus) : null,
  };
}

/** "Training day · +250 kcal, +30 g protein" — one line for both platforms. */
export function trainingDayLine(t: { kcalBonus: number; proteinBonus: number }): string {
  return `Training day · +${t.kcalBonus.toLocaleString('en-US')} kcal, +${t.proteinBonus} g protein`;
}

/** Protein to aim for in the meal after a workout (grams, rounded to 5). */
export function postWorkoutProteinG(bodyweightKg: number | null | undefined): number {
  if (typeof bodyweightKg !== 'number' || !(bodyweightKg > 0)) return POST_WORKOUT_DEFAULT_G;
  const grams = Math.round((bodyweightKg * POST_WORKOUT_PROTEIN_G_PER_KG) / 5) * 5;
  return Math.min(POST_WORKOUT_MAX_G, Math.max(POST_WORKOUT_MIN_G, grams));
}

/** Weekday names in plan order (Monday = 0), for prompts and copy. */
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * The week's training days (Monday = 0), one per weekday, from the active
 * routine's planned weekdays — the input the meal planners bias toward.
 */
export function trainingWeekdays(
  scheduled: { plannedWeekday: number | null; name: string }[],
): { dayOfWeek: number; label: string; workoutName: string }[] {
  const byDay = new Map<number, string>();
  for (const d of scheduled) {
    if (d.plannedWeekday === null || d.plannedWeekday < 0 || d.plannedWeekday > 6) continue;
    if (!byDay.has(d.plannedWeekday)) byDay.set(d.plannedWeekday, d.name);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, workoutName]) => ({
      dayOfWeek,
      label: WEEKDAY_NAMES[dayOfWeek] ?? String(dayOfWeek),
      workoutName,
    }));
}
