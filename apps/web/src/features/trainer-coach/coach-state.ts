import { getStorage, readJson } from '@/features/gym/workout/storage';
import { sessionProgress } from '@/features/gym/workout/workout-model';
import type { z } from 'zod';
import type {
  CoachStartDto,
  coachSyncInputSchema,
  ExerciseDto,
  NextWorkoutDto,
  SyncResultDto,
  WorkoutSessionDoc,
} from '@chefer/types';
import { startSession, workoutReducer, type WorkoutAction } from '@chefer/utils';

// ─── Coached workout state (docs/prd-2026-10/trainer-mode.md §6.7, M3) ────────
// One coached booking = one CoachState: a workout per client, each driven by
// the shared `workoutReducer` exactly like the trainer's own logger. Switching
// clients only changes `activeClientId`, so every client's logger keeps its
// state. The whole map is persisted per booking (or per client for "Log a
// workout for Maria") so a reload loses no sets. Pure functions; the hook in
// use-coach-session.ts owns React state, storage writes and the network.

/** A client's workout: being logged → finished (waiting for its sync) → synced. */
export type CoachWorkoutPhase = 'active' | 'finished' | 'synced';

export interface CoachClientWorkout {
  clientId: string;
  name: string;
  unit: 'KG' | 'LB';
  /** The prescription it started from (last-time columns, the trainer's cues). Null = no routine. */
  workout: NextWorkoutDto | null;
  /** Exercise metadata for the workout's rows (names, tracking types, thumbnails). */
  exercises: ExerciseDto[];
  /** Null when the client has no routine (nothing to log). */
  doc: WorkoutSessionDoc | null;
  phase: CoachWorkoutPhase;
  /** Why the last sync failed; the finished doc stays here until a retry lands. */
  syncError: string | null;
}

export interface CoachState {
  v: 1;
  /** The trainer who coached (a shared computer never resumes someone else's). */
  ownerId: string | null;
  bookingId: string | null;
  activeClientId: string | null;
  /** Key order = the order workouts were started. */
  workouts: Record<string, CoachClientWorkout>;
  /** Leave for the booking / client page once everything has synced (Finish everyone, or the last one). */
  exitWhenSynced: boolean;
}

export type CoachSyncInput = z.input<typeof coachSyncInputSchema>;

export function createCoachState(input: {
  ownerId: string | null;
  bookingId: string | null;
  activeClientId: string | null;
}): CoachState {
  return {
    v: 1,
    ownerId: input.ownerId,
    bookingId: input.bookingId,
    activeClientId: input.activeClientId,
    workouts: {},
    exitWhenSynced: false,
  };
}

export function selectClient(state: CoachState, clientId: string): CoachState {
  return state.activeClientId === clientId ? state : { ...state, activeClientId: clientId };
}

/**
 * Adds a client's workout from `trainer.coach.start` and makes it the active
 * one. A client who already has a workout here keeps it (starting twice never
 * overwrites sets).
 */
export function addClientWorkout(
  state: CoachState,
  start: CoachStartDto,
  opts: { today: string; now: string; newId: () => string },
): CoachState {
  const clientId = start.client.id;
  if (state.workouts[clientId]?.doc) return selectClient(state, clientId);
  const doc = start.workout
    ? startSession({
        id: opts.newId(),
        newId: opts.newId,
        now: opts.now,
        localDate: opts.today,
        routineId: start.workout.routineId,
        routineDayId: start.workout.dayId,
        name: start.workout.dayName,
        isDeload: start.workout.isDeload,
        exercises: start.workout.exercises,
      })
    : null;
  const entry: CoachClientWorkout = {
    clientId,
    name: start.client.name,
    unit: start.client.unit,
    workout: start.workout,
    exercises: start.exercises,
    doc,
    phase: 'active',
    syncError: null,
  };
  return {
    ...state,
    activeClientId: clientId,
    workouts: { ...state.workouts, [clientId]: entry },
  };
}

/** One reducer action on ONE client's workout; the others are untouched. */
export function dispatchToClient(
  state: CoachState,
  clientId: string,
  action: WorkoutAction,
): CoachState {
  const entry = state.workouts[clientId];
  if (!entry?.doc || entry.phase !== 'active') return state;
  const doc = workoutReducer(entry.doc, action);
  if (doc === entry.doc) return state;
  return { ...state, workouts: { ...state.workouts, [clientId]: { ...entry, doc } } };
}

/** Workouts still being logged (with something to log). */
export function activeWorkouts(state: CoachState): CoachClientWorkout[] {
  return Object.values(state.workouts).filter((w) => w.phase === 'active' && w.doc !== null);
}

/** Finished workouts whose sync has not landed yet. */
export function pendingWorkouts(state: CoachState): CoachClientWorkout[] {
  return Object.values(state.workouts).filter((w) => w.phase === 'finished' && w.doc !== null);
}

function ticked(w: CoachClientWorkout): number {
  return w.doc ? sessionProgress(w.doc).done : 0;
}

/**
 * What a Finish would do. "Finish this" finishes the one client. "Finish
 * everyone" finishes every workout with at least one ticked set; a started
 * workout with nothing ticked (a no-show the trainer tapped on) is left out
 * and dropped, so it never marks them attended.
 */
