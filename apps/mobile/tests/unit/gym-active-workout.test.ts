import { QueryClient } from '@tanstack/react-query';
import type { NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { startSession, workoutReducer, type WorkoutAction } from '@chefer/utils';
import {
  activeSessionStore,
  createActiveSessionStore,
} from '../../src/features/gym/offline/active-session-store';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import {
  createMemoryKvBackend,
  getKvBackend,
  isKvPersistent,
  setKvBackendForTests,
} from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { getRestTimer, resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import {
  checkPausedWorkoutTimeout,
  discardWorkout,
  dispatchWorkout,
  finishWorkout,
  getResumableSession,
  reconcileActiveSession,
  resumeWorkout,
  saveForLater,
  startWorkout,
} from '../../src/features/gym/use-active-workout';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeDoc, uuid } from './gym-fixtures';

// The engine bodies are implemented in parallel (G1-A) — mock them here.
jest.mock('@chefer/utils', () => ({
  ...jest.requireActual<object>('@chefer/utils'),
  startSession: jest.fn(),
  workoutReducer: jest.fn(),
  applyFinishedSession: jest.fn(),
}));
jest.mock('expo-crypto', () => {
  let n = 100;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const utils = jest.requireMock<{
  applyFinishedSession: jest.Mock;
}>('@chefer/utils');
const mockedStartSession = jest.mocked(startSession);
const mockedReducer = jest.mocked(workoutReducer);

// gcTime Infinity: no GC timers left running after the test.
const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

const SE = uuid(50);
const WORK_SET = uuid(51);
const WARMUP_SET = uuid(52);

function sessionWithSets(): WorkoutSessionDoc {
  return makeDoc(7, {
    status: 'IN_PROGRESS',
    finishedAt: null,
    exercises: [
      {
        id: SE,
        exerciseId: 'bench',
        routineExerciseId: null,
        position: 0,
        repMin: 8,
        repMax: 12,
        targetRir: 2,
        restSec: 150,
        skipped: false,
        swappedFromId: null,
        lastSetRir: null,
        notes: null,
        prescription: {
          kind: 'start',
          weightKg: 60,
          reps: [10, 10, 10],
          sets: 3,
          reasonCode: 'START',
          inputs: {},
          deltaKg: 0,
          engineVersion: 1,
        },
        sets: [
          {
            id: WARMUP_SET,
            position: 0,
            weightKg: 30,
            reps: 8,
            isWarmup: true,
            completedAt: null,
          },
          { id: WORK_SET, position: 1, weightKg: 60, reps: 10, isWarmup: false, completedAt: null },
        ],
      },
    ],
  });
}

/** A tiny stand-in reducer: stamps clientUpdatedAt, handles finish/discard/completeSet. */
function fakeReducer(doc: WorkoutSessionDoc, action: WorkoutAction): WorkoutSessionDoc {
  const next = { ...doc, clientUpdatedAt: action.at };
  switch (action.type) {
    case 'finish':
      return {
        ...next,
        status: 'COMPLETED',
        finishedAt: action.at,
        ...(action.carryOverExerciseIds && action.carryOverExerciseIds.length > 0
          ? { carryOverExerciseIds: action.carryOverExerciseIds }
          : {}),
      };
    case 'discard':
      return { ...next, status: 'DISCARDED', finishedAt: action.at };
    case 'completeSet':
      return {
        ...next,
        exercises: next.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((s) => (s.id === action.setId ? { ...s, completedAt: action.at } : s)),
        })),
      };
    default:
      return next;
  }
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  // Module singletons re-read the fresh backend.
  resetGymOwnerForTests();
  resetRestTimerForTests();
  outbox.reload();
  outbox.configure(null);
  activeSessionStore.clear();
  mockedStartSession.mockReset().mockImplementation(() => sessionWithSets());
  mockedReducer.mockReset().mockImplementation(fakeReducer);
  utils.applyFinishedSession.mockReset();
  setGymOwner('user-a');
});

describe('KV store', () => {
  it('falls back to memory when native SQLite is unavailable (Jest)', () => {
    setKvBackendForTests(undefined);
    expect(isKvPersistent()).toBe(false);
    getKvBackend().setItemSync('k', 'v');
    expect(getKvBackend().getItemSync('k')).toBe('v');
  });
});

