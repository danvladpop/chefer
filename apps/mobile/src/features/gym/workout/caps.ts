import { GYM_MAX_EXERCISES_PER_SESSION, GYM_MAX_SETS_PER_EXERCISE } from '@chefer/types';

// UX-GYM-01: the session schema allows at most 20 sets per exercise and 30
// exercises per workout. A workout past either limit fails validation and parks
// in the outbox for good, so "Add set" / "Add exercise" stop at the limit and
// say why (the shared constants keep this in step with the schema).

export const SET_CAP_REASON = `Max ${String(GYM_MAX_SETS_PER_EXERCISE)} sets per exercise.`;
export const EXERCISE_CAP_REASON = `Max ${String(GYM_MAX_EXERCISES_PER_SESSION)} exercises per workout.`;

export const isAtSetCap = (setCount: number): boolean => setCount >= GYM_MAX_SETS_PER_EXERCISE;
export const isAtExerciseCap = (exerciseCount: number): boolean =>
  exerciseCount >= GYM_MAX_EXERCISES_PER_SESSION;
