import type {
  DayKind,
  NutritionTargets,
  TrainingDayKinds,
  TrainingDayNutrition,
  TrainingDayReason,
} from '@chefer/types';

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
//    UX-06 (rev 2) adds weekday KINDS: `lift` keeps the protein-led bump above;
//    `run` and `long_run` are markers only (owner decision Q-3, 2026-09-30:
//    they never change calorie or protein targets); a long run adds an
//    evening-before carb snack idea. See `hasTrainingDayBump`.
// 3. Post-workout meal (every tier): ~0.4 g protein per kg (per-meal dose
//    from Schoenfeld & Aragon 2018), rounded to 5 g, 20–45 g; 30 g when
//    bodyweight is unknown.

/** Base protein for GAIN_MUSCLE lifters, every tier (the training-day rules build on it). */
export const LIFTER_PROTEIN_G_PER_KG = 1.8;
/**
 * Base protein for lifters by goal, every tier. Goals not listed get no lifter
 * rule. RECOMP and PERFORMANCE (§2.11, T-35.2, rev 2) sit in the same
 * 1.6–2.2 g/kg evidence range as the original four: RECOMP (simultaneous fat
 * loss + muscle retention) uses LOSE_WEIGHT's 2.0 g/kg; PERFORMANCE
 * (maintenance calories, training-driven) uses GAIN_MUSCLE's 1.8 g/kg.
 */
export const LIFTER_PROTEIN_G_PER_KG_BY_GOAL: Readonly<Record<string, number>> = {
  GAIN_MUSCLE: LIFTER_PROTEIN_G_PER_KG,
  LOSE_WEIGHT: 2.0,
  MAINTAIN: 1.6,
  EAT_HEALTHIER: 1.6,
  RECOMP: 2.0,
  PERFORMANCE: 1.8,
};

/**
 * Clinical "adjusted body weight" (§2.11, T-11.4): at a BMI of 30 or higher, a
 * g/kg protein rule applied to actual bodyweight overstates need (the extra
 * mass is disproportionately fat, not lean tissue). The weight used for the
 * protein calculation is capped at what a BMI-30 person of the same height
 * would weigh; below that BMI the actual weight is used unchanged.
 */
export const BMI_ADJUSTED_WEIGHT_THRESHOLD = 30;

/**
 * The bodyweight to use for a g/kg protein calculation, and whether the BMI
 * rule adjusted it. Falls back to the actual weight (unadjusted) when height
 * is unknown — the resolver still works, it just can't apply the rule.
 */
export function adjustedProteinWeightKg(
  weightKg: number,
  heightCm: number | null | undefined,
): { weightKg: number; adjusted: boolean } {
  if (!heightCm || heightCm <= 0) return { weightKg, adjusted: false };
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (bmi < BMI_ADJUSTED_WEIGHT_THRESHOLD) return { weightKg, adjusted: false };
  const capped = BMI_ADJUSTED_WEIGHT_THRESHOLD * heightM * heightM;
  return { weightKg: Math.round(capped * 10) / 10, adjusted: true };
}

/**
 * One sentence fragment per goal, for the coach review and target-explain
 * copy. The canonical goal → wording map (T-35.2, rev 2): L-PLAN's
 * `lib/ai/prompts.ts` (owned by L-PLAN in wave 1) reads this instead of
 * switching on the raw enum, so RECOMP/PERFORMANCE prompt wording stays in
 * sync without L-TRACK editing a file it doesn't own.
 */
export const GOAL_WORDING: Readonly<Record<string, string>> = {
  LOSE_WEIGHT: 'losing weight',
  MAINTAIN: 'maintaining your weight',
  GAIN_MUSCLE: 'gaining muscle',
  EAT_HEALTHIER: 'eating healthier',
  RECOMP: 'recomposition — losing fat while keeping muscle',
  PERFORMANCE: 'training performance',
};

/** "losing weight" style sentence fragment for a goal, or a neutral fallback. */
export function goalWording(goal: string | null | undefined): string {
  return (goal ? GOAL_WORDING[goal] : undefined) ?? 'your nutrition goal';
}

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
  return goal ? (LIFTER_PROTEIN_G_PER_KG_BY_GOAL[goal] ?? null) : null;
}

/**
 * Whether a user with this goal gets the training-day bump on a day of this
 * kind: GAIN_MUSCLE lift days only. Owner decision 2026-09-30 (Q-3): run and
 * long-run days are markers only — they never change calorie or protein
 * targets, and the bump is not widened to other goals. `widened` is kept for
 * call-site compatibility and ignored.
 */
export function hasTrainingDayBump(
  goal: string | null | undefined,
  kind: DayKind = 'lift',
  _widened = false,
): boolean {
  return kind === 'lift' && goal === 'GAIN_MUSCLE';
}