export function finishPlan(
  state: CoachState,
  scope: { kind: 'this'; clientId: string } | { kind: 'all' },
): { finish: string[]; drop: string[] } {
  const active = activeWorkouts(state);
  if (scope.kind === 'this') {
    return {
      finish: active.some((w) => w.clientId === scope.clientId) ? [scope.clientId] : [],
      drop: [],
    };
  }
  return {
    finish: active.filter((w) => ticked(w) > 0).map((w) => w.clientId),
    drop: active.filter((w) => ticked(w) === 0).map((w) => w.clientId),
  };
}

/**
 * Applies a finish: the reducer's `finish` on each finished doc (COMPLETED),
 * dropped workouts removed, and the active chip moved to a client still
 * training. `exitWhenSynced` is set when nothing is left to log here
 * (`unstarted` = booking clients who have no workout yet).
 */
export function applyFinish(
  state: CoachState,
  scope: { kind: 'this'; clientId: string } | { kind: 'all' },
  at: string,
  unstarted: readonly string[] = [],
): CoachState {
  const plan = finishPlan(state, scope);
  const workouts: Record<string, CoachClientWorkout> = {};
  for (const [id, w] of Object.entries(state.workouts)) {
    if (plan.drop.includes(id)) continue;
    if (plan.finish.includes(id) && w.doc) {
      workouts[id] = {
        ...w,
        doc: workoutReducer(w.doc, { type: 'finish', at }),
        phase: 'finished',
        syncError: null,
      };
    } else {
      workouts[id] = w;
    }
  }
  const next: CoachState = { ...state, workouts };
  const stillActive = activeWorkouts(next);
  const exit = scope.kind === 'all' || (stillActive.length === 0 && unstarted.length === 0);
  // Move to a client still training; never auto-open an unstarted one (they may be a no-show).
  const activeClientId =
    state.activeClientId && next.workouts[state.activeClientId]?.phase === 'active'
      ? state.activeClientId
      : (stillActive[0]?.clientId ?? state.activeClientId);
  return { ...next, activeClientId, exitWhenSynced: next.exitWhenSynced || exit };
}

/**
 * `trainer.coach.sync` input for one finished workout: the normal session doc
 * plus the booking. Never a `loggedById` — the server sets it from the caller.
 */
export function buildSyncInput(
  clientId: string,
  doc: WorkoutSessionDoc,
  bookingId: string | null,
): CoachSyncInput {
  return { clientId, docs: [{ ...doc, bookingId }] };
}

/** Records a sync answer: applied/stale = saved; rejected or a thrown error keeps the doc for a retry. */
export function applySyncResult(
  state: CoachState,
  clientId: string,
  outcome: { result: SyncResultDto | undefined } | { error: string },
): CoachState {
  const entry = state.workouts[clientId];
  if (entry?.phase !== 'finished') return state;
  let next: CoachClientWorkout;
  if ('error' in outcome) {
    next = { ...entry, syncError: outcome.error };
  } else if (outcome.result?.status === 'applied' || outcome.result?.status === 'stale') {
    next = { ...entry, phase: 'synced', syncError: null };
  } else {
    next = { ...entry, syncError: outcome.result?.reason ?? 'The workout was not saved.' };
  }
  return { ...state, workouts: { ...state.workouts, [clientId]: next } };
}

/** Everything finished has synced and nothing is being logged. */
export function isAllSynced(state: CoachState): boolean {
  const all = Object.values(state.workouts).filter((w) => w.doc !== null);
  return all.length > 0 && all.every((w) => w.phase === 'synced');
}

// ─── Persistence (localStorage through the gym storage adapter) ──────────────
// The adapter already survives private mode / quota / blocked site data (memory
// fallback); parsing is guarded here so a corrupt entry starts clean.

const KEY_PREFIX = 'chefer.trainer-coach';

export function coachStorageKey(bookingId: string | null, clientId: string | null): string {
  return bookingId
    ? `${KEY_PREFIX}.booking.${bookingId}`
    : `${KEY_PREFIX}.client.${clientId ?? ''}`;
}

function isCoachState(value: unknown): value is CoachState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<CoachState>;
  return v.v === 1 && typeof v.workouts === 'object';
}

/** The saved state for this key and trainer, without no-routine placeholders (re-asked on load). */
export function loadCoachState(key: string, ownerId: string | null): CoachState | null {
  try {
    const stored = readJson(getStorage(), key);
    if (!isCoachState(stored)) return null;
    if (stored.ownerId && ownerId && stored.ownerId !== ownerId) return null;
    const workouts = Object.fromEntries(
      Object.entries(stored.workouts).filter(([, w]) => w.doc !== null),
    );
    return { ...stored, workouts };
  } catch {
    return null;
  }
}

export function saveCoachState(key: string, state: CoachState): void {
  try {
    getStorage().setItem(key, JSON.stringify(state));
  } catch {
    // Storage unavailable: the workout still lives in memory for this tab.
  }
}

export function clearCoachState(key: string): void {
  try {
    getStorage().removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
