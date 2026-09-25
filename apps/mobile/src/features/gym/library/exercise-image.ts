import type { ExerciseDto } from '@chefer/types';
import { getApiBaseUrl } from '../../../lib/api-url';

/**
 * ExerciseDto.images are API-relative paths (`/static/exercises/<key>`);
 * prefix the API origin for the current platform. Null when no photo.
 */
export function exerciseImageUrl(exercise: Pick<ExerciseDto, 'images'>, index = 0): string | null {
  const path = exercise.images[index];
  if (!path) return null;
  return path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;
}
