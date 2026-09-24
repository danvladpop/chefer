import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { startSession, workoutReducer, type WorkoutAction } from '@chefer/utils';
import {
  activeSessionStore,
  useActiveSessionRecord,
  type ActiveSessionRecord,
} from './offline/active-session-store';
import { localDate, newId, nowIso } from './offline/ids';
import { outbox } from './offline/outbox';
import { getGymOwner, subscribeGymOwner } from './offline/owner';
import { ensureRestNotificationPermission, skipRest, startRest } from './rest-timer';
import { applyFinishedLocally } from './use-gym-bootstrap';

// Active workout (gym_plan.md §5.3): the shared pure reducer + crash-safe
// persistence + rest timer. Every change goes reducer → setItemSync, so the
// on-disk doc is never more than one tap behind the screen.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Reducer actions minus `at` (stamped here) and minus finish/discard (own methods). */
export type WorkoutActionInput = DistributiveOmit<
  Exclude<WorkoutAction, { type: 'finish' } | { type: 'discard' }>,
  'at'
>;

export type StartWorkoutInput =
  | { kind: 'planned'; workout: NextWorkoutDto }
  | { kind: 'freestyle'; name?: string };

export const FREESTYLE_NAME = 'Freestyle workout';

/** An active record is resumable only by the account that started it. */
function belongsTo(record: ActiveSessionRecord | null, owner: string | null): boolean {
  return record !== null && (record.ownerId === null || owner === null || record.ownerId === owner);
}

/** The resumable in-progress session for the current user, if any. */
export function getResumableSession(): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  return belongsTo(record, getGymOwner()) ? (record?.doc ?? null) : null;
}

/**
 * Starts a session (planned day or freestyle) and persists it. If a session is
 * already in progress it is returned untouched — starting never overwrites a
 * workout; the caller should offer Resume / Discard first.
 */
export function startWorkout(input: StartWorkoutInput): WorkoutSessionDoc {
  const existing = getResumableSession();
  if (existing) return existing;

  const planned = input.kind === 'planned' ? input.workout : null;
  const doc = startSession({
    id: newId(),
    newId,
    now: nowIso(),
    localDate: localDate(),
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
  // Lazy, one-time permission ask for the background rest-timer alert — at a
  // user action, never on cold start.
  void ensureRestNotificationPermission();
  return doc;
}

/**
 * Applies one action to the active session (stamping `at`) and persists it
 * synchronously. Ticking a WORKING set starts the rest timer with that
 * exercise's restSec. Returns the new doc (null when nothing is active).
 */
export function dispatchWorkout(action: WorkoutActionInput): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  if (!record) return null;
  const next = workoutReducer(record.doc, { ...action, at: nowIso() });
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
 * Finish: reducer 'finish' → outbox.enqueue (durable FIRST) → optimistic fold
 * into the cached bootstrap → clear the active session and rest timer.
 * Returns the finished doc (its id routes to the summary screen).
 */
export async function finishWorkout(queryClient: QueryClient): Promise<WorkoutSessionDoc | null> {
  const record = activeSessionStore.get();
  if (!record) return null;
  const finished = workoutReducer(record.doc, { type: 'finish', at: nowIso() });
  outbox.enqueue(finished, { ownerId: record.ownerId ?? getGymOwner() });
  activeSessionStore.clear();
  skipRest();
  await applyFinishedLocally(queryClient, finished);
  return finished;
}

/**
 * Discard: the DISCARDED doc still goes through the outbox (the server may
 * hold an in-progress checkpoint of it), then the active session is cleared.
 */
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
 * Startup repair (called once the signed-in user is known):
 *  • the app died between Finish's enqueue and clear → the doc is already in
 *    the outbox as COMPLETED/DISCARDED → drop the stale active copy;
 *  • the active session belongs to ANOTHER account (sign-out/sign-in) → hand
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

export interface ActiveWorkout {
  /** The in-progress session (null when none) — non-null at launch ⇒ offer Resume. */
  session: WorkoutSessionDoc | null;
  isActive: boolean;
  start: (input: StartWorkoutInput) => WorkoutSessionDoc;
  dispatch: (action: WorkoutActionInput) => WorkoutSessionDoc | null;
  finish: () => Promise<WorkoutSessionDoc | null>;
  discard: () => WorkoutSessionDoc | null;
}

export function useActiveWorkout(): ActiveWorkout {
  const record = useActiveSessionRecord();
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner);
  const queryClient = useQueryClient();
  const session = belongsTo(record, owner) ? (record?.doc ?? null) : null;
  const finish = useCallback(() => finishWorkout(queryClient), [queryClient]);

  return useMemo(
    () => ({
      session,
      isActive: session !== null,
      start: startWorkout,
      dispatch: dispatchWorkout,
      finish,
      discard: discardWorkout,
    }),
    [session, finish],
  );
}
