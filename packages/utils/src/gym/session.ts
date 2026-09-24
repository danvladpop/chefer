// Session-level assembly shared by the API (bootstrap) and clients (offline
// optimistic update after Finish): next-workout building, rotation, and
// session → exposure mapping.
import type {
  EquipmentProfile,
  Exposure,
  GymBootstrap,
  NextWorkoutDto,
  ProgressionOverride,
  ProgressionState,
  RoutineDto,
  SessionSummaryDto,
  TrainingProfileFacts,
  WorkoutSessionDoc,
} from '@chefer/types';
import { notImplemented } from './_stub';
import type { ExerciseLookup } from './volume';

export interface ProgressionEntry {
  state: ProgressionState;
  override: ProgressionOverride | null;
}

/** Next day in the rotation after `completedDayId` (wraps; unknown id → first day). */
export function nextDayIdAfter(routine: RoutineDto, completedDayId: string | null): string | null {
  return notImplemented(`nextDayIdAfter(${routine.id}, ${completedDayId})`);
}

/** Prescriptions + warm-ups + last-time columns for one routine day. */
export function buildNextWorkout(input: {
  routine: RoutineDto;
  dayId: string;
  lookup: ExerciseLookup;
  /** Keyed by progressionKey(exerciseId, repBucket). */
  progressions: ReadonlyMap<string, ProgressionEntry>;
  profile: EquipmentProfile;
  facts: TrainingProfileFacts;
  today: string;
  recentSessions: SessionSummaryDto[];
  isDeload: boolean;
}): NextWorkoutDto {
  return notImplemented(`buildNextWorkout(${input.routine.id}, ${input.dayId})`);
}

/** One Exposure per non-skipped exercise of a COMPLETED session. */
export function exposuresFromSession(
  doc: WorkoutSessionDoc,
): { exerciseId: string; exposure: Exposure }[] {
  return notImplemented(`exposuresFromSession(${doc.id})`);
}

export function toSessionSummary(doc: WorkoutSessionDoc): SessionSummaryDto {
  return notImplemented(`toSessionSummary(${doc.id})`);
}

/**
 * Offline optimistic update: fold a just-finished session into a cached
 * bootstrap (progressions, rotation pointer, next workout, recent sessions,
 * weeks/streak). The server's later bootstrap must be identical.
 */
export function applyFinishedSession(input: {
  bootstrap: GymBootstrap;
  doc: WorkoutSessionDoc;
  lookup: ExerciseLookup;
  facts: TrainingProfileFacts;
  today: string;
}): GymBootstrap {
  return notImplemented(`applyFinishedSession(${input.doc.id})`);
}
