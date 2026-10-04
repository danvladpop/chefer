import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { RoutineDto } from '@chefer/types';
import RoutineScreen from '../../app/(gym)/routine';
import { isRoutineChangeUnseen } from '../../src/features/coaching/seen-markers';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// WP-18 lane D: opening the Routine tab is what makes Today's "Ana updated your routine" line go away
// (device-local marker, spec §2.6).

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-routine-supersets.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: () => '/routine',
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
const AT = '2026-10-02T09:00:00.000Z';

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'My Routine',
  templateKey: null,
  isActive: true,
  nextDayId: 'd1',
  version: 1,
  archived: false,
  updatedAt: AT,
  days: [{ id: 'd1', position: 0, name: 'Upper A', plannedWeekday: 0, exercises: [] }],
};

// A variable (not a literal) so the extra `routine.save` path passes the mock's shape check.
const utilsFake = {
  client: { gym: { routine: { save: { mutate: jest.fn() } }, bootstrap: { query: jest.fn() } } },
  preferences: { get: { invalidate: jest.fn() } },
  training: { getDayKinds: { setData: jest.fn() } },
  gym: { bootstrap: { invalidate: jest.fn() }, session: { list: { fetch: jest.fn() } } },
};

function renderRoutine(routine: RoutineDto) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ activeRoutine: routine }));
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <RoutineScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  trpc.gym.progression.setOverride.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.clearOverride.useMutation.mockReturnValue(mutationResult());
  trpc.useUtils.mockReturnValue(utilsFake);
});

describe('Routine tab marks the trainer’s change as seen', () => {
  it('opening it hides the change until the trainer changes the routine again', async () => {
    expect(isRoutineChangeUnseen('r1', AT)).toBe(true);
    await renderRoutine({ ...ROUTINE, lastEditedByOther: { name: 'Ana', at: AT } });
    expect(isRoutineChangeUnseen('r1', AT)).toBe(false);
    expect(isRoutineChangeUnseen('r1', '2026-10-03T08:00:00.000Z')).toBe(true);
  });

  it('a routine nobody else changed records nothing', async () => {
    await renderRoutine(ROUTINE);
    expect(isRoutineChangeUnseen('r1', AT)).toBe(true);
  });
});
