import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import {
  setTickOutcome,
  startSession,
  unstartedExercises,
  workoutReducer,
  type SessionSupersetSlot,
  type WorkoutAction,
} from '@chefer/utils';
import {
  activeSessionStore,
  useActiveSessionRecord,
  type ActiveSessionRecord,
} from './offline/active-session-store';
import { localDate, newId, nowIso } from './offline/ids';
import { outbox } from './offline/outbox';
import { getGymOwner, subscribeGymOwner } from './offline/owner';
import { localInstant } from './reminders/schedule';
import { skipRest, startRest } from './rest-timer';
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
  | {
      kind: 'planned';
      workout: NextWorkoutDto;
      backfillDate?: string;
      /**
       * T-36.6: exercises a short version dropped ("Time today: 30"). Stored
       * on the session doc, so Finish carries them to the next session
       * (`From last time`) exactly like T-36.3's "Move them to next time".
       * Omit for the full-length path — the doc is then byte-for-byte as before.
       */
      carryOverExerciseIds?: string[];
    }
  | { kind: 'freestyle'; name?: string; backfillDate?: string };

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
  // Streak repair (gym_plan.md §1.4 "Repair"): a backfilled session gets the
  // PICKED date's localDate and an 18:00-local startedAt, not "now" — the
  // user logs the actual sets live, but the session belongs to that day for
  // week-goal, streak and progression-fold purposes (packages/utils/src/gym
  // sorts exposures by performedAt, not by when they were logged).
  const backfillDate = input.backfillDate;
  const doc = startSession({
    id: newId(),
    newId,
    now: backfillDate ? localInstant(backfillDate, '18:00') : nowIso(),
    localDate: backfillDate ?? localDate(),
    routineId: planned?.routineId ?? null,
    routineDayId: planned?.dayId ?? null,
    name: planned
      ? planned.dayName
      : input.kind === 'freestyle'
        ? (input.name ?? FREESTYLE_NAME)
        : FREESTYLE_NAME,
    isDeload: planned?.isDeload ?? false,
    exercises: planned?.exercises ?? [],
    ...(input.kind === 'planned' && input.carryOverExerciseIds?.length
      ? { carryOverExerciseIds: input.carryOverExerciseIds }
      : {}),
  });
  activeSessionStore.set(doc, getGymOwner());
  // B-40: the rest-timer background-notification permission used to be asked
  // right here, cold, before the user had any reason to care. It's now asked
  // with a rationale sheet the first time a rest actually starts
  // (`rest-timer-bar.tsx`), never at workout start.
  return doc;
}

/**
 * "Save for later" (UX-36 (3), T-36.3): keeps the session open (existing
 * store) for up to 24 h instead of finishing/discarding. A no-op if nothing
 * is active. Resume card enters its `paused` state (`resume.ts`).
 */
export function saveForLater(): void {
  activeSessionStore.setPausedAt(nowIso());
}

/** Opening the workout screen on a saved-for-later session resumes it. */
export function resumeWorkout(): void {
  activeSessionStore.setPausedAt(null);
}

export interface DispatchOptions {
  /** The session's supersets (sessionSupersets): decides rest vs. advance on a tick. */
  supersets?: ReadonlyMap<string, SessionSupersetSlot>;
}

const NO_SUPERSETS: ReadonlyMap<string, SessionSupersetSlot> = new Map();

/**
 * Applies one action to the active session (stamping `at`) and persists it
 * synchronously. Ticking a WORKING set starts the rest timer with that
 * exercise's restSec — except inside a superset, where the rest waits for the
 * last exercise of the round (a running rest is cleared as the round goes on).
 * Returns the new doc (null when nothing is active).
 */
