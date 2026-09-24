// Weekly volume & routine validation — research §2.2/§2.3 (fractional sets:
// primary = 1, secondary = 0.5; rules V1–V11, gentle, never blocking).
import type {
  ExerciseMeta,
  MuscleVolume,
  MuscleVolumeWeekDto,
  RoutineHint,
  RoutineLike,
  SessionSummaryDto,
  TrainingExperience,
} from '@chefer/types';
import { notImplemented } from './_stub';

export type ExerciseLookup = (id: string) => ExerciseMeta | undefined;

export function volumeByGroup(
  routine: RoutineLike,
  lookup: ExerciseLookup,
  experience: TrainingExperience,
): MuscleVolume[] {
  return notImplemented(`volumeByGroup(${routine.days.length}, ${typeof lookup}, ${experience})`);
}

export function validateRoutine(
  routine: RoutineLike,
  lookup: ExerciseLookup,
  experience: TrainingExperience,
  opts: { suppressLowVolume?: boolean } = {},
): RoutineHint[] {
  return notImplemented(
    `validateRoutine(${routine.days.length}, ${typeof lookup}, ${experience}, ${JSON.stringify(opts)})`,
  );
}

/** Completed working sets per volume group per week (stats chart). */
export function completedSetsByWeek(
  sessions: SessionSummaryDto[],
  lookup: ExerciseLookup,
): MuscleVolumeWeekDto[] {
  return notImplemented(`completedSetsByWeek(${sessions.length}, ${typeof lookup})`);
}