/** `run` and `long_run` — the carb-led kinds. */
export function isRunKind(kind: DayKind | null | undefined): kind is 'run' | 'long_run' {
  return kind === 'run' || kind === 'long_run';
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
 * (GAIN_MUSCLE's 1.8 when the goal is omitted), applying the BMI ≥ 30
 * adjusted-weight rule (§2.11, T-11.4) when `heightCm` is passed. Calories
 * stay fixed: the protein grams removed (or added) move to carbs (both
 * 4 kcal/g), never below zero. Returns whether the adjustment fired, for
 * callers that need to say so (`TargetInputs.usedAdjustedWeight`).
 */
export function withLifterProteinDetailed<T extends NutritionTargets>(
  targets: T,
  bodyweightKg: number,
  goal?: string | null,
  heightCm?: number | null,
): { targets: T; usedAdjustedWeight: boolean } {
  const perKg = lifterProteinGPerKg(goal ?? 'GAIN_MUSCLE') ?? LIFTER_PROTEIN_G_PER_KG;
  const { weightKg: proteinWeightKg, adjusted } = adjustedProteinWeightKg(bodyweightKg, heightCm);
  const proteinG = Math.round(proteinWeightKg * perKg);
  const carbsG = Math.max(0, targets.carbsG + (targets.proteinG - proteinG));
  return { targets: { ...targets, proteinG, carbsG }, usedAdjustedWeight: adjusted };
}

/**
 * `withLifterProteinDetailed` without the BMI adjustment flag, for callers
 * that only need the targets (kept so existing call sites — e.g. the
 * preferences-form preview — don't have to change to pick up the new
 * optional `heightCm` rule; kept additive).
 */
export function withLifterProtein<T extends NutritionTargets>(
  targets: T,
  bodyweightKg: number,
  goal?: string | null,
  heightCm?: number | null,
): T {
  return withLifterProteinDetailed(targets, bodyweightKg, goal, heightCm).targets;
}

export interface TrainingDayBonus {
  kcalBonus: number;
  proteinBonus: number;
  carbsBonus: number;
}

/**
 * The training-day bump for this base calorie target. `lift` (default) is
 * the protein-led bump for a lifter with this bodyweight; `rest`, `run` and
 * `long_run` are zero (Q-3: run days never change the targets).
 */
export function trainingDayBonus(
  baseKcal: number,
  bodyweightKg: number,
  kind: DayKind = 'lift',
): TrainingDayBonus {
  // Q-3 (owner, 2026-09-30): rest and run days never move the targets.
  if (kind === 'rest' || isRunKind(kind)) return { kcalBonus: 0, proteinBonus: 0, carbsBonus: 0 };
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
  /** The day's kind (`lift` / `run` / `long_run`); null on a rest day. */
  kind: DayKind | null;
}

/**
 * Is `localDate` a training day, and of which kind? A workout COMPLETED that
 * day always counts (even off-schedule) as a `lift`; otherwise a routine day
 * planned for that weekday is a `lift` day, and — when the weekday is not a
 * lift day — a user-set `run` / `long_run` kind (`ChefProfile.trainingDayKinds`)
 * makes it a run day. A training pause covers all scheduled kinds on its dates.
 *
 * @param weekday Monday = 0 … Sunday = 6 (RoutineDay.plannedWeekday).
 */
export function resolveTrainingDay(input: {
  localDate: string;
  weekday: number;
  scheduled: { plannedWeekday: number | null; name: string }[];
  completed: { localDate: string; name: string }[];
  paused: boolean;
  /** User-set kinds by weekday ("0"–"6"); only `run` / `long_run` count here. */
  kinds?: TrainingDayKinds | undefined;
}): ResolvedTrainingDay {
  const done = input.completed.find((s) => s.localDate === input.localDate);
  if (done)
    return { isTrainingDay: true, reason: 'COMPLETED', workoutName: done.name, kind: 'lift' };
  if (!input.paused) {
    const planned = input.scheduled.find((d) => d.plannedWeekday === input.weekday);
    if (planned) {
      return { isTrainingDay: true, reason: 'SCHEDULED', workoutName: planned.name, kind: 'lift' };
    }
    const stored = input.kinds?.[String(input.weekday)];
    if (isRunKind(stored)) {
      return { isTrainingDay: true, reason: 'SCHEDULED', workoutName: null, kind: stored };
    }
  }
  return { isTrainingDay: false, reason: null, workoutName: null, kind: null };
}

/**
 * The dashboard payload for a lifter's day. `applied` = the viewer's tier
 * gets the bump (premium); free users get the same numbers as a preview.
 * Rest days carry zero bonuses.
 */
export function buildTrainingDayNutrition(input: {
  base: NutritionTargets;
  bodyweightKg: number;
  /** `kind` is optional so pre-kinds callers keep working (absent = `lift`). */
  day: Omit<ResolvedTrainingDay, 'kind'> & { kind?: DayKind | null };
  premium: boolean;
}): { trainingDay: TrainingDayNutrition; adjustedTargets: NutritionTargets | null } {
  const kind: DayKind = input.day.kind ?? 'lift';
  const bonus = input.day.isTrainingDay
    ? trainingDayBonus(input.base.dailyCalorieTarget, input.bodyweightKg, kind)
    : { kcalBonus: 0, proteinBonus: 0, carbsBonus: 0 };
  const applied = input.premium && input.day.isTrainingDay;
  return {
    trainingDay: {
      isTrainingDay: input.day.isTrainingDay,
      reason: input.day.reason,
      workoutName: input.day.workoutName,
      kcalBonus: bonus.kcalBonus,
      proteinBonus: bonus.proteinBonus,
      applied,
      ...(input.day.isTrainingDay && { kind, carbsBonus: bonus.carbsBonus }),
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
export function trainingDayLine(t: {
  kcalBonus: number;
  proteinBonus: number;
  kind?: DayKind | null | undefined;
}): string {
  const kcal = t.kcalBonus.toLocaleString('en-US');
  if (t.kind === 'long_run') return `Long run day · +${kcal} kcal, mostly carbs`;
  if (t.kind === 'run') return `Run day · +${kcal} kcal, mostly carbs`;
  return `Training day · +${kcal} kcal, +${t.proteinBonus} g protein`;
}

/**
 * The line under the preferences macro preview for a lifter (both
 * platforms): why protein is not the goal's percentage split.
 */
export function lifterProteinNote(proteinGPerKg: number): string {
  return `Protein set from your bodyweight (${proteinGPerKg.toFixed(1)} g/kg) because you train.`;
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