export function dispatchWorkout(
  action: WorkoutActionInput,
  options: DispatchOptions = {},
): WorkoutSessionDoc | null {
  const record = activeSessionStore.get();
  if (!record) return null;
  const next = workoutReducer(record.doc, { ...action, at: nowIso() });
  activeSessionStore.set(next, record.ownerId);

  if (action.type === 'completeSet') {
    const outcome = setTickOutcome(
      next,
      options.supersets ?? NO_SUPERSETS,
      action.seId,
      action.setId,
    );
    if (outcome.kind === 'rest') startRest(outcome.restSec, outcome.seId);
    else if (outcome.kind === 'advance') skipRest();
  }
  return next;
}

/**
 * Finish: reducer 'finish' → outbox.enqueue (durable FIRST) → optimistic fold
 * into the cached bootstrap → clear the active session and rest timer.
 * Returns the finished doc (its id routes to the summary screen).
 *
 * `carryOverExerciseIds` (T-36.3): the unstarted exercises the user chose to
 * "move to your next session" — omit/[] behaves exactly as before.
 */
export async function finishWorkout(
  queryClient: QueryClient,
  carryOverExerciseIds?: string[],
): Promise<WorkoutSessionDoc | null> {
  const record = activeSessionStore.get();
  if (!record) return null;
  const finished = workoutReducer(record.doc, {
    type: 'finish',
    at: nowIso(),
    carryOverExerciseIds,
  });
  outbox.enqueue(finished, { ownerId: record.ownerId ?? getGymOwner() });
  activeSessionStore.clear();
  skipRest();
  await applyFinishedLocally(queryClient, finished);
  return finished;
}

/** 24 h "Save for later" window (UX-36 (3)) — kept in one place with `resume.ts`'s copy of it. */
const SAVE_FOR_LATER_HOURS = 24;

export interface AutoFinishNotice {
  dayName: string;
  workingSetsDone: number;
}

/**
 * Startup/foreground check (UX-36 (3)): a session "saved for later" more
 * than 24 h ago finishes automatically with whatever was logged (D22 — half
 * sessions still count), carrying over anything never started, exactly like
 * a manual Finish would. Returns a notice for Gym Today to show once
 * (`We finished your {dayName} with {n} sets.`), or null if nothing timed out.
 */
export async function checkPausedWorkoutTimeout(
  queryClient: QueryClient,
): Promise<AutoFinishNotice | null> {
  const record = activeSessionStore.get();
  if (!record?.pausedAt) return null;
  const ageMs = Date.now() - Date.parse(record.pausedAt);
  if (ageMs < SAVE_FOR_LATER_HOURS * 60 * 60 * 1000) return null;

  const doc = record.doc;
  const carryOverExerciseIds = unstartedExercises(doc).map((e) => e.exerciseId);
  const workingSetsDone = doc.exercises.reduce(
    (n, se) => n + se.sets.filter((s) => !s.isWarmup && s.completedAt !== null).length,
    0,
  );
  await finishWorkout(queryClient, carryOverExerciseIds);
  return { dayName: doc.name, workingSetsDone };
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
  dispatch: (action: WorkoutActionInput, options?: DispatchOptions) => WorkoutSessionDoc | null;
  /** `carryOverExerciseIds` (T-36.3): move these unstarted exercises to next time. */
  finish: (carryOverExerciseIds?: string[]) => Promise<WorkoutSessionDoc | null>;
  discard: () => WorkoutSessionDoc | null;
  saveForLater: () => void;
  resume: () => void;
}

export function useActiveWorkout(): ActiveWorkout {
  const record = useActiveSessionRecord();
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner);
  const queryClient = useQueryClient();
  const session = belongsTo(record, owner) ? (record?.doc ?? null) : null;
  const finish = useCallback(
    (carryOverExerciseIds?: string[]) => finishWorkout(queryClient, carryOverExerciseIds),
    [queryClient],
  );

  return useMemo(
    () => ({
      session,
      isActive: session !== null,
      start: startWorkout,
      dispatch: dispatchWorkout,
      finish,
      discard: discardWorkout,
      saveForLater,
      resume: resumeWorkout,
    }),
    [session, finish],
  );
}
