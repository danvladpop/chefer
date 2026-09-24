// Session-length estimate shared by volume validation (V6) and templates.
import type { ExerciseMeta, RoutineLike } from '@chefer/types';

// Structurally identical to volume.ts's ExerciseLookup (kept local to avoid an import cycle).
type ExerciseLookup = (id: string) => ExerciseMeta | undefined;

/** Seconds of work per set (research §2.3 V6). */
export const SECONDS_PER_SET = 40;
/** General warm-up before the first exercise, minutes. */
const GENERAL_WARMUP_MIN = 5;
/** Extra minutes for ramp-up sets per compound exercise. */
const COMPOUND_RAMP_MIN = 1.5;

/** Σ sets × (40 s + rest) + warm-up allowance, whole minutes. */
export function durationMinutes(day: RoutineLike['days'][number], lookup: ExerciseLookup): number {
  let seconds = 0;
  let compounds = 0;
  for (const ex of day.exercises) {
    seconds += ex.sets * (SECONDS_PER_SET + ex.restSec);
    if (lookup(ex.exerciseId)?.category === 'COMPOUND') {
      compounds += 1;
    }
  }
  if (day.exercises.length === 0) {
    return 0;
  }
  return Math.round(seconds / 60 + GENERAL_WARMUP_MIN + compounds * COMPOUND_RAMP_MIN);
}
