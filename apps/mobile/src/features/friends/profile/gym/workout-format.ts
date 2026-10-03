import { EXERCISE_BY_ID, type ExerciseTrackingType, type FriendWorkoutDto } from '@chefer/types';
import {
  distanceUnitFor,
  formatDistance,
  formatDurationMinutes,
  formatLoad,
  isStrengthTrackingType,
} from '@chefer/utils';
import type { ViewerUnits } from '../use-viewer-units';

// ─── Another person's workout in the VIEWER's units (UX §10, FR-19.1) ─────────
// Pure formatting for FriendWorkoutCard: the top set per exercise for the
// collapsed card, and every completed working set for `Show sets`. Strength
// sets read `80 kg × 8` / `176.4 lb × 8` / `BW × 12` / `BW + 10 kg × 6`;
// cardio reads `{duration} · {distance}`.

type Exercise = FriendWorkoutDto['exercises'][number];
type WorkoutSet = Exercise['sets'][number];

const KG_EPS = 1e-6;

export function isStrength(exercise: Pick<Exercise, 'trackingType'>): boolean {
  return isStrengthTrackingType(exercise.trackingType as ExerciseTrackingType);
}

/**
 * UX-GYM-19: a dumbbell / kettlebell set reads "20 kg each". The friend DTO's
 * `perHand` (catalog or custom exercise) is authoritative; it is omitted when
 * false, so an API that predates the field (or a cached response) falls back
 * to the catalog for a library exercise. A custom exercise from an older API
 * stays a bare weight.
 */
function isPerHand(exercise: Pick<Exercise, 'exerciseId' | 'isCustom' | 'perHand'>): boolean {
  if (exercise.perHand === true) return true;
  return !exercise.isCustom && EXERCISE_BY_ID.get(exercise.exerciseId)?.perHand === true;
}

function strengthLine(exercise: Exercise, set: WorkoutSet, units: ViewerUnits): string {
  const load =
    exercise.trackingType === 'BODYWEIGHT_REPS'
      ? formatLoad(
          set.weightKg,
          units.weight,
          set.weightKg > KG_EPS ? 'BODYWEIGHT_PLUS' : 'BODYWEIGHT',
        )
      : formatLoad(set.weightKg, units.weight, 'WEIGHTED', { each: isPerHand(exercise) });
  return `${load} × ${set.reps}`;
}

function cardioLine(
  exercise: Exercise,
  durationSec: number | undefined,
  distanceM: number | undefined,
  units: ViewerUnits,
): string {
  const parts: string[] = [];
  if (durationSec !== undefined && durationSec > 0) parts.push(formatDurationMinutes(durationSec));
  if (distanceM !== undefined && distanceM > 0) {
    parts.push(formatDistance(distanceM, distanceUnitFor(exercise.exerciseId, units.distance)));
  }
  return parts.join(' · ');
}

/** The collapsed card's line for one exercise: its top set, or the cardio total. */
export function topSetLine(exercise: Exercise, units: ViewerUnits): string {
  if (exercise.sets.length === 0) return '';
  if (!isStrength(exercise)) {
    const sum = (pick: (s: WorkoutSet) => number | undefined): number | undefined => {
      const values = exercise.sets.map(pick).filter((v): v is number => v !== undefined);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
    };
    return cardioLine(
      exercise,
      sum((s) => s.durationSec),
      sum((s) => s.distanceM),
      units,
    );
  }
  const top = exercise.sets.reduce((best, s) =>
    s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps) ? s : best,
  );
  return strengthLine(exercise, top, units);
}

/** Every completed working set, one line each (`Show sets`). */
export function setLines(exercise: Exercise, units: ViewerUnits): string[] {
  return exercise.sets.map((s) =>
    isStrength(exercise)
      ? strengthLine(exercise, s, units)
      : cardioLine(exercise, s.durationSec, s.distanceM, units),
  );
}
