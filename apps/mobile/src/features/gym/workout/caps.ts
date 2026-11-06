import { GYM_MAX_EXERCISES_PER_SESSION, GYM_MAX_SETS_PER_EXERCISE } from '@chefer/types';
import { getTranslator } from '../../../lib/i18n';

// UX-GYM-01: the session schema allows at most 20 sets per exercise and 30
// exercises per workout. A workout past either limit fails validation and parks
// in the outbox for good, so "Add set" / "Add exercise" stop at the limit and
// say why (the shared constants keep this in step with the schema).

/** The reason text, in the UI language at call time. */
export const setCapReason = (): string =>
  getTranslator().t('gym.workout.view.maxSets', { max: String(GYM_MAX_SETS_PER_EXERCISE) });
export const exerciseCapReason = (): string =>
  getTranslator().t('gym.workout.view.capReason', { max: String(GYM_MAX_EXERCISES_PER_SESSION) });

/**
 * English constant for the simple-mode screens, which still import it (they
 * move to `exerciseCapReason()` in their own i18n pass).
 */
export const EXERCISE_CAP_REASON = `Max ${String(GYM_MAX_EXERCISES_PER_SESSION)} exercises per workout.`;

export const isAtSetCap = (setCount: number): boolean => setCount >= GYM_MAX_SETS_PER_EXERCISE;
export const isAtExerciseCap = (exerciseCount: number): boolean =>
  exerciseCount >= GYM_MAX_EXERCISES_PER_SESSION;