describe('active session store — crash safety', () => {
  it('a new store instance (killed + relaunched app) reads the identical doc', () => {
    const before = createActiveSessionStore();
    const doc = sessionWithSets();
    before.set(doc, 'user-a');

    const afterRelaunch = createActiveSessionStore();
    expect(afterRelaunch.get()).toEqual({ v: 1, ownerId: 'user-a', doc, pausedAt: null });
  });

  it('quarantines an unreadable payload instead of deleting it', () => {
    const memory = createMemoryKvBackend();
    const writes: [string, string][] = [];
    setKvBackendForTests({
      ...memory,
      setItemSync: (key, value) => {
        writes.push([key, value]);
        memory.setItemSync(key, value);
      },
    });
    const corrupt = '{"v":1,"doc":';
    memory.setItemSync(KV_KEYS.activeSession, corrupt);

    expect(createActiveSessionStore().get()).toBeNull();
    expect(memory.getItemSync(KV_KEYS.activeSession)).toBeNull();
    // The raw bytes survive under a quarantine key.
    expect(writes).toEqual([[expect.stringContaining(KV_KEYS.activeSessionQuarantine), corrupt]]);
  });

  it('clear() removes the doc from disk', () => {
    const store = createActiveSessionStore();
    store.set(sessionWithSets(), null);
    store.clear();
    expect(createActiveSessionStore().get()).toBeNull();
  });
});

