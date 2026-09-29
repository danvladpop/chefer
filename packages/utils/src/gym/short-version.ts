// ─── Short version (T-36.6, UX-36 (6) "How long have you got?") ────────────────
// `shortVersion(exercises, minutes)` trims a day to fit the time the user has:
//   1. everything fits → nothing is cut (the full-length path is unchanged);
//   2. otherwise keep every COMPOUND plus the FIRST accessory per muscle, and
//      drop the remaining accessories;
//   3. still over budget (AC7: a 30-minute choice previews ≤ 32 min) → drop
//      the last accessories, then the last compounds, until it fits — always
//      leaving at least one exercise.
// The dropped exercises are not lost: callers hand their ids to the session
// doc's `carryOverExerciseIds` (T-36.3), so they lead the NEXT session marked
// `From last time`. Pure and shared, so every client agrees on what a short
// version is.

import type { ExerciseMeta, NextWorkoutDto, NextWorkoutExerciseDto } from '@chefer/types';
import { estimateMinutes } from './duration';

/** A routine day's exercise, as `shortVersion` sees it. */
export interface ShortVersionExercise {
  exerciseId: string;
  muscle: string;
  /** Compounds are kept first; only the first accessory per muscle survives step 2. */
  isCompound: boolean;
  sets: number;
  restSec: number;
}

export interface ShortVersionResult {
  /** Kept exercises, in their original order. */
  kept: ShortVersionExercise[];
  /** Dropped exercises, in their original order — they become carry-over. */
  dropped: ShortVersionExercise[];
  /** Indices (into the input) of `kept`, ascending. */
  keptIndices: number[];
  /** Estimated minutes of `kept` — the "~{min} min" of the preview line. */
  minutes: number;
  /** `kept.length` — the "{n} exercises" of the preview line. */
  exerciseCount: number;
}

/** A 30-minute choice may preview up to 32 min (UX-36 AC7). */
export const SHORT_VERSION_TOLERANCE_MIN = 2;

/** The `Time today:` chips at Start, besides `Full` (= no cut). */
export const TIME_TODAY_OPTIONS = [20, 30, 45] as const;

/** The setup question `How long can a session usually be?` (75 = `75+ min`). */
export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75] as const;

export function shortVersion(
  exercises: readonly ShortVersionExercise[],
  minutes: number,
): ShortVersionResult {
  const budget = minutes + SHORT_VERSION_TOLERANCE_MIN;
  const keep = new Set<number>(exercises.map((_, i) => i));
  const rowsOf = () => exercises.filter((_, i) => keep.has(i));

  if (estimateMinutes(exercises) > budget) {
    // Step 2: compounds + the first accessory per muscle.
    const musclesWithAccessory = new Set<string>();
    keep.clear();
    exercises.forEach((ex, i) => {
      if (ex.isCompound) {
        keep.add(i);
      } else if (!musclesWithAccessory.has(ex.muscle)) {
        musclesWithAccessory.add(ex.muscle);
        keep.add(i);
      }
    });

    // Step 3: still over budget — trim from the back, accessories first.
    const lastKept = (isCompound: boolean): number => {
      for (let i = exercises.length - 1; i >= 0; i -= 1) {
        if (keep.has(i) && exercises[i]?.isCompound === isCompound) return i;
      }
      return -1;
    };
    while (estimateMinutes(rowsOf()) > budget && keep.size > 1) {
      const accessory = lastKept(false);
      const victim = accessory >= 0 ? accessory : lastKept(true);
      if (victim < 0) break;
      keep.delete(victim);
    }
  }

  const kept = rowsOf();
  return {
    kept,
    dropped: exercises.filter((_, i) => !keep.has(i)),
    keptIndices: [...keep].sort((a, b) => a - b),
    minutes: estimateMinutes(kept),
    exerciseCount: kept.length,
  };
}

export interface ShortVersionWorkout {
  /** The day to start: `workout` itself when nothing needed cutting. */
  workout: NextWorkoutDto;
  /**
   * Exercise ids to seed the session doc's `carryOverExerciseIds` with. Excludes
   * exercises that are ALREADY carried over (`fromLastTime`) — they stay on the
   * profile's list untouched, and re-carrying them under this day would lose
   * their original source day.
   */
  carryOverExerciseIds: string[];
  /** True when at least one exercise was dropped. */
  isShort: boolean;
  /** Preview inputs: `Short version · ~{minutes} min · {exerciseCount} exercises`. */
  minutes: number;
  exerciseCount: number;
}

function toRow(
  ex: NextWorkoutExerciseDto,
  lookup: (id: string) => ExerciseMeta | undefined,
): ShortVersionExercise {
  const meta = lookup(ex.exerciseId);
  return {
    exerciseId: ex.exerciseId,
    muscle: meta?.primaryMuscles[0] ?? ex.exerciseId,
    isCompound: meta?.category === 'COMPOUND',
    sets: ex.sets,
    restSec: ex.restSec,
  };
}

/**
 * `shortVersion` over a built `NextWorkoutDto`. `minutes = null` (the `Full`
 * chip, or no choice made) returns the workout untouched, as does a budget the
 * full day already fits.
 */
export function shortVersionOfWorkout(
  workout: NextWorkoutDto,
  lookup: (id: string) => ExerciseMeta | undefined,
  minutes: number | null,
): ShortVersionWorkout {
  const untouched: ShortVersionWorkout = {
    workout,
    carryOverExerciseIds: [],
    isShort: false,
    minutes: workout.estimatedMin,
    exerciseCount: workout.exercises.length,
  };
  if (minutes === null) return untouched;

  const ordered = [...workout.exercises].sort((a, b) => a.position - b.position);
  const result = shortVersion(
    ordered.map((ex) => toRow(ex, lookup)),
    minutes,
  );
  if (result.dropped.length === 0) return untouched;

  const keptSet = new Set(result.keptIndices);
  const keptExercises = ordered.filter((_, i) => keptSet.has(i));
  const droppedExercises = ordered.filter((_, i) => !keptSet.has(i));

  // A superset whose partner was dropped is just a straight exercise now.
  const groupSize = new Map<string, number>();
  for (const ex of keptExercises) {
    if (ex.supersetGroup) {
      groupSize.set(ex.supersetGroup, (groupSize.get(ex.supersetGroup) ?? 0) + 1);
    }
  }
  const exercises = keptExercises.map((ex, position) => ({
    ...ex,
    position,
    supersetGroup:
      ex.supersetGroup && (groupSize.get(ex.supersetGroup) ?? 0) >= 2 ? ex.supersetGroup : null,
  }));

  return {
    workout: { ...workout, estimatedMin: result.minutes, exercises },
    carryOverExerciseIds: droppedExercises
      .filter((ex) => !ex.fromLastTime)
      .map((ex) => ex.exerciseId),
    isShort: true,
    minutes: result.minutes,
    exerciseCount: exercises.length,
  };
}
