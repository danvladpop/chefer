'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { trpc } from '@/lib/trpc';
import type { GymBootstrap, NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { applyFinishedSession, startSession, workoutReducer } from '@chefer/utils';
import { libraryLookup, localDate } from '../use-gym-bootstrap';
import {
  activeSessionStore,
  useActiveSessionRecord,
  type ActiveSessionRecord,
} from './active-session-store';
import { newId, nowIso } from './ids';
import { outbox } from './outbox';
import { getGymOwner, subscribeGymOwner } from './owner';
import { skipRest, startRest } from './rest-timer';
import { getStorage, GYM_KEYS, readJson } from './storage';
import type { WorkoutActionInput } from './workout-model';

// Active workout on web (gym_plan.md §5.3): the shared pure reducer plus
// crash-safe persistence. Every change goes reducer → localStorage, so the
// stored doc is never more than one click behind the screen, and a reload
// (or a crashed tab) resumes exactly where it was.

export type StartWorkoutInput =
  | { kind: 'planned'; workout: NextWorkoutDto }
  | { kind: 'freestyle'; name?: string };

export const FREESTYLE_NAME = 'Freestyle workout';

/** An active record is resumable only by the account that started it. */
export function belongsTo(record: ActiveSessionRecord | null, owner: string | null): boolean {
  return record !== null && (record.ownerId === null || owner === null || record.ownerId === owner);
}

export function getResumableSession(): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  return belongsTo(record, getGymOwner()) ? (record?.doc ?? null) : null;
}

/**
 * Starts a session (planned day or freestyle) and persists it. An existing
 * in-progress session is returned untouched — starting never overwrites a
 * workout; the caller offers Resume / Discard first.
 */
export function startWorkout(
  input: StartWorkoutInput,
  today: string = localDate(),
): WorkoutSessionDoc {
  const existing = getResumableSession();
  if (existing) return existing;

  const planned = input.kind === 'planned' ? input.workout : null;
  const doc = startSession({
    id: newId(),
    newId,
    now: nowIso(),
    localDate: today,
    routineId: planned?.routineId ?? null,
    routineDayId: planned?.dayId ?? null,
    name: planned
      ? planned.dayName
      : input.kind === 'freestyle'
        ? (input.name ?? FREESTYLE_NAME)
        : FREESTYLE_NAME,
    isDeload: planned?.isDeload ?? false,
    exercises: planned?.exercises ?? [],
  });
  activeSessionStore.set(doc, getGymOwner());
  return doc;
}

/**
 * Applies one action (stamping `at`) and persists synchronously. Ticking a
 * WORKING set starts the rest timer with that exercise's rest.
 */
export function dispatchWorkout(action: WorkoutActionInput): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  if (!record) return null;
  const next = workoutReducer(record.doc, { ...action, at: nowIso() });
  if (next === record.doc) return next; // unknown ids: nothing changed
  activeSessionStore.set(next, record.ownerId);

  if (action.type === 'completeSet') {
    const exercise = next.exercises.find((e) => e.id === action.seId);
    const set = exercise?.sets.find((s) => s.id === action.setId);
    if (exercise && set && !set.isWarmup) {
      startRest(exercise.restSec, exercise.id);
    }
  }
  return next;
}

/**
 * Finish: reducer 'finish' → outbox.enqueue (durable FIRST) → clear the
 * active session and the rest timer. Returns the finished doc.
 */
export function finishWorkout(): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  if (!record) return null;
  const finished = workoutReducer(record.doc, { type: 'finish', at: nowIso() });
  outbox.enqueue(finished, { ownerId: record.ownerId ?? getGymOwner() });
  getStorage().setItem(
    GYM_KEYS.lastFinished,
    JSON.stringify({ ownerId: record.ownerId, doc: finished }),
  );
  activeSessionStore.clear();
  skipRest();
  return finished;
}

/** The last finished doc on this browser, if it is `id` and belongs to `owner`. */
export function readLastFinished(id: string, owner: string | null): WorkoutSessionDoc | null {
  const stored = readJson(getStorage(), GYM_KEYS.lastFinished);
  if (typeof stored !== 'object' || stored === null) return null;
  const { ownerId, doc } = stored as { ownerId?: string | null; doc?: WorkoutSessionDoc };
  if (doc?.id !== id) return null;
  if (ownerId && owner && ownerId !== owner) return null;
  return doc;
}

