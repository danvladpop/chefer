import { EXERCISE_NAME_MAX } from './exercise-form-errors';

/**
 * UX-GYM-21: the custom-exercise form route, pre-filled with a searched name
 * (the web twin of the phone's `createExerciseHref`). Never put anything but
 * the exercise name in the URL.
 */
export function createExerciseHref(name: string): string {
  const trimmed = name.trim().slice(0, EXERCISE_NAME_MAX);
  return trimmed ? `/gym/exercises/new?name=${encodeURIComponent(trimmed)}` : '/gym/exercises/new';
}

/** A search worth offering "Create “…”" for: at least two characters once trimmed. */
export function canOfferCreate(query: string): boolean {
  return query.trim().length >= 2;
}
