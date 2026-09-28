import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymOffer, NextWorkoutDto, RoutineDto, SessionSummaryDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { addDaysLocal, weekdayOf } from '@chefer/utils';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { localDate } from '../../src/features/gym/offline/ids';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { localInstant } from '../../src/features/gym/reminders/schedule';
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
  usePathname: () => '/today',
  // Focus effects run like plain effects in a test render (matches
  // gym-workout.test.tsx's mock — Today also uses useFocusEffect now, T-36.3).
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual<typeof import('react')>('react');
    mockUseEffect(cb, [cb]);
  },
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
        <Snackbar />
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
  resetSnackbarForTests();
  outbox.reload();
  trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.dismissOffer.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.startDeload.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
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

  it('brackets adjacent superset exercises in "Next up" with a chip and heading', async () => {
    const queryClient = makeClient();
    const [bench] = NEXT_WORKOUT.exercises;
    if (!bench) throw new Error('expected a fixture exercise');
    const supersetWorkout: NextWorkoutDto = {
      ...NEXT_WORKOUT,
      exercises: [
        { ...bench, supersetGroup: 'A' },
        {
          ...bench,
          routineExerciseId: 're2',
          exerciseId: 'squat',
          position: 1,
          supersetGroup: 'A',
        },
      ],
    };
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: supersetWorkout }),
    );
    await renderToday(queryClient);

    expect(screen.getByTestId('gym-today-next-up-superset-A')).toHaveTextContent(
      'Superset A120 s rest after each round',
    );
    expect(screen.getByTestId('gym-today-next-up-re1-superset')).toHaveTextContent('A1');
    expect(screen.getByTestId('gym-today-next-up-re2-superset')).toHaveTextContent('A2');
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

  describe('Skip this day (bug B-45)', () => {
    it('shows a snackbar naming both days, and Undo reverts to the skipped day', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn(
        (_input: { routineId: string; dayId: string }, opts?: { onSuccess?: () => void }) => {
          opts?.onSuccess?.();
        },
      );
      trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-skip'));
      expect(mutate).toHaveBeenCalledWith({ routineId: 'r1', dayId: 'd2' }, expect.anything());
      expect(screen.getByTestId('snackbar-message')).toHaveTextContent(
        'Skipped Upper A · Next: Lower A',
      );

      await user.press(screen.getByTestId('snackbar-action'));
      expect(mutate).toHaveBeenLastCalledWith({ routineId: 'r1', dayId: 'd1' });
    });

    it("Undo is a no-op offline (the day can't be un-skipped without a connection)", async () => {
      const user = userEvent.setup();
      const mutate = jest.fn(
        (_input: { routineId: string; dayId: string }, opts?: { onSuccess?: () => void }) => {
          opts?.onSuccess?.();
        },
      );
      trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-skip'));
      mutate.mockClear();
      jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);

      await user.press(screen.getByTestId('snackbar-action'));
      expect(mutate).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });

  describe('paused state (T-36.4)', () => {
    it('shows a paused card instead of the next-up card, and End pause resumes training', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({
          activeRoutine: ROUTINE,
          nextWorkout: NEXT_WORKOUT,
          activePause: {
            id: 'pause-1',
            startDate: '2026-09-20',
            endDate: '2026-10-04',
            reason: 'vacation',
          },
        }),
      );
      await renderToday(queryClient);

      expect(screen.getByTestId('gym-today-paused')).toBeOnTheScreen();
      expect(screen.getByTestId('gym-today-paused')).toHaveTextContent(/2026-10-04/);
      expect(screen.getByTestId('gym-today-paused')).toHaveTextContent(/vacation/);
      expect(screen.queryByTestId('gym-today-next-up')).not.toBeOnTheScreen();

      await user.press(screen.getByTestId('gym-today-end-pause'));
      expect(mutate).toHaveBeenCalledWith({ id: 'pause-1' });
    });
  });

  describe('Log a past workout (gym_plan.md §1.4 "Repair")', () => {
    it('picking a date then a routine day starts a session backdated to that date', async () => {
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      const user = userEvent.setup();
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-log-past'));
      const yesterday = addDaysLocal(localDate(), -1);
      await waitFor(() =>
        expect(screen.getByTestId(`gym-today-backfill-date-${yesterday}`)).toBeOnTheScreen(),
      );
      await user.press(screen.getByTestId(`gym-today-backfill-date-${yesterday}`));

      await waitFor(() =>
        expect(screen.getByTestId('gym-today-backfill-day-d2')).toBeOnTheScreen(),
      );
      await user.press(screen.getByTestId('gym-today-backfill-day-d2'));

      expect(router.push).toHaveBeenCalledWith('/gym/workout');
      const started = activeSessionStore.get();
      expect(started?.doc.localDate).toBe(yesterday);
      expect(started?.doc.startedAt).toBe(localInstant(yesterday, '18:00'));
      expect(started?.doc.routineDayId).toBe('d2');
    });

    it('the freestyle option starts a backdated freestyle session', async () => {
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      const user = userEvent.setup();
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-log-past'));
      const yesterday = addDaysLocal(localDate(), -1);
      await waitFor(() =>
        expect(screen.getByTestId(`gym-today-backfill-date-${yesterday}`)).toBeOnTheScreen(),
      );
      await user.press(screen.getByTestId(`gym-today-backfill-date-${yesterday}`));

      await waitFor(() =>
        expect(screen.getByTestId('gym-today-backfill-freestyle')).toBeOnTheScreen(),
      );
      await user.press(screen.getByTestId('gym-today-backfill-freestyle'));

      expect(router.push).toHaveBeenCalledWith('/gym/workout');
      const started = activeSessionStore.get();
      expect(started?.doc.localDate).toBe(yesterday);
      expect(started?.doc.routineId).toBeNull();
    });

    it('never offers a future date', async () => {
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      const user = userEvent.setup();
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-log-past'));
      const today = localDate();
      const tomorrow = addDaysLocal(today, 1);
      await waitFor(() =>
        expect(screen.getByTestId('gym-today-backfill-date-picker')).toBeOnTheScreen(),
      );
      expect(screen.queryByTestId(`gym-today-backfill-date-${today}`)).not.toBeOnTheScreen();
      expect(screen.queryByTestId(`gym-today-backfill-date-${tomorrow}`)).not.toBeOnTheScreen();
    });
  });

  describe('done / rest states (bug B-15)', () => {
    function todaySession(overrides: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
      const today = localDate();
      return {
        id: 'done-session',
        name: 'Upper A',
        routineDayId: 'd1',
        status: 'COMPLETED',
        localDate: today,
        startedAt: `${today}T18:00:00.000Z`,
        finishedAt: `${today}T18:52:00.000Z`,
        isDeload: false,
        exercises: [
          {
            exerciseId: 'bench',
            skipped: false,
            lastSetRir: 2,
            sets: [{ weightKg: 60, reps: 10, isWarmup: false, completed: true }],
          },
        ],
        ...overrides,
      };
    }

    it('shows "Done today" (no Start) once a session finished today, even on a training weekday', async () => {
      const user = userEvent.setup();
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({
          activeRoutine: ROUTINE,
          nextWorkout: NEXT_WORKOUT,
          recentSessions: [todaySession()],
        }),
      );
      await renderToday(queryClient);

      expect(screen.getByTestId('gym-today-done')).toBeOnTheScreen();
      expect(screen.queryByTestId('gym-today-next-up')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('gym-today-start')).not.toBeOnTheScreen();
      expect(screen.getByTestId('gym-today-done')).toHaveTextContent(/Upper A · 52 min · 1 sets/);
      expect(screen.getByTestId('gym-today-done-next')).toHaveTextContent(/Upper A/);

      await user.press(screen.getByTestId('gym-today-done-summary'));
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/gym/summary/[id]',
        params: { id: 'done-session' },
      });

      await user.press(screen.getByTestId('gym-today-done-pick-day'));
      await waitFor(() => expect(screen.getByTestId('gym-today-day-picker')).toBeOnTheScreen());
    });

    it('shows "Rest day" with "Start {day} anyway" when nothing is done and the next day is due a different weekday', async () => {
      const user = userEvent.setup();
      const restDayWeekday = (weekdayOf(localDate()) + 1) % 7;
      const restRoutine: RoutineDto = {
        ...ROUTINE,
        days: ROUTINE.days.map((d) =>
          d.id === 'd1' ? { ...d, plannedWeekday: restDayWeekday } : d,
        ),
      };
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({
          activeRoutine: restRoutine,
          nextWorkout: NEXT_WORKOUT,
          recentSessions: [],
        }),
      );
      await renderToday(queryClient);

      expect(screen.getByTestId('gym-today-rest')).toBeOnTheScreen();
      expect(screen.getByTestId('gym-today-rest')).toHaveTextContent(/Rest day/);
      expect(screen.queryByTestId('gym-today-next-up')).not.toBeOnTheScreen();

      await user.press(screen.getByTestId('gym-today-rest-start-anyway'));
      expect(router.push).toHaveBeenCalledWith('/gym/workout');
    });
  });

  describe('How this works (T-36.4 remainder)', () => {
    it('opens the kind-mechanics ExplainSheet from the week card', async () => {
      const user = userEvent.setup();
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      expect(screen.queryByTestId('gym-how-this-works')).not.toBeOnTheScreen();
      await user.press(screen.getByTestId('gym-today-how-this-works'));
      expect(screen.getByTestId('gym-how-this-works')).toBeOnTheScreen();
      expect(screen.getByTestId('gym-how-this-works')).toHaveTextContent(/Weeks, not days/);
      expect(screen.getByTestId('gym-how-this-works')).toHaveTextContent(/Half sessions count/);
    });
  });

  // Only meaningful once at least one weekday has already passed this week
  // (Monday itself can never have a "missed" day yet — session.test.ts covers
  // the pure function's Monday edge case directly).
  const todayWeekday = weekdayOf(localDate());
  (todayWeekday === 0 ? describe.skip : describe)('Still time this week (T-04.8, UX-04 §7)', () => {
    // A day pinned to yesterday's weekday is always "earlier this week" here.
    const missedWeekday = todayWeekday - 1;
    const missedRoutine: RoutineDto = {
      ...ROUTINE,
      days: ROUTINE.days.map((d) => (d.id === 'd1' ? { ...d, plannedWeekday: missedWeekday } : d)),
    };

    it('offers to move the missed day into the rotation', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: missedRoutine, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      expect(screen.getByTestId('gym-today-missed')).toHaveTextContent(/Upper A/);
      await user.press(screen.getByTestId('gym-today-missed-primary'));
      expect(mutate).toHaveBeenCalledWith({ routineId: 'r1', dayId: 'd1' }, expect.anything());
    });

    it('"Not this week" dismisses it with a no-nagging snackbar and never a mutation', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: missedRoutine, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-missed-dismiss'));
      expect(mutate).not.toHaveBeenCalled();
      expect(screen.getByTestId('snackbar-message')).toHaveTextContent(
        'No problem — missing a session changes nothing.',
      );
      expect(screen.queryByTestId('gym-today-missed')).not.toBeOnTheScreen();
    });

    it('never shows while training is paused', async () => {
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({
          activeRoutine: missedRoutine,
          nextWorkout: NEXT_WORKOUT,
          activePause: { id: 'p1', startDate: localDate(), endDate: localDate(), reason: null },
        }),
      );
      await renderToday(queryClient);
      expect(screen.queryByTestId('gym-today-missed')).not.toBeOnTheScreen();
    });
  });
});
