import {
  chefProfileRepository,
  gymProfileRepository,
  routineRepository,
  type GymProfile,
  type IChefProfileRepository,
  type IGymProfileRepository,
  type IRoutineRepository,
} from '@chefer/database';
import type {
  EquipmentProfile,
  ExerciseMeta,
  ExerciseSlot,
  PauseRange,
  RoutineDto,
  StreakInfo,
  TrainingExperience,
  TrainingProfileFacts,
  WeekSummary,
} from '@chefer/types';
import { repBucket, summarizeWeeks, weekStartOf } from '@chefer/utils';
import {
  readGoalHistory,
  readOfferState,
  toEquipmentProfile,
  toRoutineDto,
  type GymOfferState,
} from './mappers.js';

// ─── Per-request gym context ──────────────────────────────────────────────────
// What almost every gym service needs before calling the engine: the equipment
// inventory, experience, age facts, offer bookkeeping and the active routine.

export interface GymUserContext {
  profileRow: GymProfile | null;
  equipment: EquipmentProfile;
  experience: TrainingExperience;
  facts: TrainingProfileFacts;
  offerState: GymOfferState;
  activeRoutine: RoutineDto | null;
}

export class GymContextLoader {
  constructor(
    private readonly profileRepo: IGymProfileRepository = gymProfileRepository,
    private readonly routineRepo: IRoutineRepository = routineRepository,
    private readonly chefProfileRepo: Pick<
      IChefProfileRepository,
      'findByUserId'
    > = chefProfileRepository,
  ) {}

  async load(userId: string): Promise<GymUserContext> {
    const [profileRow, routineRow, chefProfile] = await Promise.all([
      this.profileRepo.findByUserId(userId),
      this.routineRepo.findActive(userId),
      this.chefProfileRepo.findByUserId(userId),
    ]);
    const experience = profileRow?.experience ?? 'BEGINNER';
    return {
      profileRow,
      equipment: toEquipmentProfile(profileRow),
      experience,
      // Age comes from the nutrition profile (ChefProfile.age) when the user
      // filled it in; it drives the ≥ 65 break re-entry column (research §1.8).
      facts: { experience, ageYears: chefProfile?.age ?? null },
      offerState: readOfferState(profileRow?.offerState),
      activeRoutine: routineRow ? toRoutineDto(routineRow) : null,
    };
  }
}

export const gymContextLoader = new GymContextLoader();

/** A user-started deload (progression.startDeload) covers `today`. */
export function isDeloadActive(offerState: GymOfferState, today: string): boolean {
  const d = offerState.deload;
  return !!d && d.startDate <= today && today <= d.endDate;
}

export const EMPTY_STREAK: StreakInfo = {
  current: 0,
  best: 0,
  flexTokens: 0,
  thisWeekSessions: 0,
  thisWeekGoal: 0,
};

/**
 * Week summaries + streak via the engine. The first judged week is the
 * earlier of the setup week and the first logged session's week. No profile
 * (setup not done) → no weekly goal to judge against → empty.
 */
export function summarizeUserWeeks(input: {
  profileRow: GymProfile | null;
  sessionDates: string[];
  pauses: PauseRange[];
  today: string;
}): { weeks: WeekSummary[]; streak: StreakInfo } {
  const { profileRow, sessionDates, pauses, today } = input;
  if (!profileRow) return { weeks: [], streak: EMPTY_STREAK };
  const setupDate = (profileRow.setupCompletedAt ?? profileRow.createdAt)
    .toISOString()
    .slice(0, 10);
  const first = [setupDate, ...sessionDates].reduce((a, b) => (b < a ? b : a));
  const goalHistory = readGoalHistory(profileRow.goalHistory);
  return summarizeWeeks({
    sessionDates,
    goalHistory:
      goalHistory.length > 0
        ? goalHistory
        : [{ fromWeek: weekStartOf(first), goal: profileRow.weeklyGoal }],
    pauses,
    today,
    firstWeek: weekStartOf(first),
  });
}

/** Snapshot of the slot parameters an exposure was performed with. */
export interface SlotSnapshot {
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}

/**
 * The ExerciseSlot the engine folds/prescribes a (exercise, rep bucket) with:
 * the active routine's slot in that bucket, else the latest performed
 * snapshot, else the bucket's range with default sets/RIR.
 */
export function resolveSlot(
  meta: ExerciseMeta,
  bucket: string,
  routine: RoutineDto | null,
  latest?: SlotSnapshot | null,
): ExerciseSlot {
  const routineSlot = routine?.days
    .flatMap((d) => d.exercises)
    .find((e) => e.exerciseId === meta.id && repBucket(e.repMin, e.repMax) === bucket);
  if (routineSlot) {
    return {
      exercise: meta,
      sets: routineSlot.sets,
      repMin: routineSlot.repMin,
      repMax: routineSlot.repMax,
      targetRir: routineSlot.targetRir,
      restSec: routineSlot.restSec,
    };
  }
  if (latest) {
    return {
      exercise: meta,
      sets: latest.sets,
      repMin: latest.repMin,
      repMax: latest.repMax,
      targetRir: latest.targetRir,
      restSec: meta.restSec,
    };
  }
  const [min, max] = bucket.split('-').map(Number);
  const repMin = Number.isFinite(min) && min ? min : meta.repMin;
  const repMax = Number.isFinite(max) && max ? max : meta.repMax;
  return { exercise: meta, sets: 3, repMin, repMax, targetRir: 2, restSec: meta.restSec };
}