/** Discard: the DISCARDED doc still goes through the outbox, then the session is cleared. */
export function discardWorkout(): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  if (!record) return null;
  const discarded = workoutReducer(record.doc, { type: 'discard', at: nowIso() });
  outbox.enqueue(discarded, { ownerId: record.ownerId ?? getGymOwner() });
  activeSessionStore.clear();
  skipRest();
  return discarded;
}

/**
 * Startup repair once the signed-in user is known (mirrors mobile):
 *  • the tab died between Finish's enqueue and clear → drop the stale copy;
 *  • the active session belongs to ANOTHER account (shared computer) → hand
 *    it to the outbox under its owner, so it uploads when they sign back in.
 */
export function reconcileActiveSession(owner: string | null): void {
  const record = activeSessionStore.get();
  if (!record) return;
  const queued = outbox.getState().entries.find((e) => e.doc.id === record.doc.id);
  if (queued && queued.doc.status !== 'IN_PROGRESS') {
    activeSessionStore.clear();
    return;
  }
  if (owner !== null && record.ownerId !== null && record.ownerId !== owner) {
    outbox.enqueue(record.doc, { ownerId: record.ownerId });
    activeSessionStore.clear();
    skipRest();
  }
}

/**
 * Optimistic "next workout" after Finish (gym_plan.md §5.2): fold the doc into
 * a bootstrap with the shared engine. Returns the input on any engine error.
 */
export function foldFinished(
  bootstrap: GymBootstrap,
  doc: WorkoutSessionDoc,
  today: string,
): GymBootstrap {
  if (!bootstrap.profile) return bootstrap;
  try {
    return applyFinishedSession({
      bootstrap,
      doc,
      lookup: libraryLookup(bootstrap),
      facts: { experience: bootstrap.profile.experience, ageYears: null },
      today,
    });
  } catch {
    return bootstrap;
  }
}

/**
 * Re-applies finished workouts still waiting in the outbox on top of a server
 * bootstrap, so a refetch before the upload lands never rolls "next up" back.
 */
export function reconcileWithPending(
  bootstrap: GymBootstrap,
  pending: readonly WorkoutSessionDoc[],
  today: string,
): GymBootstrap {
  if (!bootstrap.profile) return bootstrap;
  const known = new Set(bootstrap.recentSessions.map((s) => s.id));
  return pending
    .filter((doc) => doc.status === 'COMPLETED' && !known.has(doc.id))
    .sort((a, b) => (a.finishedAt ?? a.startedAt).localeCompare(b.finishedAt ?? b.startedAt))
    .reduce((current, doc) => foldFinished(current, doc, today), bootstrap);
}

export interface ActiveWorkout {
  /** The in-progress session (null when none, and during SSR/hydration). */
  session: WorkoutSessionDoc | null;
  start: (input: StartWorkoutInput) => WorkoutSessionDoc;
  dispatch: (action: WorkoutActionInput) => WorkoutSessionDoc | null;
  finish: () => Promise<WorkoutSessionDoc | null>;
  discard: () => WorkoutSessionDoc | null;
}

const serverOwner = () => null;

export function useActiveWorkout(): ActiveWorkout {
  const record = useActiveSessionRecord();
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner, serverOwner);
  const utils = trpc.useUtils();
  const session = belongsTo(record, owner) ? (record?.doc ?? null) : null;

  const finish = useCallback(async () => {
    const finished = finishWorkout();
    if (!finished) return null;
    const today = localDate();
    // A bootstrap fetched before the upload must not overwrite the fold.
    await utils.gym.bootstrap.cancel();
    utils.gym.bootstrap.setData({ today }, (prev) =>
      prev ? foldFinished(prev, finished, today) : prev,
    );
    return finished;
  }, [utils]);

  const start = useCallback((input: StartWorkoutInput) => startWorkout(input), []);

  return useMemo(
    () => ({ session, start, dispatch: dispatchWorkout, finish, discard: discardWorkout }),
    [session, start, finish],
  );
}
