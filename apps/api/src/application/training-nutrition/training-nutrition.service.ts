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
import { isLifter, resolveTrainingDay, type ResolvedTrainingDay } from '@chefer/utils';

// ─── Training-aware nutrition (audit P2-4) ────────────────────────────────────
// Loads the gym facts the food side needs. The rules themselves are pure and
// live in @chefer/utils (training-nutrition.ts); this service only reads.
//
//   loadLifter      → is this user a lifter, and their bodyweight (every
//                     target consumer: dashboard, tracker, generation, chat)
//   trainingDayFor  → is `localDate` a training day (dashboard)
//   trainingSchedule→ the active routine's planned weekdays (generation)

export interface LifterContext {
  /**
   * Bodyweight (kg) when the lifter rules apply — set-up gym profile, goal
   * GAIN_MUSCLE, bodyweight known — else null. Pass it to
   * resolveDailyTargets as `lifterBodyweightKg`.
   */
  lifterBodyweightKg: number | null;
}

type ScheduledDay = { plannedWeekday: number | null; name: string };

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
   * else the nutrition profile's weight. Only GAIN_MUSCLE users pay for the
   * two reads.
   */
  async loadLifter(
    userId: string,
    chefProfile: { goal: string | null; weightKg: number | null } | null,
  ): Promise<LifterContext> {
    if (chefProfile?.goal !== 'GAIN_MUSCLE') return { lifterBodyweightKg: null };
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
}

export const trainingNutritionService = new TrainingNutritionService();