describe('active workout', () => {
  const planned: NextWorkoutDto = {
    routineId: 'r1',
    dayId: 'd1',
    dayName: 'Upper A',
    isDeload: false,
    estimatedMin: 55,
    exercises: [],
  };

  it('start() builds the session with client ids + device date and persists it', () => {
    const doc = startWorkout({ kind: 'planned', workout: planned });
    const input = mockedStartSession.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      routineId: 'r1',
      routineDayId: 'd1',
      name: 'Upper A',
      isDeload: false,
    });
    expect(input?.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createActiveSessionStore().get()?.doc).toEqual(doc);
    expect(getResumableSession()).toEqual(doc);
  });

  it('start() never overwrites a workout in progress', () => {
    const first = startWorkout({ kind: 'freestyle' });
    mockedStartSession.mockImplementation(() => makeDoc(99, { status: 'IN_PROGRESS' }));
    expect(startWorkout({ kind: 'planned', workout: planned })).toEqual(first);
    expect(mockedStartSession).toHaveBeenCalledTimes(1);
  });

  it('dispatch() stamps `at`, persists every change, and starts rest only after a working set', () => {
    startWorkout({ kind: 'freestyle' });

    dispatchWorkout({ type: 'completeSet', seId: SE, setId: WARMUP_SET });
    expect(getRestTimer()).toBeNull();
    const [, action] = mockedReducer.mock.calls[0] ?? [];
    expect(action?.type).toBe('completeSet');
    expect(typeof action?.at).toBe('string');

    const before = Date.now();
    dispatchWorkout({ type: 'completeSet', seId: SE, setId: WORK_SET });
    const rest = getRestTimer();
    expect(rest).toMatchObject({ seId: SE, durationSec: 150 });
    expect(rest?.endsAt).toBeGreaterThanOrEqual(before + 150_000);

    // "Kill" the app: the persisted doc has the ticked set.
    const persisted = createActiveSessionStore().get()?.doc;
    const workSet = persisted?.exercises[0]?.sets.find((s) => s.id === WORK_SET);
    expect(workSet?.completedAt).not.toBeNull();
  });

  it('finish() enqueues first, folds into the cached bootstrap, then clears', async () => {
    const queryClient = testQueryClient();
    const bootstrap = makeBootstrap();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    const folded = makeBootstrap({ serverTime: 'folded' });
    utils.applyFinishedSession.mockReturnValue(folded);

    startWorkout({ kind: 'freestyle' });
    const finished = await finishWorkout(queryClient);

    expect(finished?.status).toBe('COMPLETED');
    expect(outbox.getState().entries.map((e) => [e.doc.id, e.doc.status, e.ownerId])).toEqual([
      [finished?.id, 'COMPLETED', 'user-a'],
    ]);
    expect(utils.applyFinishedSession).toHaveBeenCalledWith(
      expect.objectContaining({ bootstrap, doc: finished }),
    );
    expect(queryClient.getQueryData(gymBootstrapQueryKey)).toEqual(folded);
    expect(getResumableSession()).toBeNull();
    expect(createActiveSessionStore().get()).toBeNull();
    expect(getRestTimer()).toBeNull();
  });

  it('finish() still queues the workout when the engine throws', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    utils.applyFinishedSession.mockImplementation(() => {
      throw new Error('not implemented');
    });
    startWorkout({ kind: 'freestyle' });
    const finished = await finishWorkout(queryClient);
    expect(outbox.getState().entries[0]?.doc.id).toBe(finished?.id);
    expect(getResumableSession()).toBeNull();
  });

  it('discard() hands the DISCARDED doc to the outbox and clears', () => {
    startWorkout({ kind: 'freestyle' });
    const discarded = discardWorkout();
    expect(discarded?.status).toBe('DISCARDED');
    expect(outbox.getState().entries[0]?.doc.status).toBe('DISCARDED');
    expect(getResumableSession()).toBeNull();
  });

  it('reconcile: a finished doc already queued clears the stale active copy', () => {
    const doc = startWorkout({ kind: 'freestyle' });
    outbox.enqueue({ ...doc, status: 'COMPLETED' });
    reconcileActiveSession('user-a');
    expect(activeSessionStore.get()).toBeNull();
  });

  it("reconcile: another account's in-progress session moves to the outbox under its owner", () => {
    const doc = startWorkout({ kind: 'freestyle' });
    setGymOwner('user-b');
    expect(getResumableSession()).toBeNull(); // not offered to user-b
    reconcileActiveSession('user-b');
    expect(activeSessionStore.get()).toBeNull();
    const entry = outbox.getState().entries[0];
    expect(entry?.ownerId).toBe('user-a');
    expect(entry?.doc).toMatchObject({ id: doc.id, status: 'IN_PROGRESS' });
  });

  // Regression B-40: the rest-timer notification permission used to be
  // requested right here, cold, on every workout start.
  it('never requests the rest-timer notification permission at workout start (regression B-40)', () => {
    const notifications = jest.requireMock<{ requestPermissionsAsync: jest.Mock }>(
      'expo-notifications',
    );
    startWorkout({ kind: 'freestyle' });
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('finish(carryOverExerciseIds) moves the unstarted exercises to the next session (T-36.3)', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    utils.applyFinishedSession.mockReturnValue(makeBootstrap());

    startWorkout({ kind: 'freestyle' });
    const finished = await finishWorkout(queryClient, ['bench']);

    expect(finished).toMatchObject({ status: 'COMPLETED', carryOverExerciseIds: ['bench'] });
  });

  it('saveForLater() pauses the active session; resume() un-pauses it', () => {
    startWorkout({ kind: 'freestyle' });
    expect(activeSessionStore.get()?.pausedAt).toBeNull();

    saveForLater();
    expect(activeSessionStore.get()?.pausedAt).not.toBeNull();

    resumeWorkout();
    expect(activeSessionStore.get()?.pausedAt).toBeNull();
  });

  it('saveForLater() is a no-op with no active session', () => {
    expect(activeSessionStore.get()).toBeNull();
    saveForLater();
    expect(activeSessionStore.get()).toBeNull();
  });

  describe('checkPausedWorkoutTimeout (UX-36 (3))', () => {
    it('is a no-op with no active session, or an active-but-not-paused one', async () => {
      const queryClient = testQueryClient();
      expect(await checkPausedWorkoutTimeout(queryClient)).toBeNull();

      startWorkout({ kind: 'freestyle' });
      expect(await checkPausedWorkoutTimeout(queryClient)).toBeNull();
      expect(getResumableSession()).not.toBeNull(); // never finished
    });

    it('is a no-op while inside the 24 h window', async () => {
      const queryClient = testQueryClient();
      startWorkout({ kind: 'freestyle' });
      activeSessionStore.setPausedAt(new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString());

      expect(await checkPausedWorkoutTimeout(queryClient)).toBeNull();
      expect(getResumableSession()).not.toBeNull();
    });

    it('auto-finishes past 24 h, carrying over the unstarted exercise and naming it in the notice', async () => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
      utils.applyFinishedSession.mockReturnValue(makeBootstrap());
      // sessionWithSets(): one exercise (bench), never touched — 0 sets logged.
      const doc = startWorkout({ kind: 'freestyle' });
      activeSessionStore.setPausedAt(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString());

      const notice = await checkPausedWorkoutTimeout(queryClient);

      expect(notice).toEqual({ dayName: doc.name, workingSetsDone: 0 });
      expect(getResumableSession()).toBeNull(); // it finished
      const enqueued = outbox.getState().entries[0]?.doc;
      expect(enqueued?.status).toBe('COMPLETED');
      expect(enqueued?.carryOverExerciseIds).toEqual(['bench']); // never started
    });
  });
});
