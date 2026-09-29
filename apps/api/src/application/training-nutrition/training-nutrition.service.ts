import {
  gymProfileRepository,
  routineRepository,
  trainingPauseRepository,
  weightEntryRepository,
  workoutSessionRepository,
  type IGymProfileRepository,
  type IRoutineRepository,
  type ITrainingPauseRepository,
  type IWeightEntryRepository,
  type IWorkoutSessionRepository,
} from '@chefer/database';
import type {
  NutritionTargets,
  PlanTrainingBasis,
  PlanTrainingDay,
  RefuelSnackDto,
  TrainingDayNutrition,
} from '@chefer/types';
import {
  buildPlanTrainingDays,
  buildTrainingDayNutrition,
  hasTrainingDayBump,
  isLifter,
  LIFTER_PROTEIN_G_PER_KG,
  lifterProteinGPerKg,
  PROTEIN_SNACKS,
  resolveTrainingDay,
  takeSnacks,
  withLifterProtein,
  type ResolvedTrainingDay,
} from '@chefer/utils';
import { isRecipeSafe } from '../../lib/curated-recipes/safety.js';
import {
  computeMacroTargets,
  resolveDailyTargets,
  type DailyTargets,
  type MacroTargets,
} from '../preferences/preferences.service.js';
import {
  trainingDaysService,
  type TrainingDaysService,
} from '../training-days/training-days.service.js';

// ─── Training-aware nutrition (audit P2-4) ────────────────────────────────────
// Loads the gym facts the food side needs. The rules themselves are pure and
// live in @chefer/utils (training-nutrition.ts); this service only reads.
//
//   loadLifter      → is this user a lifter, and their bodyweight (every
//                     target consumer: dashboard, tracker, generation, chat,
//                     coach review)
//   trainingDayFor  → is `localDate` a training day
//   targetsForDay   → one day's targets + training-day bump (dashboard AND
//                     tracker, so the two can never disagree)
//   trainingSchedule→ the active routine's planned weekdays (generation)
//   trainingWeek    → a plan week's training days with their kinds (UX-06,
//                     T-06.2) — the payload behind `mealPlan.getForWeek.trainingDays`
//   refuelSnacks    → the curated refuel snacks, safety-filtered (T-06.3)
//
// The bump's gate (T-06.1, D-2): a caller passes `access` = the viewer's
// `trainingDayTargets` entitlement; this service ORs the server flag
// `trainingBumpFree` onto it, so free users get the bump when the owner flips
// the flag and every caller (dashboard, tracker) agrees. The same flag widens
// which goals get which kinds (Q-3, `hasTrainingDayBump`). Off by default.

export interface LifterContext {
  /**
   * Bodyweight (kg) when the lifter rules apply — set-up gym profile, a goal
   * with a g/kg rule (lifterProteinGPerKg), bodyweight known — else null.
   * Pass it to resolveDailyTargets as `lifterBodyweightKg`.
   */
  lifterBodyweightKg: number | null;
}

/** Body metrics the preferences form previews targets for. */
export interface PreviewMetrics {
  goal: string;
  biologicalSex: string | null;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: string;
}

/**
 * The preferences-form preview: the goal's macro targets for the typed
 * metrics, with lifter protein applied when the user is a lifter (`lifter`
 * then says why, so the form can explain the number).
 */
export interface PreviewTargets extends MacroTargets {
  lifter: { bodyweightKg: number; proteinGPerKg: number } | null;
}

type ScheduledDay = { plannedWeekday: number | null; name: string };

/** Whether the D-2 / Q-3 flag is on. Lazy import: `lib/flags` validates env at load. */
async function trainingBumpFlag(): Promise<boolean> {
  try {
    const { isFlagEnabled } = await import('../../lib/flags.js');
    return isFlagEnabled('trainingBumpFree');
  } catch {
    // Env not loaded (a pure unit test): the flag is off.
    return false;
  }
}

/**
 * The date (YYYY-MM-DD) of weekday `dayOfWeek` (0 = Mon) in the week starting
 * `weekStart`. `weekStart` is server-local midnight (the meal-plan week key)
 * or, with `utc`, UTC midnight (a client-supplied `localDate`, dashboard).
 */
