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
import type { NutritionTargets, TrainingDayNutrition } from '@chefer/types';
import {
  buildTrainingDayNutrition,
  hasTrainingDayBump,
  isLifter,
  lifterProteinGPerKg,
  resolveTrainingDay,
  type ResolvedTrainingDay,
} from '@chefer/utils';
import { resolveDailyTargets, type DailyTargets } from '../preferences/preferences.service.js';

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

export interface LifterContext {
  /**
   * Bodyweight (kg) when the lifter rules apply — set-up gym profile, a goal
   * with a g/kg rule (lifterProteinGPerKg), bodyweight known — else null.
   * Pass it to resolveDailyTargets as `lifterBodyweightKg`.
   */
  lifterBodyweightKg: number | null;
}

type ScheduledDay = { plannedWeekday: number | null; name: string };

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
    const [scheduled, completed, pauses] = await Promise.all([
      this.trainingSchedule(userId),
      this.sessionRepo.findCompleted(userId, { fromLocalDate: localDate, toLocalDate: localDate }),
      this.pauseRepo.listForUser(userId),
    ]);
    return resolveTrainingDay({
      localDate,
      weekday,
      scheduled,
      completed: completed.map((s) => ({ localDate: s.localDate, name: s.name })),
      paused: pauses.some((p) => p.startDate <= localDate && localDate <= p.endDate),
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
    premium: boolean,
  ): Promise<DayTargets> {
    const { lifterBodyweightKg } = await this.loadLifter(userId, profile);
    const targets = resolveDailyTargets(profile, lifterBodyweightKg);
    if (!lifterBodyweightKg || !hasTrainingDayBump(profile?.goal)) {
      return { targets, training: null };
    }
    const training = buildTrainingDayNutrition({
      base: targets,
      bodyweightKg: lifterBodyweightKg,
      day: await this.trainingDayFor(userId, day.localDate, day.weekday),
      premium,
    });
    return { targets, training };
  }
}

export const trainingNutritionService = new TrainingNutritionService();
