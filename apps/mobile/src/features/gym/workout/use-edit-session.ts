import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { WorkoutSessionDoc } from '@chefer/types';
import {
  hasEdits,
  replaceExerciseKeepingSets,
  rescheduleSession,
  workoutReducer,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { nowIso } from '../offline/ids';
import { outbox } from '../offline/outbox';
import type { WorkoutActionInput } from '../use-active-workout';
import { useIsOnline } from './use-is-online';

// Edit mode's draft (UX-44, T-44.3): a completed session loaded into a draft
// that lives ONLY in this hook's state. It never goes through
// `activeSessionStore` / `dispatchWorkout` (the live logger's crash-safe
// store), so a workout in progress is never touched by an edit (AC3) — the
// same pure `workoutReducer` drives both, nothing else is shared.

export type EditSessionState =
  | { status: 'loading' }
  /** Not cached and offline, or the session doesn't exist / isn't completed. */
  | { status: 'unavailable'; offline: boolean }
  | {
      status: 'ready';
      original: WorkoutSessionDoc;
      draft: WorkoutSessionDoc;
      dirty: boolean;
    };

export interface EditSession {
  state: EditSessionState;
  /** Live doc for stable handlers (never stale between renders). */
  getDraft: () => WorkoutSessionDoc | null;
  /** Apply a reducer action to the draft. `at` is stamped here. */
  dispatch: (action: WorkoutActionInput, options?: { at?: string }) => void;
  /** Replace an exercise, keeping its logged sets' numbers (this workout only). */
  replaceExercise: (seId: string, exerciseId: string) => void;
  /** Move the session to another day/time (never the future). */
  reschedule: (input: { localDate: string; startedAt: string }) => void;
}

/** The outbox's copy of a session, when an earlier correction hasn't synced yet. */
function pendingDoc(id: string): WorkoutSessionDoc | null {
  const entry = outbox.getState().entries.find((e) => e.doc.id === id && !e.parkedReason);
  return entry?.doc ?? null;
}

export function useEditSession(sessionId: string): EditSession {
  const online = useIsOnline();
  // Re-render when the outbox changes so `pending` below is current.
  useSyncExternalStore(outbox.subscribe, outbox.getState);
  const pending = pendingDoc(sessionId);
  const query = trpc.gym.session.get.useQuery(
    { id: sessionId },
    { enabled: pending === null && online, retry: false },
  );
  // A disabled query still returns its cached (persisted) data, so a session
  // opened before opens again offline; a session never loaded needs a connection.
  const source = pending ?? query.data ?? null;

  const [original, setOriginal] = useState<WorkoutSessionDoc | null>(null);
  const [draft, setDraft] = useState<WorkoutSessionDoc | null>(null);
  const draftRef = useRef<WorkoutSessionDoc | null>(null);

  // Load once: a refetch that lands while the user is editing must not replace the draft.
  useEffect(() => {
    if (original !== null || source?.status !== 'COMPLETED') return;
    setOriginal(source);
    setDraft(source);
    draftRef.current = source;
  }, [original, source]);

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

  const reschedule = useCallback<EditSession['reschedule']>(
    (input) => apply((doc) => rescheduleSession(doc, { ...input, now: nowIso(), at: nowIso() })),
    [apply],
  );

  const getDraft = useCallback(() => draftRef.current, []);

  let state: EditSessionState;
  if (original && draft) {
    state = { status: 'ready', original, draft, dirty: hasEdits(original, draft) };
  } else if (source !== null && source.status !== 'COMPLETED') {
    state = { status: 'unavailable', offline: false };
  } else if (query.isLoading && pending === null && online) {
    state = { status: 'loading' };
  } else if (source === null) {
    state = { status: 'unavailable', offline: !online };
  } else {
    state = { status: 'loading' };
  }

  return { state, getDraft, dispatch, replaceExercise, reschedule };
}
