import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { RoutineDto } from '@chefer/types';
import RoutineScreen from '../../app/(gym)/routine';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// `RoutineScreen` (imported above) transitively imports `../../src/lib/trpc`
// BEFORE this file's own `./gym-trpc-mock` import would run — see
// gym-today.test.tsx for why the factory has to `require()` lazily.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'My Routine',
  templateKey: null,
  isActive: true,
  nextDayId: 'd1',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T00:00:00.000Z',
  days: [
    {
      id: 'd1',
      position: 0,
      name: 'Upper A',
      plannedWeekday: 0,
      exercises: [
        {
          id: 're1',
          exerciseId: 'bench',
          position: 0,
          sets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSec: 120,
          supersetGroup: 'A',
          notes: null,
        },
        {
          id: 're2',
          exerciseId: 'squat',
          position: 1,
          sets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSec: 90,
          supersetGroup: 'A',
          notes: null,
        },
        {
          id: 're3',
          exerciseId: 'row',
          position: 2,
          sets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSec: 60,
          supersetGroup: null,
          notes: null,
        },
      ],
    },
  ],
};

function renderRoutine(queryClient: QueryClient) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <RoutineScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  trpc.gym.progression.setOverride.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.clearOverride.useMutation.mockReturnValue(mutationResult());
});

describe('RoutineScreen — supersets', () => {
  it('brackets adjacent superset exercises with a chip and a "Superset A" heading', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ activeRoutine: ROUTINE }));
    await renderRoutine(queryClient);

    expect(screen.getByTestId('routine-day-d1-superset-A')).toHaveTextContent(
      'Superset A90 s rest after each round',
    );
    expect(screen.getByTestId('routine-exercise-re1-superset')).toHaveTextContent('A1');
    expect(screen.getByTestId('routine-exercise-re2-superset')).toHaveTextContent('A2');
    expect(screen.queryByTestId('routine-exercise-re3-superset')).toBeNull();
  });
});
