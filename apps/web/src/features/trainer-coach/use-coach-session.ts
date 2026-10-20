'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { newId, nowIso } from '@/features/gym/workout/ids';
import { skipRest, startRest } from '@/features/gym/workout/rest-timer';
import type { WorkoutActionInput } from '@/features/gym/workout/workout-model';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { setTickOutcome, userFacingErrorMessage, type SessionSupersetSlot } from '@chefer/utils';
import {
  activeWorkouts,
  addClientWorkout,
  applyFinish,
  applySyncResult,
  buildSyncInput,
  clearCoachState,
  coachStorageKey,
  createCoachState,
  dispatchToClient,
  loadCoachState,
  pendingWorkouts,
  saveCoachState,
  selectClient,
  type CoachState,
} from './coach-state';

// The coached logger's controller: one CoachState in React + localStorage
// (written synchronously on every change, like the trainer's own logger), the
// lazy per-client `trainer.coach.start`, and `trainer.coach.sync` for finished
// workouts. Web has no coached outbox: a failed sync keeps the finished doc
// here and retries on reconnect or on "Sync now".

export type StartStatus = { status: 'loading' } | { status: 'error'; message: string };

export type FinishScope = { kind: 'this'; clientId: string } | { kind: 'all' };

export interface CoachSession {
  /** Null until mounted (storage is read in the browser only). */
  state: CoachState | null;
  starting: Readonly<Record<string, StartStatus>>;
  startClient: (clientId: string) => void;
  select: (clientId: string) => void;
  dispatch: (
    clientId: string,
    action: WorkoutActionInput,
    supersets: ReadonlyMap<string, SessionSupersetSlot>,
  ) => void;
  finish: (scope: FinishScope, unstarted: readonly string[]) => void;
  syncNow: () => void;
  syncing: boolean;
}

export function useCoachSession(input: {
  bookingId: string | null;
  /** "Log a workout for Maria" (no booking) or the chip to open first. */
  initialClientId: string | null;
  /** More than one client on the booking (analytics). */
  group: boolean;
  /** Where to go once everyone is finished and synced. */
  exitHref: string;
}): CoachSession {
  const { bookingId, initialClientId, group, exitHref } = input;
  const router = useRouter();
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const utils = trpc.useUtils();
  const key = coachStorageKey(bookingId, initialClientId);

  const [state, setState] = useState<CoachState | null>(null);
  const stateRef = useRef<CoachState | null>(null);
  const [starting, setStarting] = useState<Record<string, StartStatus>>({});
  const [syncing, setSyncing] = useState(false);
  const inflight = useRef(new Set<string>());
  const startsInFlight = useRef(new Set<string>());

  const commit = useCallback(
    (next: CoachState) => {
      stateRef.current = next;
      saveCoachState(key, next);
      setState(next);
    },
    [key],
  );

  // Load (or create) once in the browser.
  useEffect(() => {
    const loaded =
      loadCoachState(key, ownerId) ??
      createCoachState({ ownerId, bookingId, activeClientId: initialClientId });
    stateRef.current = loaded;
    setState(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read storage once per booking/client
  }, [key]);

  const syncNow = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const due = pendingWorkouts(current).filter((w) => !inflight.current.has(w.clientId));
    if (due.length === 0) return;
    setSyncing(true);
    void Promise.all(
      due.map(async (w) => {
        if (!w.doc) return;
        inflight.current.add(w.clientId);
        try {
          const res = await utils.client.trainer.coach.sync.mutate(
            buildSyncInput(w.clientId, w.doc, current.bookingId),
          );
          const result = res.results.find((r) => r.id === w.doc?.id);
          if (stateRef.current) commit(applySyncResult(stateRef.current, w.clientId, { result }));
        } catch (error) {
          if (stateRef.current) {
            commit(
              applySyncResult(stateRef.current, w.clientId, {
                // Raw text: the sync line classifies it (offline vs server), like the gym outbox.
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            );
          }
        } finally {
          inflight.current.delete(w.clientId);
        }
      }),
    ).finally(() => {
      setSyncing(false);
      // Attendance, the client's Workouts tab and Today all changed.
      void utils.trainer.invalidate();
    });
  }, [commit, utils]);

  // Resume: a finished workout still waiting from before a reload; and retry on reconnect.
  useEffect(() => {
    if (state === null) return;
    syncNow();
    window.addEventListener('online', syncNow);
    return () => window.removeEventListener('online', syncNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once loaded, then on `online`
  }, [state === null, syncNow]);

  // Everyone finished and saved: back to the booking (or the client).
  const done =
    state !== null &&
    state.exitWhenSynced &&
    activeWorkouts(state).length === 0 &&
    pendingWorkouts(state).length === 0;
  useEffect(() => {
    if (!done) return;
    clearCoachState(key);
    router.replace(exitHref);
  }, [done, key, exitHref, router]);

  const startClient = useCallback(
    (clientId: string) => {
      const current = stateRef.current;
      if (!current) return;
      if (current.workouts[clientId]) {
        commit(selectClient(current, clientId));
        return;
      }
      commit(selectClient(current, clientId));
      if (startsInFlight.current.has(clientId)) return;
      startsInFlight.current.add(clientId);
      setStarting((s) => ({ ...s, [clientId]: { status: 'loading' } }));
      const today = localDate();
      utils.client.trainer.coach.start
        .mutate({ clientId, today, ...(bookingId ? { bookingId } : {}) })
        .then((dto) => {
          const latest = stateRef.current;
          if (!latest) return;
          const next = addClientWorkout(latest, dto, { today, now: nowIso(), newId });
          // Keep the chip the trainer is on now (they may have switched while it loaded).
          commit({ ...next, activeClientId: latest.activeClientId ?? clientId });
          if (dto.workout) capture('coached_workout_started', { group });
          setStarting(({ [clientId]: _done, ...rest }) => rest);
        })
        .catch((error: unknown) =>
          setStarting((s) => ({
            ...s,
            [clientId]: { status: 'error', message: userFacingErrorMessage(error) },
          })),
        )
        .finally(() => startsInFlight.current.delete(clientId));
    },
    [bookingId, commit, group, utils],
  );

  const select = useCallback(
    (clientId: string) => {
      if (stateRef.current) commit(selectClient(stateRef.current, clientId));
    },
    [commit],
  );

  const dispatch = useCallback<CoachSession['dispatch']>(
    (clientId, action, supersets) => {
      const current = stateRef.current;
      if (!current) return;
      const next = dispatchToClient(current, clientId, { ...action, at: nowIso() });
      if (next === current) return;
      commit(next);
      // The same rest rule as the trainer's own logger (a superset rests after its round).
      const doc = next.workouts[clientId]?.doc;
      if (action.type === 'completeSet' && doc) {
        const outcome = setTickOutcome(doc, supersets, action.seId, action.setId);
        if (outcome.kind === 'rest') startRest(outcome.restSec, outcome.seId);
        else if (outcome.kind === 'advance') skipRest();
      }
    },
    [commit],
  );

  const finish = useCallback(
    (scope: FinishScope, unstarted: readonly string[]) => {
      const current = stateRef.current;
      if (!current) return;
      const before = new Set(pendingWorkouts(current).map((w) => w.clientId));
      const next = applyFinish(current, scope, nowIso(), unstarted);
      commit(next);
      skipRest();
      for (const w of pendingWorkouts(next)) {
        if (!before.has(w.clientId)) capture('coached_workout_finished', {});
      }
      syncNow();
    },
    [commit, syncNow],
  );

  return { state, starting, startClient, select, dispatch, finish, syncNow, syncing };
}
