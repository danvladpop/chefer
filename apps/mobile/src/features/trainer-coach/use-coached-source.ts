import { useCallback, useMemo } from 'react';
import type { DispatchOptions, WorkoutActionInput } from '../gym/use-active-workout';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';
import type { CoachedWorkoutChrome, WorkoutSource } from '../gym/workout/workout-source';
import { coachedBootstrap } from './coach-model';
import { coachedSessionStore, type CoachedWorkoutRecord } from './coached-session-store';
import { discardCoached, dispatchCoached, finishCoached } from './coached-workouts';

/**
 * The workout logger's source for one client's coached workout: their record in the coached store,
 * their prescription / units / exercise meta, their outbox on Finish (workout-source.tsx).
 */
export function useCoachedSource(
  record: CoachedWorkoutRecord | null,
  bookingId: string | null,
  clientId: string,
  chrome: CoachedWorkoutChrome,
): WorkoutSource {
  const { data: owner } = useGymBootstrap();
  const client = record?.client;
  const workout = record?.workout ?? null;
  const exercises = record?.exercises;
  const bootstrap = useMemo(
    () =>
      client && exercises ? coachedBootstrap({ client, workout, exercises }, owner) : undefined,
    [client, workout, exercises, owner],
  );

  const get = useCallback(
    () => coachedSessionStore.find(bookingId, clientId)?.doc ?? null,
    [bookingId, clientId],
  );
  const dispatch = useCallback(
    (action: WorkoutActionInput, options?: DispatchOptions) =>
      dispatchCoached(bookingId, clientId, action, options),
    [bookingId, clientId],
  );
  const finish = useCallback(
    (carryOverExerciseIds?: string[]) =>
      Promise.resolve(finishCoached(bookingId, clientId, carryOverExerciseIds)),
    [bookingId, clientId],
  );
  const discard = useCallback(() => discardCoached(bookingId, clientId), [bookingId, clientId]);

  const session = record?.doc ?? null;
  return useMemo(
    () => ({
      session,
      pausedAt: null,
      bootstrap,
      get,
      dispatch,
      finish,
      discard,
      // The records persist on their own: "Save for later" just leaves (the mini bar brings it back).
      saveForLater: noop,
      resume: noop,
      coached: chrome,
    }),
    [session, bootstrap, get, dispatch, finish, discard, chrome],
  );
}

function noop(): void {
  // nothing to do for a coached workout
}
