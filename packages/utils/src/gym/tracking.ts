// ─── Tracking-type helpers (S18, T-42.0) ──────────────────────────────────────
// Pure, storage-agnostic helpers shared by the API, mobile and web so the
// "how is this exercise logged" rule lives in exactly one place. See
// docs/persona-study-2026-09/synthesis/04-technical-plan.md Δ2.2 and
// 06-cardio-research.md §5.1.

import { ExerciseLoadType, ExerciseTrackingType } from '@chefer/types';

/** The subset of an exercise row `trackingTypeOf` needs. */
export interface TrackingTypeSource {
  /** Explicit value when the row (or a fresher cache entry) has one. */
  trackingType?: ExerciseTrackingType;
  isTimed: boolean;
  loadType: ExerciseLoadType;
}

/**
 * Resolves an exercise's tracking type, deriving it from the legacy
 * `isTimed`/`loadType` fields when `trackingType` is absent — an old cached
 * library row (mobile's offline store, persisted before W2) or a catalogue
 * entry that predates this field. Mirrors the boot backfill's rule (Δ2.2) so
 * a client never needs the backfill to have run yet to render correctly:
 *
 * - `isTimed: true` → `DURATION`
 * - `loadType: BODYWEIGHT` → `BODYWEIGHT_REPS`
 * - otherwise → `WEIGHT_REPS`
 */
export function trackingTypeOf(exercise: TrackingTypeSource): ExerciseTrackingType {
  if (exercise.trackingType) return exercise.trackingType;
  if (exercise.isTimed) return ExerciseTrackingType.DURATION;
  if (exercise.loadType === ExerciseLoadType.BODYWEIGHT)
    return ExerciseTrackingType.BODYWEIGHT_REPS;
  return ExerciseTrackingType.WEIGHT_REPS;
}

/**
 * The legacy `isTimed` flag a row of this tracking type should carry, so a
 * level-0/1 client (which only ever reads `isTimed`, never `trackingType`)
 * keeps showing a seconds label for anything time-based (Δ2.2). `DISTANCE`
 * is deliberately `false` — its time field is optional (an outdoor walk
 * logged from memory), so it doesn't read as "timed" to an old client.
 */
export function isTimedFor(trackingType: ExerciseTrackingType): boolean {
  return (
    trackingType === ExerciseTrackingType.DURATION ||
    trackingType === ExerciseTrackingType.DURATION_DISTANCE ||
    trackingType === ExerciseTrackingType.INTERVALS
  );
}

/** All tracking types that log with `weightKg`/`reps` (today's only shape). */
export const STRENGTH_TRACKING_TYPES = [
  ExerciseTrackingType.WEIGHT_REPS,
  ExerciseTrackingType.BODYWEIGHT_REPS,
] as const;

/** True for the two strength shapes; false for anything cardio (incl. DURATION holds like a plank). */
export function isStrengthTrackingType(trackingType: ExerciseTrackingType): boolean {
  return (STRENGTH_TRACKING_TYPES as readonly ExerciseTrackingType[]).includes(trackingType);
}
