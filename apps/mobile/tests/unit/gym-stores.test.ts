import { QueryClient } from '@tanstack/react-query';
import type { GymBootstrap } from '@chefer/types';
import {
  getMode,
  resetModeForTests,
  setMode,
  shouldOpenGymHome,
} from '../../src/features/gym/mode-store';
import type { ActiveSessionRecord } from '../../src/features/gym/offline/active-session-store';
import { startCheckpointing } from '../../src/features/gym/offline/checkpoint';
import { localDate } from '../../src/features/gym/offline/ids';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import {
  createMemoryKvBackend,
  getKvBackend,
  setKvBackendForTests,
} from '../../src/features/gym/offline/kv';
import {
  getConfirmedGymOwner,
  getGymOwner,
  invalidateGymOwnerConfirmation,
  resetGymOwnerForTests,
  setGymOwner,
} from '../../src/features/gym/offline/owner';
import {
  GYM_CACHE_BUSTER,
  isGymQueryKey,
  shouldPersistQuery,
} from '../../src/features/gym/offline/query-persistence';
import {
  adjustRest,
  getRestTimer,
  resetRestTimerForTests,
  restRemainingSec,
  skipRest,
  startRest,
} from '../../src/features/gym/rest-timer';
import {
  gymBootstrapQueryKey,
  gymBootstrapQueryOptions,
  mergeBootstrap,
  reconcileWithPending,
  type BootstrapFetcher,
} from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeDoc, makeExercise } from './gym-fixtures';

jest.mock('@chefer/utils', () => ({
  ...jest.requireActual<object>('@chefer/utils'),
  applyFinishedSession: jest.fn(),
}));
jest.mock('expo-notifications', () => ({}));

const { applyFinishedSession } = jest.requireMock<{ applyFinishedSession: jest.Mock }>(
  '@chefer/utils',
);

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetModeForTests();
  resetGymOwnerForTests();
  resetRestTimerForTests();
  applyFinishedSession.mockReset();
});

describe('mode store', () => {
  it("defaults to 'food' and persists a switch across restarts", () => {
    expect(getMode()).toBe('food');
    setMode('gym');
    expect(getKvBackend().getItemSync(KV_KEYS.mode)).toBe('gym');

    resetModeForTests(); // "restart": the cache is gone, the KV store is not
    expect(getMode()).toBe('gym');
  });

  it('ignores a garbage stored value', () => {
    getKvBackend().setItemSync(KV_KEYS.mode, 'cardio');
    expect(getMode()).toBe('food');
  });

  it('opens Gym Today only for "/" in Gym mode', () => {
    expect(shouldOpenGymHome('/')).toBe(false);
    setMode('gym');
    expect(shouldOpenGymHome('/')).toBe(true);
    expect(shouldOpenGymHome('/meal-plan')).toBe(false);
  });
});

describe('gym owner', () => {
  it('persists the last owner but only confirms it per token', () => {
    expect(setGymOwner('a')).toEqual({ previous: null, changed: false });
    expect(getConfirmedGymOwner()).toBe('a');

    invalidateGymOwnerConfirmation(); // new token
    expect(getGymOwner()).toBe('a');
    expect(getConfirmedGymOwner()).toBeNull();

    expect(setGymOwner('b')).toEqual({ previous: 'a', changed: true });
    resetGymOwnerForTests();
    expect(getGymOwner()).toBe('b');
  });
});

describe('query persistence filter', () => {
  it('persists only successful gym.* tRPC queries', () => {
    expect(isGymQueryKey([['gym', 'bootstrap'], { type: 'query' }])).toBe(true);
    expect(isGymQueryKey([['dashboard', 'summary'], { type: 'query' }])).toBe(false);
    expect(isGymQueryKey(['gym-owner-check', 'abc'])).toBe(false);
    expect(
      shouldPersistQuery({ queryKey: gymBootstrapQueryKey, state: { status: 'success' } }),
    ).toBe(true);
    expect(shouldPersistQuery({ queryKey: gymBootstrapQueryKey, state: { status: 'error' } })).toBe(
      false,
    );
    expect(GYM_CACHE_BUSTER).toBe('1:1');
  });

  it('uses an input-free bootstrap key (a date in the key would miss the cache every morning)', () => {
    expect(gymBootstrapQueryKey).toEqual([['gym', 'bootstrap'], { type: 'query' }]);
  });
});

