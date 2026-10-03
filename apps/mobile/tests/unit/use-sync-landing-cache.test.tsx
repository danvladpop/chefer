import { renderHook } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  getCachedTrainingState,
  resetLandingCacheForTests,
} from '../../src/features/navigation/landing-cache';
import { useSyncLandingCache } from '../../src/features/navigation/use-landing';
import { makeBootstrap } from './gym-fixtures';

// UX-PO-10: the live gym bootstrap feeds the landing cache (training state).

let mockBootstrap: ReturnType<typeof makeBootstrap> | undefined;

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: { get: { useQuery: () => ({ data: { jobs: ['TRAIN'] } }) } },
    gym: { profile: { get: { useQuery: () => ({ data: {} }) } } },
  },
}));
jest.mock('../../src/features/gym/use-gym-bootstrap', () => ({
  useGymBootstrap: () => ({ data: mockBootstrap }),
}));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 28, 15, 0, 0) });
  setKvBackendForTests(createMemoryKvBackend());
  resetLandingCacheForTests();
  mockBootstrap = undefined;
});

afterEach(() => jest.useRealTimers());

describe('useSyncLandingCache — training state', () => {
  it('caches today as done once the bootstrap has a session completed today', async () => {
    mockBootstrap = makeBootstrap({
      recentSessions: [
        {
          id: 's1',
          name: 'Upper A',
          routineDayId: null,
          status: 'COMPLETED',
          localDate: '2026-09-28',
          startedAt: '2026-09-28T08:00:00.000Z',
          finishedAt: '2026-09-28T09:00:00.000Z',
          isDeload: false,
          exercises: [],
        },
      ],
    });
    await renderHook(() => useSyncLandingCache());
    expect(getCachedTrainingState('2026-09-28')).toMatchObject({ workoutDone: true });
  });

  it('writes nothing until a bootstrap exists', async () => {
    await renderHook(() => useSyncLandingCache());
    expect(getCachedTrainingState('2026-09-28')).toBeNull();
  });
});
