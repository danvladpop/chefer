import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { GymOffer, NextWorkoutDto, RoutineDto, SessionSummaryDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { weekdayOf } from '@chefer/utils';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { localDate } from '../../src/features/gym/offline/ids';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { TodayScreen } from '../../src/features/gym/today/today-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { describeValidationIssues } from '../../src/features/gym/validation-copy';
import { makeBootstrap, makeDoc } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';
import { activeDoc } from './gym-workout-helpers';

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

// Pinned clock: the fixtures assume a Monday (`d1.plannedWeekday: 0`), while the
// screen reads the real clock, so an unpinned suite rots as the calendar moves.
// Local noon on Mon 28 Sep 2026 keeps the pinned day stable in every timezone.
// `advanceTimers` keeps react-query, animations and `setTimeout` working.
const NOW = new Date(2026, 8, 28, 12, 0, 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
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

afterEach(() => jest.useRealTimers());

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

  // WP-04 (feedback 1): the busy-hands primaries are the large (48 pt) button,
  // and a long exercise name wraps to two lines instead of truncating.
  it('Start workout and Freestyle use the lg button; exercise names wrap to 2 lines', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
    );
    await renderToday(queryClient);

    // The lg size is the only one whose label steps up to text-base.
    const start = within(screen.getByTestId('gym-today-start')).getByText('Start workout');
    const freestyle = within(screen.getByTestId('gym-today-freestyle')).getByText(
      'Freestyle workout',
    );
    expect(String(start.props.className)).toContain('text-base');
    expect(String(freestyle.props.className)).toContain('text-base');
    const [bench] = NEXT_WORKOUT.exercises;
    if (!bench) throw new Error('expected a fixture exercise');
    const name = screen.getByTestId(`gym-today-next-up-${bench.routineExerciseId}-name`);
    expect(within(name).getByText('bench').props.numberOfLines).toBe(2);
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

  it('online day picker starts the chosen day too, without touching the rotation', async () => {
    const mutate = jest.fn();
    trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
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

    expect(mutate).not.toHaveBeenCalled();
    expect(activeSessionStore.get()?.doc.name).toBe('Lower A');
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('the day picker offers freestyle', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
    );
    const user = userEvent.setup();
    await renderToday(queryClient);

    await user.press(screen.getByTestId('gym-today-pick-day'));
    await waitFor(() => expect(screen.getByTestId('gym-today-day-freestyle')).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-today-day-freestyle'));

    expect(activeSessionStore.get()?.doc.routineDayId).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
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
      // UX-GYM-16: a human date and a reason label — never "2026-10-04" / "vacation".
      expect(screen.getByTestId('gym-today-paused')).toHaveTextContent(
        /Paused through Sun 4 Oct · Vacation/,
      );
      expect(screen.getByTestId('gym-today-paused')).not.toHaveTextContent(/2026-10-04|Resumes/);
      expect(screen.queryByTestId('gym-today-next-up')).not.toBeOnTheScreen();

      await user.press(screen.getByTestId('gym-today-end-pause'));
      expect(mutate).toHaveBeenCalledWith({ id: 'pause-1' });
    });
  });

  describe('Log a past workout (gym_plan.md §1.4 "Repair", owner dogfood 2026-09-30)', () => {
    // The sheet reports "fully gone" through Modal.onDismiss on iOS, which the
    // test renderer never fires; Android's path (Modal unmounted) is observable.
    let platform: jest.ReplaceProperty<typeof Platform.OS>;
    beforeEach(() => {
      platform = jest.replaceProperty(Platform, 'OS', 'android');
    });
    afterEach(() => platform.restore());

    async function openLogSheet() {
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
      );
      const user = userEvent.setup();
      await renderToday(queryClient);
      await user.press(screen.getByTestId('gym-today-log-past'));
      await waitFor(() =>
        expect(screen.getByTestId('gym-today-backfill-day-picker')).toBeOnTheScreen(),
      );
      return user;
    }

    it('one sheet: picking a routine day opens log mode for it — no live workout starts', async () => {
      const user = await openLogSheet();
      // No second (date) sheet: the day is set on the log screen.
      expect(screen.queryByTestId(`gym-today-backfill-date-${localDate()}`)).toBeNull();
      await user.press(screen.getByTestId('gym-today-backfill-day-d2'));

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith({
          pathname: '/gym/workout',
          params: { log: localDate(), day: 'd2' },
        }),
      );
      expect(activeSessionStore.get()).toBeNull();
    });

    it('freestyle opens an empty log', async () => {
      const user = await openLogSheet();
      await user.press(screen.getByTestId('gym-today-backfill-freestyle'));

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith({
          pathname: '/gym/workout',
          params: { log: localDate() },
        }),
      );
      expect(activeSessionStore.get()).toBeNull();
    });

    it('closing the sheet navigates nowhere', async () => {
      const user = await openLogSheet();
      await user.press(screen.getByTestId('gym-today-backfill-day-picker-close'));
      await waitFor(() =>
        expect(screen.queryByTestId('gym-today-backfill-day-picker')).not.toBeOnTheScreen(),
      );
      expect(router.push).not.toHaveBeenCalled();
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

    it('a rest day still lets you pick another day or freestyle (owner dogfood 2026-09-29)', async () => {
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
        makeBootstrap({ activeRoutine: restRoutine, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      await user.press(screen.getByTestId('gym-today-rest-pick-day'));
      await waitFor(() => expect(screen.getByTestId('gym-today-day-d2')).toBeOnTheScreen());
      expect(screen.getByTestId('gym-today-day-freestyle')).toBeOnTheScreen();
      await user.press(screen.getByTestId('gym-today-day-d2'));

      expect(activeSessionStore.get()?.doc.name).toBe('Lower A');
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
  // the pure function's Monday edge case directly), so this block pins the
  // clock to a Wednesday instead of the suite-wide Monday.
  describe('Still time this week (T-04.8, UX-04 §7)', () => {
    beforeEach(() => {
      jest.setSystemTime(new Date(2026, 8, 30, 12, 0, 0)); // Wed 30 Sep 2026, local noon
    });

    // A day pinned to yesterday's weekday (Tuesday) is always "earlier this week" here.
    const missedWeekday = 1;
    const missedRoutine: RoutineDto = {
      ...ROUTINE,
      days: ROUTINE.days.map((d) => (d.id === 'd1' ? { ...d, plannedWeekday: missedWeekday } : d)),
    };

    // The rotation has moved past the missed Upper A (e.g. Lower A was done
    // instead), so Lower A is next and Upper A is still owed this week.
    const LOWER_NEXT: NextWorkoutDto = {
      ...NEXT_WORKOUT,
      dayId: 'd2',
      dayName: 'Lower A',
      exercises: [],
    };

    it('when the missed day is already next, the main card offers it for today instead', async () => {
      // Owner dogfood 2026-09-29: "Move it to Wednesday" was a setNextDay to
      // the day that was already next — a silent no-op — while the main card
      // said "Rest day" and pointed at next week.
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: missedRoutine, nextWorkout: NEXT_WORKOUT }),
      );
      await renderToday(queryClient);

      expect(screen.queryByTestId('gym-today-missed')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('gym-today-rest')).not.toBeOnTheScreen();
      expect(screen.getByTestId('gym-today-next-up')).toHaveTextContent(/Upper A/);
      expect(screen.getByTestId('gym-today-overdue')).toHaveTextContent(/Planned for/);
    });

    it('"Do it today" starts the missed day', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: missedRoutine, nextWorkout: LOWER_NEXT }),
      );
      await renderToday(queryClient);

      expect(screen.getByTestId('gym-today-missed')).toHaveTextContent(/Upper A/);
      expect(screen.getByTestId('gym-today-missed-primary')).toHaveTextContent('Do it today');
      await user.press(screen.getByTestId('gym-today-missed-primary'));
      expect(mutate).not.toHaveBeenCalled();
      expect(activeSessionStore.get()?.doc.name).toBe('Upper A');
      expect(router.push).toHaveBeenCalledWith('/gym/workout');
    });

    it('after training today, "Make it next" queues the missed day with feedback', async () => {
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
        makeBootstrap({
          activeRoutine: missedRoutine,
          nextWorkout: LOWER_NEXT,
          recentSessions: [
            {
              id: 'today-lower',
              name: 'Lower A',
              routineDayId: 'd2',
              status: 'COMPLETED',
              localDate: localDate(),
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              isDeload: false,
              exercises: [],
            },
          ],
        }),
      );
      await renderToday(queryClient);

      expect(screen.getByTestId('gym-today-missed-primary')).toHaveTextContent('Make it next');
      await user.press(screen.getByTestId('gym-today-missed-primary'));
      expect(mutate).toHaveBeenCalledWith({ routineId: 'r1', dayId: 'd1' }, expect.anything());
      expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Upper A is up next.');
    });

    it('"Not this week" dismisses it with a no-nagging snackbar and never a mutation', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult({ mutate }));
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ activeRoutine: missedRoutine, nextWorkout: LOWER_NEXT }),
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
          nextWorkout: LOWER_NEXT,
          activePause: { id: 'p1', startDate: localDate(), endDate: localDate(), reason: null },
        }),
      );
      await renderToday(queryClient);
      expect(screen.queryByTestId('gym-today-missed')).not.toBeOnTheScreen();
    });
  });
});