describe('bootstrap', () => {
  it('merges a librarySince delta into the cached library', () => {
    const prev = makeBootstrap({ libraryCursor: 'c1' });
    const edited = { ...makeExercise('bench', 'Bench press (edited)') };
    const next = makeBootstrap({
      library: [edited, makeExercise('my-curl')],
      libraryCursor: 'c2',
      serverTime: 'later',
    });

    const merged = mergeBootstrap(prev, next, true);
    expect(merged.library.map((e) => [e.id, e.name])).toEqual([
      ['bench', 'Bench press (edited)'],
      ['squat', 'squat'],
      ['my-curl', 'my-curl'],
    ]);
    expect(merged.libraryCursor).toBe('c2');
    expect(merged.serverTime).toBe('later');
  });

  it('takes a full response as-is when no delta was requested', () => {
    const next = makeBootstrap({ library: [makeExercise('only')] });
    expect(mergeBootstrap(makeBootstrap(), next, false)).toBe(next);
    expect(mergeBootstrap(undefined, next, true)).toBe(next);
  });

  it('queryFn sends the device date, then librarySince, and merges the delta', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    const fetcher = jest.fn<ReturnType<BootstrapFetcher>, Parameters<BootstrapFetcher>>();
    fetcher.mockResolvedValueOnce(makeBootstrap({ libraryCursor: 'c1' }));
    fetcher.mockResolvedValueOnce(
      makeBootstrap({ library: [makeExercise('new-one')], libraryCursor: 'c2' }),
    );
    const options = gymBootstrapQueryOptions(queryClient, fetcher);

    await queryClient.fetchQuery(options);
    expect(fetcher).toHaveBeenLastCalledWith({ today: localDate() });

    await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(fetcher).toHaveBeenLastCalledWith({ today: localDate(), librarySince: 'c1' });
    const cached = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
    expect(cached?.library.map((e) => e.id)).toEqual(['bench', 'squat', 'new-one']);
    queryClient.clear();
  });

  it('re-applies finished-but-unsent workouts on top of a server bootstrap', () => {
    const server = makeBootstrap({
      recentSessions: [
        {
          id: makeDoc(1).id,
          name: 'synced',
          routineDayId: null,
          status: 'COMPLETED',
          localDate: '2026-09-23',
          startedAt: '2026-09-23T08:00:00.000Z',
          finishedAt: '2026-09-23T09:00:00.000Z',
          isDeload: false,
          exercises: [],
        },
      ],
    });
    applyFinishedSession.mockImplementation(({ bootstrap }: { bootstrap: GymBootstrap }) => ({
      ...bootstrap,
      serverTime: `${bootstrap.serverTime}+`,
    }));

    const pending = [
      makeDoc(1), // already on the server → skipped
      makeDoc(3, { finishedAt: '2026-09-24T11:00:00.000Z' }),
      makeDoc(2, { finishedAt: '2026-09-24T10:00:00.000Z' }),
      makeDoc(4, { status: 'DISCARDED' }), // never folded
    ];
    const result = reconcileWithPending(server, pending, '2026-09-24');

    expect(
      applyFinishedSession.mock.calls.map(([arg]: [{ doc: { id: string } }]) => arg.doc.id),
    ).toEqual([makeDoc(2).id, makeDoc(3).id]);
    expect(result.serverTime).toBe(`${server.serverTime}++`);
  });

  it('keeps the server copy when the engine throws', () => {
    applyFinishedSession.mockImplementation(() => {
      throw new Error('engine not implemented');
    });
    const server = makeBootstrap();
    expect(reconcileWithPending(server, [makeDoc(9)], '2026-09-24')).toBe(server);
  });
});

describe('in-progress checkpoint', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function harness(online = true) {
    let record: ActiveSessionRecord | null = null;
    const listeners = new Set<() => void>();
    const send = jest.fn(() => Promise.resolve([]));
    const stop = startCheckpointing({
      getRecord: () => record,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      send,
      isOnline: () => online,
      getOwnerId: () => 'user-a',
    });
    const set = (next: ActiveSessionRecord | null) => {
      record = next;
      listeners.forEach((l) => l());
    };
    return { send, stop, set, goOnline: () => (online = true) };
  }

  const inProgress = (at: string) =>
    ({
      v: 1,
      ownerId: 'user-a',
      doc: makeDoc(1, { status: 'IN_PROGRESS', finishedAt: null, clientUpdatedAt: at }),
    }) as const;

  it('uploads the latest doc at most once per minute', async () => {
    const { send, stop, set } = harness();
    set(inProgress('t1'));
    set(inProgress('t2'));
    await jest.advanceTimersByTimeAsync(59_000);
    expect(send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([expect.objectContaining({ clientUpdatedAt: 't2' })]);

    // Nothing changed → nothing re-sent.
    await jest.advanceTimersByTimeAsync(120_000);
    expect(send).toHaveBeenCalledTimes(1);
    stop();
  });

  it('waits while offline and never checkpoints after the session ended', async () => {
    const { send, stop, set, goOnline } = harness(false);
    set(inProgress('t1'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(send).not.toHaveBeenCalled();
    goOnline();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);

    set(inProgress('t2'));
    set(null); // finished: cleared before the window elapsed
    await jest.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('rest timer', () => {
  it('starts from an absolute endsAt, adjusts ±15 s and survives a restart', () => {
    startRest(90, 'se-1', 1_000_000);
    expect(getRestTimer()).toEqual({ endsAt: 1_090_000, durationSec: 90, seId: 'se-1' });
    expect(restRemainingSec(getRestTimer(), 1_030_000)).toBe(60);

    adjustRest(15, 1_030_000);
    expect(getRestTimer()).toMatchObject({ endsAt: 1_105_000, durationSec: 105 });

    resetRestTimerForTests(); // app killed
    expect(getRestTimer()).toMatchObject({ endsAt: 1_105_000 });

    adjustRest(-15, 1_100_000); // would end in the past → rest over
    expect(getRestTimer()).toBeNull();
  });

  it('skip clears it', () => {
    startRest(60);
    skipRest();
    expect(getRestTimer()).toBeNull();
    expect(restRemainingSec(null)).toBe(0);
  });
});
