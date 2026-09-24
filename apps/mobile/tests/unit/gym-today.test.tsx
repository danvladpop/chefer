import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymOffer, NextWorkoutDto, RoutineDto } from '@chefer/types';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { TodayScreen } from '../../src/features/gym/today/today-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeDoc } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// `TodayScreen` (imported above) transitively imports `../../src/lib/trpc`
// BEFORE this file's own `./gym-trpc-mock` import would run, so the factory
// can't reference an imported binding — it has to `require()` lazily, right
// when Jest first asks for the mocked module.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>(
  'expo-router',
);

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'My Routine',
  templateKey: 'fb3-beginner',
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
          supersetGroup: null,
          notes: null,
        },
      ],
    },
    { id: 'd2', position: 1, name: 'Lower A', plannedWeekday: 2, exercises: [] },
  ],
};

const NEXT_WORKOUT: NextWorkoutDto = {
  routineId: 'r1',
  dayId: 'd1',
  dayName: 'Upper A',
  isDeload: false,
  estimatedMin: 45,
  exercises: [
    {
      routineExerciseId: 're1',
      exerciseId: 'bench',
      position: 0,
      sets: 3,
      repMin: 8,
      repMax: 12,
      targetRir: 2,
      restSec: 120,
      supersetGroup: null,
      notes: null,
      repBucket: '8-12',
      suggestion: {
        kind: 'start',
        weightKg: 60,
        reps: [10, 10, 10],
        sets: 3,
        reasonCode: 'START',
        inputs: {},
        deltaKg: 0,
        engineVersion: 1,
      },
      warmups: [],
      lastTime: null,
    },
  ],
};

function renderToday(queryClient: QueryClient) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <TodayScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  activeSessionStore.clear();
  resetGymOwnerForTests();
  outbox.reload();
  trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.dismissOffer.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.startDeload.useMutation.mockReturnValue(mutationResult());
});

describe('TodayScreen', () => {
  it('shows the next-up card and starts the planned workout', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: ROUTINE,
        nextWorkout: NEXT_WORKOUT,
        streak: { current: 2, best: 3, flexTokens: 1, thisWeekSessions: 1, thisWeekGoal: 3 },
      }),
    );
    await renderToday(queryClient);

    expect(screen.getByTestId('gym-today-next-up')).toBeOnTheScreen();
    expect(screen.getByText('Upper A')).toBeOnTheScreen();
    expect(screen.getByText('bench')).toBeOnTheScreen();

    await user.press(screen.getByTestId('gym-today-start'));
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('shows a resume banner when a session is already in progress', async () => {
    activeSessionStore.set(makeDoc(1, { status: 'IN_PROGRESS', name: 'Upper A' }), null);
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
    );
    const user = userEvent.setup();
    await renderToday(queryClient);

    expect(screen.getByTestId('gym-today-resume')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-today-resume-button'));
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('shows the rest-week empty state when there is nothing scheduled', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: null }),
    );
    await renderToday(queryClient);

    expect(screen.getByTestId('gym-today-restweek')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-today-next-up')).not.toBeOnTheScreen();
  });

  it('shows only the highest-priority offer: comeback beats deload, stall and recap', async () => {
    const offers: GymOffer[] = [
      { kind: 'recap', key: 'recap-1', title: 'Monthly recap', body: 'body' },
      { kind: 'stall', key: 'stall-1', title: 'Stall suggestion', body: 'body' },
      { kind: 'deload', key: 'deload-1', title: 'Take a deload', body: 'body' },
      { kind: 'comeback', key: 'comeback-1', title: 'Back at it', body: 'body' },
    ];
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT, offers }),
    );
    await renderToday(queryClient);

    expect(screen.getByText('Back at it')).toBeOnTheScreen();
    expect(screen.queryByText('Take a deload')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('gym-today-offer-accept')).not.toBeOnTheScreen();
  });

  it('shows the deload offer with an accept action when nothing outranks it', async () => {
    const offers: GymOffer[] = [
      { kind: 'recap', key: 'recap-1', title: 'Monthly recap', body: 'body' },
      { kind: 'deload', key: 'deload-1', title: 'Take a deload', body: 'body' },
    ];
    const startDeload = jest.fn();
    trpc.gym.progression.startDeload.useMutation.mockReturnValue(
      mutationResult({ mutate: startDeload }),
    );
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT, offers }),
    );
    const user = userEvent.setup();
    await renderToday(queryClient);

    expect(screen.getByText('Take a deload')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-today-offer-accept'));
    expect(startDeload).toHaveBeenCalled();
  });

  it('shows the setup empty state when there is no gym profile yet', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
    await renderToday(queryClient);

    expect(screen.getByTestId('gym-today-empty-setup')).toBeOnTheScreen();
    // gym-today-title is a stable anchor other flows rely on even in this state.
    expect(screen.getByTestId('gym-today-title')).toBeOnTheScreen();
  });

  it('offline day picker builds the chosen day locally and starts it', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
    );
    const user = userEvent.setup();
    await renderToday(queryClient);

    await user.press(screen.getByTestId('gym-today-pick-day'));
    await waitFor(() => expect(screen.getByTestId('gym-today-day-d2')).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-today-day-d2'));

    expect(router.push).toHaveBeenCalledWith('/gym/workout');
    jest.restoreAllMocks();
  });
});
