// Test data for the template screens' unit tests (not shipped: only *.test.* files import it).
import {
  EXERCISE_BY_ID,
  type WorkoutTemplateDto,
  type WorkoutTemplateExerciseDto,
} from '@chefer/types';

export function templateRow(
  exerciseId: string,
  over: Partial<WorkoutTemplateExerciseDto> = {},
): WorkoutTemplateExerciseDto {
  return {
    id: `row-${exerciseId}`,
    exerciseId,
    position: 0,
    sets: 3,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    defaultLoadKg: null,
    trainerNote: null,
    ...over,
  };
}

/** "Lower body A": a back squat with a starting weight, a plank and push-ups. */
export function templateDto(over: Partial<WorkoutTemplateDto> = {}): WorkoutTemplateDto {
  const exercises = over.exercises ?? [
    templateRow('back-squat', { id: 'te1', position: 0, defaultLoadKg: 60 }),
    templateRow('plank', { id: 'te2', position: 1, repMin: 30, repMax: 45 }),
    templateRow('push-up', { id: 'te3', position: 2 }),
  ];
  return {
    id: 'tpl1',
    name: 'Lower body A',
    workoutType: 'LOWER_BODY',
    version: 3,
    updatedAt: '2026-10-10T10:00:00.000Z',
    exercises,
    exerciseMeta: exercises.flatMap((e) => {
      const meta = EXERCISE_BY_ID.get(e.exerciseId);
      return meta ? [meta] : [];
    }),
    assignments: [],
    ...over,
  };
}
