import type { ExerciseDto } from '@chefer/types';
import { coverImagePath, type ExerciseImagesOf } from '@chefer/utils';
import { getApiBaseUrl } from '../../../lib/api-url';

/** An exercise image path (API-relative or absolute) → a loadable URL. */
export function resolveExerciseImagePath(path: string): string {
  return path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;
}

/**
 * ExerciseDto.images are API-relative paths (`/static/exercises/<key>`);
 * prefix the API origin for the current platform. Null when no photo.
 */
export function exerciseImageUrl(exercise: Pick<ExerciseDto, 'images'>, index = 0): string | null {
  const path = exercise.images[index];
  if (!path) return null;
  return resolveExerciseImagePath(path);
}

/** `ExerciseImagesOf` over a cached library (build once per library, e.g. in a `useMemo`). */
export function libraryImages(
  library: readonly Pick<ExerciseDto, 'id' | 'images'>[] | undefined,
): ExerciseImagesOf {
  const byId = new Map((library ?? []).map((e) => [e.id, e.images]));
  return (id) => byId.get(id);
}

/**
 * The cover photo URL for a routine day or a past workout: the first of
 * `exerciseIds` that has a photo (`coverImagePath`), or null — the caller
 * keeps its illustration then.
 */
export function exerciseCoverUrl(
  exerciseIds: readonly string[],
  imagesOf: ExerciseImagesOf,
): string | null {
  const path = coverImagePath(exerciseIds, imagesOf);
  return path ? resolveExerciseImagePath(path) : null;
}
