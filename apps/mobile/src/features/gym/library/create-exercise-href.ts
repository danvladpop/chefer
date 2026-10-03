import { router } from 'expo-router';

/** UX-GYM-21: the custom-exercise form route, pre-filled with a searched name. */
export function createExerciseHref(name: string): string {
  const trimmed = name.trim().slice(0, 60);
  return trimmed ? `/gym/exercise-form?name=${encodeURIComponent(trimmed)}` : '/gym/exercise-form';
}

/** Opens the custom-exercise form for `name` (a picker's "Create '<query>'"). */
export function openCreateExercise(name: string): void {
  router.push(createExerciseHref(name));
}
