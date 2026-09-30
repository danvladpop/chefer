import { useCallback, useEffect, useRef, useState } from 'react';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import {
  buildNextWorkout,
  equipmentProfileOf,
  estimateMinutes,
  hasEdits,
  progressionKey,
  replaceExerciseKeepingSets,
  startSession,
  workoutReducer,
  type ProgressionEntry,
} from '@chefer/utils';
import { newId, nowIso } from '../offline/ids';
import { localInstant } from '../reminders/schedule';
import { FREESTYLE_NAME } from '../use-active-workout';
import { libraryLookup, useGymBootstrap } from '../use-gym-bootstrap';
import { retimeDraft, type EditSession, type EditSessionState } from './use-edit-session';

// Log mode's draft (owner dogfood 2026-09-30): "Log a workout you already did"
// no longer starts a live, timed workout. It opens the past-workout logger
// over a NEW session — the planned day's exercises and target numbers (or an
// empty freestyle), no warm-ups, no ticks — that lives only in this hook's
// state, exactly like edit mode's draft (`use-edit-session.ts`). The live
// workout store is never touched, so a workout in progress is safe too.

/** A new log starts at this local time on the picked day (the old backfill default). */
export const LOG_START_TIME = '18:00';
/** Duration when there's no estimate (freestyle). */
export const DEFAULT_LOG_DURATION_MIN = 60;

export interface LogSessionParams {
  /** The picked day, YYYY-MM-DD. */
  date: string;
  /** A routine day of the active routine, or null for freestyle. */
  dayId: string | null;
}

/** Builds the log's starting draft: the planned day's working sets at their targets, or empty. */
export function buildLogDraft(
  bootstrap: GymBootstrap,
  { date, dayId }: LogSessionParams,
): WorkoutSessionDoc {
  const routine = bootstrap.activeRoutine;
  const profile = bootstrap.profile;
  const day = dayId ? routine?.days.find((d) => d.id === dayId) : undefined;
  const lookup = libraryLookup(bootstrap);

  const workout =
    day && routine && profile
      ? buildNextWorkout({
          routine,
          dayId: day.id,
          lookup,
          progressions: new Map<string, ProgressionEntry>(
            bootstrap.progressions.map((p) => [
              progressionKey(p.exerciseId, p.repBucket),
              { state: p.state, override: p.override },
            ]),
          ),
          profile: equipmentProfileOf(profile),
          facts: { experience: profile.experience, ageYears: null },
          today: date,
          recentSessions: bootstrap.recentSessions,
          isDeload: false,
        })
      : null;

  const started = startSession({
    id: newId(),
    newId,
    now: localInstant(date, LOG_START_TIME),
    localDate: date,
    routineId: workout?.routineId ?? null,
    routineDayId: workout?.dayId ?? null,
    name: workout?.dayName ?? FREESTYLE_NAME,
    isDeload: workout?.isDeload ?? false,
    exercises: workout?.exercises ?? [],
  });
  // Warm-ups are left out: a log records the work sets you did.
  const doc: WorkoutSessionDoc = {
    ...started,
    exercises: started.exercises.map((se) => ({
      ...se,
      sets: se.sets.filter((s) => !s.isWarmup).map((s, position) => ({ ...s, position })),
    })),
  };
  const estimate = workout
    ? estimateMinutes(
        workout.exercises.map((ex) => ({
          sets: ex.suggestion.sets,
          restSec: ex.restSec,
          isCompound: lookup(ex.exerciseId)?.category === 'COMPOUND',
        })),
      )
    : 0;
  return retimeDraft(
    doc,
    { localDate: date, durationMin: estimate > 0 ? estimate : DEFAULT_LOG_DURATION_MIN },
    LOG_START_TIME,
  );
}

export function useLogSession(params: LogSessionParams): EditSession {
  const { data: bootstrap } = useGymBootstrap();
  const [original, setOriginal] = useState<WorkoutSessionDoc | null>(null);
  const [draft, setDraft] = useState<WorkoutSessionDoc | null>(null);
  const draftRef = useRef<WorkoutSessionDoc | null>(null);
  const { date, dayId } = params;

  // Build once: a bootstrap refetch while the user is logging must not reset the draft.
  useEffect(() => {
    if (original !== null || !bootstrap) return;
    const built = buildLogDraft(bootstrap, { date, dayId });
    setOriginal(built);
    setDraft(built);
    draftRef.current = built;
  }, [bootstrap, date, dayId, original]);

  const apply = useCallback((fn: (doc: WorkoutSessionDoc) => WorkoutSessionDoc) => {
    const current = draftRef.current;
    if (!current) return;
    const next = fn(current);
    draftRef.current = next;
    setDraft(next);
  }, []);

  const dispatch = useCallback<EditSession['dispatch']>(
    (action, options) => {
      apply((doc) => workoutReducer(doc, { ...action, at: options?.at ?? nowIso() }));
    },
    [apply],
  );

  const replaceExercise = useCallback<EditSession['replaceExercise']>(
    (seId, exerciseId) =>
      apply((doc) => replaceExerciseKeepingSets(doc, seId, exerciseId, nowIso())),
    [apply],
  );

  const retime = useCallback<EditSession['retime']>(
    (input) => apply((doc) => retimeDraft(doc, input, LOG_START_TIME)),
    [apply],
  );

  const getDraft = useCallback(() => draftRef.current, []);

  // Until the (persisted) bootstrap is there, there's nothing to build from.
  const state: EditSessionState =
    original && draft
      ? { status: 'ready', original, draft, dirty: hasEdits(original, draft) }
      : { status: 'loading' };

  return { state, getDraft, dispatch, replaceExercise, retime };
}
