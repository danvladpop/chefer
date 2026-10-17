import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymBootstrap, RoutineDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import TrainTab from '../../app/(main)/train';
import GymMyWeekRoute from '../../app/gym/my-week';
import GymSummaryScreen from '../../app/gym/summary/[id]';
import GymWorkoutScreen from '../../app/gym/workout';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { SetupStyleGate } from '../../src/features/gym/setup/setup-style-gate';
import { startWorkout } from '../../src/features/gym/use-active-workout';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, profile } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// "Keep it simple" (simple training mode §6, phase 1) on mobile: Train renders
// the simple Today (never "No active routine"), Start runs a typed live
// workout, the simple logger finishes with zero exercises into the simple
// summary, My week saves through saveMyWeek, and setup asks the style first.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require, see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => false),
    push: jest.fn(),
  },
  usePathname: () => '/train',
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual<typeof import('react')>('react');
    mockUseEffect(cb, [cb]);
  },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router, useLocalSearchParams } = jest.requireMock<{
  router: { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

// Mon 12 Oct 2026, local noon.
const NOW = new Date(2026, 9, 12, 12, 0, 0);

const MY_WEEK: RoutineDto = {
  id: 'r1',
  name: 'My week',
  templateKey: null,
  isActive: true,
  nextDayId: 'd1',
  version: 4,
  archived: false,
  updatedAt: '2026-10-01T00:00:00.000Z',
  days: [
    { id: 'd1', position: 0, name: 'Yoga', plannedWeekday: 0, workoutType: 'YOGA', exercises: [] },
    {
      id: 'd2',
      position: 1,
      name: 'Upper body',
      plannedWeekday: 2,
      workoutType: 'UPPER_BODY',
      exercises: [],
    },
    {
      id: 'd3',
      position: 2,
      name: 'Swim',
      plannedWeekday: null,
      workoutType: 'SWIMMING',
      exercises: [],
    },
  ],
};

const SIMPLE_PROFILE = { ...profile, trainingStyle: 'SIMPLE' as const };

function client(overrides: Partial<GymBootstrap> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({
      profile: SIMPLE_PROFILE,
      activeRoutine: MY_WEEK,
      bodyweightKg: 70,
      streak: { current: 2, best: 3, flexTokens: 0, thisWeekSessions: 1, thisWeekGoal: 3 },
      ...overrides,
    }),
  );
  return queryClient;
}

async function renderWith(queryClient: QueryClient, element: React.ReactElement) {
  const user = userEvent.setup();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        {element}
        <Snackbar />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return user;
}

function flagsOn(on: boolean) {
  trpc.profile.flags.useQuery.mockReturnValue({ data: on ? { simpleTraining: true } : undefined });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  // The kit Sheet reports onExited on Android when the Modal unmounts (iOS
  // waits for the native onDismiss the test renderer never sends).
  jest.replaceProperty(Platform, 'OS', 'android');
  setKvBackendForTests(createMemoryKvBackend());
  activeSessionStore.clear();
  resetGymOwnerForTests();
  resetSnackbarForTests();
  outbox.reload();
  flagsOn(true);
  useLocalSearchParams.mockReturnValue({});
  trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.dismissOffer.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.startDeload.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('simple Train', () => {
  it("shows today's My week workout and starts it as a typed live workout", async () => {
    const user = await renderWith(client(), <TrainTab />);
    expect(screen.getByTestId('simple-today')).toBeOnTheScreen();
    expect(screen.getByTestId('simple-week-title')).toHaveTextContent('This week · 1 of 3');
    expect(screen.getByTestId('simple-plan-title')).toHaveTextContent('Yoga');
    expect(screen.getByTestId('simple-my-week-link')).toHaveTextContent(/Mon · Yoga/);
    expect(screen.getByTestId('simple-shortcut-d3')).toHaveTextContent(/Swimming/);
    // No progression surfaces: no "Up next", no strength stats.
    expect(screen.queryByTestId('train-week')).toBeNull();
    expect(screen.queryByTestId('train-stats')).toBeNull();

    await user.press(screen.getByTestId('simple-plan-start'));
    const doc = activeSessionStore.get()?.doc;
    expect(doc).toMatchObject({ workoutType: 'YOGA', name: 'Yoga', routineDayId: 'd1' });
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('Skip turns the plan into "Start a workout" for today only', async () => {
    const user = await renderWith(client(), <TrainTab />);
    await user.press(screen.getByTestId('simple-plan-skip'));
    expect(screen.getByTestId('simple-plan-open')).toBeOnTheScreen();
    expect(screen.queryByTestId('simple-plan-card')).toBeNull();
  });

  it('never shows "No active routine": Start a workout picks a type and starts it', async () => {
    const user = await renderWith(client({ activeRoutine: null }), <TrainTab />);
    expect(screen.queryByTestId('train-empty-routine')).toBeNull();
    expect(screen.getByTestId('simple-plan-open')).toBeOnTheScreen();

    await user.press(screen.getByTestId('simple-start-workout'));
    await waitFor(() => expect(screen.getByTestId('simple-type-picker')).toBeOnTheScreen());
    await user.press(screen.getByTestId('simple-type-picker-chips-RUNNING'));
    await user.press(screen.getByTestId('simple-type-picker-confirm'));
    await waitFor(() =>
      expect(activeSessionStore.get()?.doc).toMatchObject({
        workoutType: 'RUNNING',
        name: 'Running',
        routineDayId: null,
      }),
    );
  });

  it('with the flag off a SIMPLE profile keeps "Track my progress"', async () => {
    flagsOn(false);
    await renderWith(client({ activeRoutine: null }), <TrainTab />);
    expect(screen.queryByTestId('simple-today')).toBeNull();
    expect(screen.getByTestId('train-empty-routine')).toBeOnTheScreen();
  });
});

describe('simple logger → summary', () => {
  it('finishes with zero exercises in one tap and shows the simple summary', async () => {
    const queryClient = client();
    startWorkout({ kind: 'simple', workoutType: 'YOGA', name: 'Yoga' });
    const user = await renderWith(queryClient, <GymWorkoutScreen />);
    expect(screen.getByTestId('simple-workout-title')).toHaveTextContent('Yoga');
    expect(screen.queryByTestId('workout-finish-bottom')).toBeNull();

    await user.press(screen.getByTestId('simple-workout-finish'));
    await waitFor(() => expect(outbox.getState().entries).toHaveLength(1));
    const finished = outbox.getState().entries[0]?.doc;
    expect(finished).toMatchObject({ status: 'COMPLETED', workoutType: 'YOGA', exercises: [] });
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/gym/summary/[id]',
      params: { id: finished?.id },
    });

    useLocalSearchParams.mockReturnValue({ id: finished?.id });
    await renderWith(queryClient, <GymSummaryScreen />);
    expect(screen.getByTestId('simple-summary-title')).toHaveTextContent('Nice work');
    expect(screen.getByTestId('simple-summary-line')).toHaveTextContent(/^Yoga · \d+ min$/);
  });
});

describe('My week', () => {
  it('edits a weekday through the type picker and saves with the routine version', async () => {
    const mutate = jest.fn();
    trpc.gym.routine.saveMyWeek.useMutation.mockImplementation(
      (opts: { onSuccess?: (r: unknown) => void }) => ({
        ...mutationResult(),
        mutate: (input: unknown) => {
          mutate(input);
          opts.onSuccess?.({ routine: MY_WEEK, weeklyGoal: 3 });
        },
      }),
    );
    const user = await renderWith(client(), <GymMyWeekRoute />);
    expect(screen.getByTestId('my-week-row-0')).toHaveTextContent(/Yoga/);
    expect(screen.getByTestId('my-week-row-1')).toHaveTextContent(/Rest/);
    expect(screen.getByTestId('my-week-goal-label')).toHaveTextContent('Weekly goal: 2 workouts');
    expect(screen.getByTestId('my-week-unscheduled-d3')).toBeOnTheScreen();

    await user.press(screen.getByTestId('my-week-row-1'));
    await waitFor(() => expect(screen.getByTestId('my-week-picker')).toBeOnTheScreen());
    await user.press(screen.getByTestId('my-week-picker-chips-PILATES'));
    await waitFor(() => expect(screen.getByTestId('my-week-row-1')).toHaveTextContent(/Pilates/));
    // The goal follows the planned days until it is touched.
    expect(screen.getByTestId('my-week-goal-label')).toHaveTextContent('Weekly goal: 3 workouts');

    await user.press(screen.getByTestId('my-week-save'));
    expect(mutate).toHaveBeenCalledWith({
      week: ['YOGA', 'PILATES', 'UPPER_BODY', null, null, null, null],
      expectedVersion: 4,
    });
    await waitFor(() => expect(screen.getByText('My week saved')).toBeOnTheScreen());
  });
});

describe('setup asks "How do you like to train?" first', () => {
  it('a simple answer completes simple setup and offers My week', async () => {
    const mutate = jest.fn();
    trpc.gym.profile.completeSimpleSetup.useMutation.mockImplementation(
      (opts: { onSuccess?: (b: unknown) => void }) => ({
        ...mutationResult(),
        mutate: (input: unknown) => {
          mutate(input);
          opts.onSuccess?.(makeBootstrap({ profile: SIMPLE_PROFILE }));
        },
      }),
    );
    const user = await renderWith(client({ profile: null }), <SetupStyleGate />);
    await user.press(screen.getByTestId('setup-style-classes'));
    await user.press(screen.getByTestId('setup-style-continue'));
    expect(mutate).toHaveBeenCalledWith({ unit: 'KG' });
    expect(screen.getByTestId('setup-simple-done')).toBeOnTheScreen();
    await user.press(screen.getByTestId('setup-plan-week'));
    expect(router.replace).toHaveBeenCalledWith('/gym/my-week');
  });
});
