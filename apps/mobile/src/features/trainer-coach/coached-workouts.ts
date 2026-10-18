import type { CoachStartDto, WorkoutSessionDoc } from '@chefer/types';
import { unstartedExercises, workoutReducer } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { localDate, newId, nowIso } from '../gym/offline/ids';
import { getGymOwner } from '../gym/offline/owner';
import { skipRest } from '../gym/rest-timer';
import {
  restAfterAction,
  type DispatchOptions,
  type WorkoutActionInput,
} from '../gym/use-active-workout';
import { confirmLoads, startCoachedDoc } from './coach-model';
import { coachedOutboxes } from './coached-outbox';
import { coachedSessionStore, ownedBy, type CoachedWorkoutRecord } from './coached-session-store';

// ─── Coached workout actions (trainer-mode.md §6.7) ───────────────────────────
// The coached twin of use-active-workout: the same shared reducer and rest
// timer, persisted per (booking, client) in the coached store, finished into
// that client's coached outbox. The trainer's own active session is never read
// or written here.

/**
 * Starts the client's workout from their prescription and persists it. An in-progress one for the
 * same booking + client is returned untouched (starting never overwrites a workout). Null when the
 * client has no routine.
 */
export function startCoachedWorkout(
  start: CoachStartDto,
  bookingId: string | null,
  opts: { order: number; group: boolean },
): CoachedWorkoutRecord | null {
  const existing = coachedSessionStore.find(bookingId, start.client.id);
  if (existing) return existing;
  const doc = startCoachedDoc(start, { newId, now: nowIso(), localDate: localDate() });
  if (!doc || !start.workout) return null;
  const record: CoachedWorkoutRecord = {
    v: 1,
    ownerId: getGymOwner(),
    bookingId,
    client: start.client,
    workout: start.workout,
    exercises: start.exercises,
    order: opts.order,
    doc,
  };
  coachedSessionStore.put(record);
  track('coached_workout_started', { group: opts.group });
  return record;
}

/** One action on a client's coached workout (stamped, persisted, rest timer). Null when it is gone. */
export function dispatchCoached(
  bookingId: string | null,
  clientId: string,
  action: WorkoutActionInput,
  options: DispatchOptions = {},
): WorkoutSessionDoc | null {
  const record = coachedSessionStore.find(bookingId, clientId);
  if (!record) return null;
  const next = workoutReducer(record.doc, { ...action, at: nowIso() });
  coachedSessionStore.setDoc(bookingId, clientId, next);
  restAfterAction(next, action, options);
  return next;
}

/**
 * Finish: reducer 'finish' → every set a confirmed load → the client's coached outbox (durable
 * FIRST, with the booking) → the record cleared. Returns the finished doc.
 */
export function finishCoached(
  bookingId: string | null,
  clientId: string,
  carryOverExerciseIds?: string[],
): WorkoutSessionDoc | null {
  const record = coachedSessionStore.find(bookingId, clientId);
  if (!record) return null;
  const finished = confirmLoads(
    workoutReducer(record.doc, { type: 'finish', at: nowIso(), carryOverExerciseIds }),
  );
  coachedOutboxes.enqueue(
    clientId,
    { ...finished, bookingId },
    { ownerId: record.ownerId ?? getGymOwner() },
  );
  coachedSessionStore.remove(bookingId, clientId);
  skipRest();
  track('coached_workout_finished', {});
  return finished;
}

/** Exercises never started move to the client's next session, like the logger's default. */
function carryOverOf(doc: WorkoutSessionDoc): string[] | undefined {
  if (!doc.routineDayId) return undefined;
  const ids = unstartedExercises(doc).map((e) => e.exerciseId);
  return ids.length > 0 ? ids : undefined;
}

/** "Finish Maria's workout" from a group: unstarted exercises carry over to her next session. */
export function finishCoachedWithDefaults(
  bookingId: string | null,
  clientId: string,
): WorkoutSessionDoc | null {
  const record = coachedSessionStore.find(bookingId, clientId);
  if (!record) return null;
  return finishCoached(bookingId, clientId, carryOverOf(record.doc));
}

/** "Finish everyone": every in-progress coached workout of this booking (this trainer's). */
export function finishCoachedGroup(bookingId: string | null): WorkoutSessionDoc[] {
  const owner = getGymOwner();
  const records = coachedSessionStore
    .all()
    .filter((r) => r.bookingId === bookingId && ownedBy(r, owner));
  return records.flatMap((r) => {
    const doc = finishCoachedWithDefaults(bookingId, r.client.id);
    return doc ? [doc] : [];
  });
}

/**
 * Discard: the record is dropped. Nothing is queued — an in-progress coached workout is never
 * checkpointed to the server, so there is nothing there to discard.
 */
export function discardCoached(
  bookingId: string | null,
  clientId: string,
): WorkoutSessionDoc | null {
  const record = coachedSessionStore.find(bookingId, clientId);
  if (!record) return null;
  const discarded = workoutReducer(record.doc, { type: 'discard', at: nowIso() });
  coachedSessionStore.remove(bookingId, clientId);
  skipRest();
  return discarded;
}

/** This trainer's in-progress coached workouts for one booking key, in switcher order. */
export function coachedGroup(
  records: readonly CoachedWorkoutRecord[],
  bookingId: string | null,
  owner: string | null,
): CoachedWorkoutRecord[] {
  return records.filter((r) => r.bookingId === bookingId && ownedBy(r, owner));
}
