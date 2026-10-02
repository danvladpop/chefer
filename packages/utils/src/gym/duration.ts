// Session-length estimate shared by volume validation (V6) and templates.
import type { ExerciseMeta, RoutineLike } from '@chefer/types';
import { supersetRuns } from './supersets';

// Structurally identical to volume.ts's ExerciseLookup (kept local to avoid an import cycle).
type ExerciseLookup = (id: string) => ExerciseMeta | undefined;

/** Seconds of work per set (research §2.3 V6). */
export const SECONDS_PER_SET = 40;
/** General warm-up before the first exercise, minutes. */
const GENERAL_WARMUP_MIN = 5;
/** Extra minutes for ramp-up sets per compound exercise. */
const COMPOUND_RAMP_MIN = 1.5;

/**
 * The same estimate over plain `{ sets, restSec, isCompound }` rows — shared
 * with `shortVersion` (T-36.6) so the "Short version · ~{min} min" preview and
 * the full-length `~{min} min` can never use different maths.
 */
export function estimateMinutes(
  rows: readonly {
    sets: number;
    restSec: number;
    isCompound: boolean;
    supersetGroup?: string | null;
  }[],
): number {
  if (rows.length === 0) {
    return 0;
  }
  // A superset round is every member's set back to back, then ONE rest (the
  // last member's, as the workout's rest timer does).
  const restCounts = rows.map((row) => row.sets);
  for (const run of supersetRuns(
    rows.map((row) => ({ supersetGroup: row.supersetGroup ?? null })),
  )) {
    const members = rows.slice(run.start, run.end + 1);
    const rounds = Math.max(...members.map((m) => m.sets));
    for (let i = run.start; i <= run.end; i++) restCounts[i] = i === run.end ? rounds : 0;
  }
  let seconds = 0;
  let compounds = 0;
  rows.forEach((row, i) => {
    seconds += row.sets * SECONDS_PER_SET + (restCounts[i] ?? 0) * row.restSec;
    if (row.isCompound) {
      compounds += 1;
    }
  });
  return Math.round(seconds / 60 + GENERAL_WARMUP_MIN + compounds * COMPOUND_RAMP_MIN);
}

/** Σ sets × 40 s + rests (one per superset round) + warm-up allowance, whole minutes. */
export function durationMinutes(day: RoutineLike['days'][number], lookup: ExerciseLookup): number {
  return estimateMinutes(
    day.exercises.map((ex) => ({
      sets: ex.sets,
      restSec: ex.restSec,
      isCompound: lookup(ex.exerciseId)?.category === 'COMPOUND',
      supersetGroup: ex.supersetGroup ?? null,
    })),
  );
}