export function planDayLocalDate(weekStart: Date, dayOfWeek: number, utc = false): string {
  const d = new Date(weekStart);
  if (utc) d.setUTCDate(d.getUTCDate() + dayOfWeek);
  else d.setDate(d.getDate() + dayOfWeek);
  const y = utc ? d.getUTCFullYear() : d.getFullYear();
  const m = String((utc ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
  const day = String(utc ? d.getUTCDate() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** What `trainingWeek` returns for one plan week. */
export interface TrainingWeek {
  trainingDays: PlanTrainingDay[];
  /** Rest-day targets and protein basis the Explain sheet quotes; null with no training days. */
  basis: PlanTrainingBasis | null;
}

/** The training-day payload for a lifter's day (null for everyone else). */
export type TrainingDayResult = ReturnType<typeof buildTrainingDayNutrition>;

/** One day's targets as the dashboard and tracker serve them. */
export interface DayTargets {
  /** Base targets (lifter protein included) — what the older fields carry. */
  targets: DailyTargets;
  /** GAIN_MUSCLE lifters only; `adjustedTargets` set when the bump applies. */
  training: TrainingDayResult | null;
}

/**
 * The additive response fields for a day's training adjustment: none for
 * non-lifters, `trainingDay` for lifters, plus `adjustedTargets` when the
 * bump is applied (premium, training day).
 */
export function trainingDayFields(training: TrainingDayResult | null): {
  trainingDay?: TrainingDayNutrition;
  adjustedTargets?: NutritionTargets;
} {
  if (!training) return {};
  return {
    trainingDay: training.trainingDay,
    ...(training.adjustedTargets && { adjustedTargets: training.adjustedTargets }),
  };
}

export class TrainingNutritionService {
  constructor(
    private readonly gymProfileRepo: Pick<
      IGymProfileRepository,
      'findByUserId'
    > = gymProfileRepository,
    private readonly weightRepo: Pick<IWeightEntryRepository, 'findLatest'> = weightEntryRepository,
    private readonly routineRepo: Pick<IRoutineRepository, 'findActive'> = routineRepository,
    private readonly sessionRepo: Pick<
      IWorkoutSessionRepository,
      'findCompleted'
    > = workoutSessionRepository,
    private readonly pauseRepo: Pick<
      ITrainingPauseRepository,
      'listForUser'
    > = trainingPauseRepository,
    private readonly kindsService: Pick<TrainingDaysService, 'getDayKinds'> = trainingDaysService,
    /** The D-2 / Q-3 flag; injectable so unit tests never load env. */
    private readonly bumpFlag: () => Promise<boolean> = trainingBumpFlag,
  ) {}

  /**
   * Bodyweight = the latest weight log (what the gym uses, gym_plan.md D11),
   * else the nutrition profile's weight. Only users whose goal has a lifter
   * rule pay for the two reads.
   */
  async loadLifter(
    userId: string,
    chefProfile: { goal: string | null; weightKg: number | null } | null,
  ): Promise<LifterContext> {
    if (!chefProfile || lifterProteinGPerKg(chefProfile.goal) === null) {
      return { lifterBodyweightKg: null };
    }
    const [gymProfile, latestWeight] = await Promise.all([
      this.gymProfileRepo.findByUserId(userId),
      this.weightRepo.findLatest(userId),
    ]);
    const bodyweightKg = latestWeight?.weightKg ?? chefProfile.weightKg ?? null;
    const lifter = isLifter({
      goal: chefProfile.goal,
      hasGymProfile: gymProfile?.setupCompletedAt != null,
      bodyweightKg,
    });
    return { lifterBodyweightKg: lifter ? bodyweightKg : null };
  }

  /**
   * Targets for the preferences-form preview (audit follow-up): the same
   * rules as resolveDailyTargets, so a lifter sees the protein the dashboard
   * will show, not the goal's percentage split. Bodyweight follows loadLifter
   * (latest weight log, else the weight being typed). The Adaptive Chef dial
   * is left out: the preview explains the formula, the dial is the coach's.
   */
  async previewTargets(userId: string, metrics: PreviewMetrics): Promise<PreviewTargets> {
    const base = computeMacroTargets(
      metrics.weightKg,
      metrics.heightCm,
      metrics.age,
      metrics.activityLevel,
      metrics.biologicalSex,
      metrics.goal,
    );
    const { lifterBodyweightKg } = await this.loadLifter(userId, {
      goal: metrics.goal,
      weightKg: metrics.weightKg,
    });
    const proteinGPerKg = lifterProteinGPerKg(metrics.goal);
    if (!lifterBodyweightKg || proteinGPerKg === null) return { ...base, lifter: null };
    const t = withLifterProtein(base, lifterBodyweightKg, metrics.goal);
    const kcal = t.dailyCalorieTarget;
    return {
      ...t,
      proteinPct: Math.round(((t.proteinG * 4) / kcal) * 100),
      carbsPct: Math.round(((t.carbsG * 4) / kcal) * 100),
      fatPct: Math.round(((t.fatG * 9) / kcal) * 100),
      lifter: { bodyweightKg: Math.round(lifterBodyweightKg * 10) / 10, proteinGPerKg },
    };
  }

  /** Whether the Q-3 widened bump gate is on (`trainingBumpFree`, off by default). */
  isBumpWidened(): Promise<boolean> {
    return this.bumpFlag();
  }

  /** The active routine's days with their planned weekday (Monday = 0). */
  async trainingSchedule(userId: string): Promise<ScheduledDay[]> {
    const routine = await this.routineRepo.findActive(userId);
    return (routine?.days ?? []).map((d) => ({ plannedWeekday: d.plannedWeekday, name: d.name }));
  }

  /**
   * Whether `localDate` is a training day: a workout completed that day, or
   * a routine day planned for its weekday outside a training pause.
   *
   * @param weekday Monday = 0 … Sunday = 6
   */
  async trainingDayFor(
    userId: string,
    localDate: string,
    weekday: number,
  ): Promise<ResolvedTrainingDay> {
    const [scheduled, completed, pauses, kinds] = await Promise.all([
      this.trainingSchedule(userId),
      this.sessionRepo.findCompleted(userId, { fromLocalDate: localDate, toLocalDate: localDate }),
      this.pauseRepo.listForUser(userId),
      this.kindsService.getDayKinds(userId),
    ]);
    return resolveTrainingDay({
      localDate,
      weekday,
      scheduled,
      completed: completed.map((s) => ({ localDate: s.localDate, name: s.name })),
      paused: pauses.some((p) => p.startDate <= localDate && localDate <= p.endDate),
      kinds,
    });
  }

  /**
   * One day's targets (audit P2-4 follow-up): the base targets from
   * resolveDailyTargets (lifter protein included), and — for a GAIN_MUSCLE
   * lifter — the training-day payload for `localDate`, applied when
   * `premium` and previewed otherwise. The dashboard ring and the tracker
   * both read this, so they show the same numbers.
   *
   * @param weekday Monday = 0 … Sunday = 6
   */
  async targetsForDay(
    userId: string,
    profile: Parameters<typeof resolveDailyTargets>[0],
    day: { localDate: string; weekday: number },
    access: boolean,
  ): Promise<DayTargets> {
    const [{ lifterBodyweightKg }, widened] = await Promise.all([
      this.loadLifter(userId, profile),
      this.bumpFlag(),
    ]);
    const targets = resolveDailyTargets(profile, lifterBodyweightKg);
    const goal = profile?.goal;
    // Who can ever get a training-day payload: a lifter whose goal gets the
    // lift bump, or (widened, Q-3) anyone whose goal gets run bumps.
    const liftEligible = !!lifterBodyweightKg && hasTrainingDayBump(goal, 'lift', widened);
    const runEligible = widened && hasTrainingDayBump(goal, 'run', true);
    if (!liftEligible && !runEligible) return { targets, training: null };
    const resolved = await this.trainingDayFor(userId, day.localDate, day.weekday);
    const kind = resolved.kind ?? 'lift';
    const bumped =
      resolved.isTrainingDay &&
      hasTrainingDayBump(goal, kind, widened) &&
      (kind !== 'lift' || !!lifterBodyweightKg);
    const training = buildTrainingDayNutrition({
      base: targets,
      bodyweightKg: lifterBodyweightKg ?? profile?.weightKg ?? 0,
      // A day whose kind this goal does not get is a plain day for targets.
      day: bumped
        ? resolved
        : { isTrainingDay: false, reason: null, workoutName: null, kind: null },
      premium: access || widened,
    });
    return { targets, training };
  }

  /**
   * The training days of the plan week starting `weekStart` (UX-06, T-06.2):
   * one entry per weekday that is a lift day (the routine's planned weekdays,
   * or a workout completed that date) or a user-set run kind, with the bump
   * for this viewer. Every user gets the MARKERS; numbers are zero where the
   * goal gets no bump, and `applied` is false where the viewer's tier does
   * not get it (a preview for the Explain sheet, the target does not move).
   */
  async trainingWeek(
    userId: string,
    profile: Parameters<typeof resolveDailyTargets>[0],
    weekStart: Date,
    access: boolean,
    utc = false,
  ): Promise<TrainingWeek> {
    const from = planDayLocalDate(weekStart, 0, utc);
    const to = planDayLocalDate(weekStart, 6, utc);
    const [{ lifterBodyweightKg }, widened, scheduled, completed, pauses, kinds] =
      await Promise.all([
        this.loadLifter(userId, profile),
        this.bumpFlag(),
        this.trainingSchedule(userId),
        this.sessionRepo.findCompleted(userId, { fromLocalDate: from, toLocalDate: to }),
        this.pauseRepo.listForUser(userId),
        this.kindsService.getDayKinds(userId),
      ]);
    const days = Array.from({ length: 7 }, (_, dayOfWeek) => {
      const localDate = planDayLocalDate(weekStart, dayOfWeek, utc);
      return {
        dayOfWeek,
        resolved: resolveTrainingDay({
          localDate,
          weekday: dayOfWeek,
          scheduled,
          completed: completed.map((s) => ({ localDate: s.localDate, name: s.name })),
          paused: pauses.some((p) => p.startDate <= localDate && localDate <= p.endDate),
          kinds,
        }),
      };
    });
    const base = resolveDailyTargets(profile, lifterBodyweightKg);
    const trainingDays = buildPlanTrainingDays({
      days,
      base,
      bodyweightKg: lifterBodyweightKg ?? profile?.weightKg ?? null,
      goal: profile?.goal ?? null,
      widened,
      lifter: !!lifterBodyweightKg,
      access: access || widened,
    });
    if (trainingDays.length === 0) return { trainingDays, basis: null };
    return {
      trainingDays,
      basis: {
        restKcal: base.dailyCalorieTarget,
        restProteinG: base.proteinG,
        proteinGPerKg: lifterBodyweightKg
          ? (lifterProteinGPerKg(profile?.goal) ?? LIFTER_PROTEIN_G_PER_KG)
          : null,
        bodyweightKg: lifterBodyweightKg ? Math.round(lifterBodyweightKg * 10) / 10 : null,
      },
    };
  }

  /** Whether the user has any training schedule at all (a routine, or a set run kind). */
  async hasTrainingSchedule(userId: string): Promise<boolean> {
    const [scheduled, kinds] = await Promise.all([
      this.trainingSchedule(userId),
      this.kindsService.getDayKinds(userId),
    ]);
    return scheduled.some((d) => d.plannedWeekday !== null) || Object.keys(kinds).length > 0;
  }

  /**
   * The curated refuel snacks this table can eat (T-06.3): the same
   * `isRecipeSafe` filter every recipe goes through, applied to the snack's
   * ingredients and diet tags with the owner + household union (dislikes
   * included) — no yogurt for a dairy allergy, no eggs for egg-free. Two are
   * returned; fewer when the rules leave fewer, never an unsafe one.
   */
  refuelSnacks(prefs: Parameters<typeof isRecipeSafe>[1], count = 2): RefuelSnackDto[] {
    const safe = PROTEIN_SNACKS.filter((snack) =>
      isRecipeSafe(
        {
          name: snack.name,
          ingredients: snack.ingredients.map((name) => ({ name, quantity: 1, unit: 'serving' })),
          instructions: [],
          dietaryTags: [...snack.dietaryTags],
        },
        prefs,
      ),
    );
    return takeSnacks(safe, count).map(
      ({ id, name, proteinG, kcal, carbsG, fatG }): RefuelSnackDto => ({
        id,
        name,
        proteinG,
        kcal,
        carbsG,
        fatG,
      }),
    );
  }
}

export const trainingNutritionService = new TrainingNutritionService();
