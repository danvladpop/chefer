// UX-36 amendment A1 (T-36.A1.1, O-09): a pure summary of an in-progress
// session for the Resume card, built on the same `workoutFocus()` the logger
// uses, so the card and the logger can never disagree. Shared by mobile
// (`resume-card.tsx`), web (`ResumeBanner`) and Food Today's workout card.
import type { SessionExerciseDoc, WorkoutSessionDoc } from '@chefer/types';
import { workoutFocus, type SessionSupersetSlot } from './supersets';
import type { ExerciseLookup } from './volume';

const NO_SUPERSETS: ReadonlyMap<string, SessionSupersetSlot> = new Map();

export type ResumeState = 'active' | 'paused' | 'backfill' | 'allLogged';

export interface ResumeFocus {
  exerciseId: string;
  name: string;
  setIndex: number; // 1-based "set k"
  setCount: number;
  /** True once the focused exercise's own sets are all ticked but others remain — never surfaced today (kept for future cardio-timer text). */
  isTimer: boolean;
}

export interface ResumeSummary {
  state: ResumeState;
  name: string;
  elapsedSec: number;
  exercisesDone: number;
  exercisesTotal: number;
  setsDone: number;
  setsTotal: number;
  focus: ResumeFocus | null;
  /** Only set when `state === 'paused'` (the 24 h save-for-later window). */
  keepsUntilIso: string | null;
}

function workingSets(se: SessionExerciseDoc) {
  return se.sets.filter((s) => !s.isWarmup);
}

function isExerciseDone(se: SessionExerciseDoc): boolean {
  const sets = workingSets(se);
  return sets.length > 0 && sets.every((s) => s.completedAt !== null);
}

/** Hours:minutes:seconds elapsed between two ISO instants, floored at 0. */
export function elapsedSeconds(fromIso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(ms / 1000));
}

/** 24 h keep window for a saved-for-later session (UX-36 (3)). */
export function keepsUntilIso(pausedAtIso: string): string {
  return new Date(new Date(pausedAtIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Summarise an in-progress (not yet finished) session. `now` and `pausedAt`
 * are ISO instants; `pausedAt` set means "Save for later" was used (the
 * device-only field, never uploaded). `isBackfill` marks a "Log a past
 * workout" session (no live timer). `lookup` names the focused exercise.
 */
export function resumeSummary(
  doc: WorkoutSessionDoc,
  opts: {
    now: string;
    pausedAt?: string | null;
    isBackfill?: boolean;
    supersets?: ReadonlyMap<string, SessionSupersetSlot>;
    lookup: ExerciseLookup;
  },
): ResumeSummary {
  const { now, pausedAt = null, isBackfill = false, supersets = NO_SUPERSETS, lookup } = opts;
  const active = doc.exercises.filter((se) => !se.skipped);
  const exercisesTotal = active.length;
  const exercisesDone = active.filter(isExerciseDone).length;
  const setsTotal = active.reduce((n, se) => n + workingSets(se).length, 0);
  const setsDone = active.reduce(
    (n, se) => n + workingSets(se).filter((s) => s.completedAt !== null).length,
    0,
  );

  const focusPoint = workoutFocus(doc, supersets);
  const se = focusPoint ? doc.exercises.find((e) => e.id === focusPoint.seId) : undefined;
  const focus: ResumeFocus | null =
    focusPoint && se
      ? {
          exerciseId: se.exerciseId,
          name: lookup(se.exerciseId)?.name ?? 'Exercise',
          setIndex: workingSets(se).findIndex((s) => s.id === focusPoint.setId) + 1,
          setCount: workingSets(se).length,
          isTimer: lookup(se.exerciseId)?.isTimed ?? false,
        }
      : null;

  const allLogged = exercisesTotal > 0 && exercisesDone === exercisesTotal;
  const state: ResumeState = isBackfill
    ? 'backfill'
    : allLogged
      ? 'allLogged'
      : pausedAt !== null
        ? 'paused'
        : 'active';

  return {
    state,
    name: doc.name,
    elapsedSec: elapsedSeconds(doc.startedAt, pausedAt ?? now),
    exercisesDone,
    exercisesTotal,
    setsDone,
    setsTotal,
    focus,
    keepsUntilIso: pausedAt !== null ? keepsUntilIso(pausedAt) : null,
  };
}