// UX-GYM-02: a start tap used to land silently in the OTHER in-progress workout.
describe('TodayScreen — starting while another workout is in progress (UX-GYM-02)', () => {
  function seedActiveWithLoggedSet() {
    const doc = activeDoc();
    const [first] = doc.exercises;
    if (!first) throw new Error('expected an exercise');
    const logged = {
      ...doc,
      name: 'Lower A',
      exercises: [
        {
          ...first,
          sets: first.sets.map((set, i) =>
            i === 1 ? { ...set, completedAt: new Date().toISOString() } : set,
          ),
        },
      ],
    };
    activeSessionStore.set(logged, null);
    return logged;
  }

  function seedBootstrap() {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
    );
    return queryClient;
  }

  it('Start asks Resume / Finish & start / Discard & start instead of reopening the old workout', async () => {
    const logged = seedActiveWithLoggedSet();
    const user = userEvent.setup();
    await renderToday(seedBootstrap());

    await user.press(screen.getByTestId('gym-today-start'));

    expect(screen.getByTestId('gym-start-conflict-body')).toHaveTextContent(
      /You have 1 set logged in Lower A/,
    );
    expect(screen.getByTestId('gym-start-conflict-body')).toHaveTextContent(/start Upper A/);
    expect(screen.getByTestId('gym-start-conflict-resume')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-start-conflict-finish')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-start-conflict-discard')).toBeOnTheScreen();
    // Nothing happened yet: no navigation, the old workout is still the active one.
    expect(router.push).not.toHaveBeenCalled();
    expect(activeSessionStore.get()?.doc.id).toBe(logged.id);
  });

  it('Resume goes back to the workout in progress', async () => {
    seedActiveWithLoggedSet();
    const user = userEvent.setup();
    await renderToday(seedBootstrap());

    await user.press(screen.getByTestId('gym-today-start'));
    await user.press(screen.getByTestId('gym-start-conflict-resume'));

    expect(router.push).toHaveBeenCalledWith('/gym/workout');
    expect(activeSessionStore.get()?.doc.name).toBe('Lower A');
  });

  it('Discard & start drops the old workout (queued as DISCARDED) and starts the chosen one', async () => {
    const logged = seedActiveWithLoggedSet();
    const user = userEvent.setup();
    await renderToday(seedBootstrap());

    await user.press(screen.getByTestId('gym-today-start'));
    await user.press(screen.getByTestId('gym-start-conflict-discard'));

    const active = activeSessionStore.get()?.doc;
    expect(active?.name).toBe('Upper A');
    expect(active?.id).not.toBe(logged.id);
    expect(outbox.getState().entries.find((e) => e.doc.id === logged.id)?.doc.status).toBe(
      'DISCARDED',
    );
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('Finish & start completes the old workout (queued as COMPLETED) and starts the chosen one', async () => {
    const logged = seedActiveWithLoggedSet();
    const user = userEvent.setup();
    await renderToday(seedBootstrap());

    await user.press(screen.getByTestId('gym-today-start'));
    await user.press(screen.getByTestId('gym-start-conflict-finish'));

    await waitFor(() => expect(activeSessionStore.get()?.doc.name).toBe('Upper A'));
    expect(outbox.getState().entries.find((e) => e.doc.id === logged.id)?.doc.status).toBe(
      'COMPLETED',
    );
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('Freestyle is guarded the same way', async () => {
    seedActiveWithLoggedSet();
    const user = userEvent.setup();
    await renderToday(seedBootstrap());

    await user.press(screen.getByTestId('gym-today-freestyle'));

    expect(screen.getByTestId('gym-start-conflict-body')).toHaveTextContent(
      /start a freestyle workout/,
    );
    expect(router.push).not.toHaveBeenCalled();
  });
});

// UX-GYM-01: a rejected workout is surfaced on Today, in plain words, with a way to fix it.
describe('TodayScreen — a workout that did not save (UX-GYM-01)', () => {
  it('shows what is wrong and offers Fix it', async () => {
    const doc = makeDoc(9, { name: 'Upper A' });
    kv.setJSON(KV_KEYS.outbox, {
      v: 1,
      entries: [
        {
          doc,
          ownerId: null,
          enqueuedAt: '2026-09-20T00:00:00.000Z',
          attempts: 1,
          lastError: 'Number must be less than or equal to 1000',
          lastAttemptAt: '2026-09-20T00:00:00.000Z',
          parkedReason: describeValidationIssues([
            { code: 'too_big', path: ['exercises', 0, 'sets', 0, 'weightKg'] },
          ]),
        },
      ],
      lastSyncAt: null,
      failures: 0,
      nextAttemptAt: null,
      lastError: null,
    });
    outbox.reload();

    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT }),
    );
    const user = userEvent.setup();
    await renderToday(queryClient);

    expect(screen.getByText("Upper A didn't save")).toBeOnTheScreen();
    const reason = screen.getByTestId(`gym-today-parked-${doc.id}-reason`);
    expect(reason).toHaveTextContent(/above the 1000 kg/);
    expect(reason).not.toHaveTextContent(/too_big|invalid/i);
    await user.press(screen.getByTestId(`gym-today-parked-${doc.id}-fix`));
    expect(router.push).toHaveBeenCalledWith(`/gym/workout?edit=${doc.id}`);
    await user.press(screen.getByTestId(`gym-today-parked-${doc.id}-details`));
    expect(router.push).toHaveBeenCalledWith('/gym/settings');
  });
});
