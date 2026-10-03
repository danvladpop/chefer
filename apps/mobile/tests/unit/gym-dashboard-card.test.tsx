import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { NextWorkoutDto, RoutineDto, SessionSummaryDto } from '@chefer/types';
import { weekdayOf } from '@chefer/utils';
import { getMode, resetModeForTests } from '../../src/features/gym/mode-store';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { localDate } from '../../src/features/gym/offline/ids';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { TodaysWorkoutCard } from '../../src/features/gym/today/todays-workout-card';
import { saveForLater, startWorkout } from '../../src/features/gym/use-active-workout';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';

// `TodaysWorkoutCard` (imported above) transitively imports
// `../../src/lib/trpc` BEFORE this file's own `./gym-trpc-mock` import would
// run, so the factory can't reference an imported binding — it has to
// `require()` lazily, right when Jest first asks for the mocked module.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function renderCard(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TodaysWorkoutCard />
    </QueryClientProvider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

// A one-day routine whose weekday can be pinned to "today" (training) or a
// different day (rest) — T-05.9 / T-04.6 (UX-04 §5-6, bug B-15's companion).
function routineFor(plannedWeekday: number): RoutineDto {
  return {
    id: 'r1',
    name: 'Upper/Lower',
    templateKey: null,
    isActive: true,
    nextDayId: 'day-a',
    version: 1,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    days: [{ id: 'day-a', position: 0, name: 'Upper A', plannedWeekday, exercises: [] }],
  };
}

const NEXT_WORKOUT: NextWorkoutDto = {
  routineId: 'r1',
  dayId: 'day-a',
  dayName: 'Upper A',
  isDeload: false,
  estimatedMin: 40,
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

function todaySession(): SessionSummaryDto {
  const today = localDate();
  return {
    id: 'done-session',
    name: 'Upper A',
    routineDayId: 'day-a',
    status: 'COMPLETED',
    localDate: today,
    startedAt: `${today}T18:00:00.000Z`,
    finishedAt: `${today}T18:40:00.000Z`,
    isDeload: false,
    exercises: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetModeForTests();
  activeSessionStore.clear();
});

describe('TodaysWorkoutCard', () => {
  it('renders nothing before the bootstrap has loaded', async () => {
    const queryClient = makeClient();
    await renderCard(queryClient);
    expect(screen.queryByTestId('todays-workout-card')).not.toBeOnTheScreen();
  });

  it('invites setup when there is no gym profile', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
    const user = userEvent.setup();
    await renderCard(queryClient);

    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent(
      'Start training — set up in 90 seconds',
    );
    await user.press(screen.getByTestId('todays-workout-card'));
    expect(getMode()).toBe('gym');
    expect(router.push).toHaveBeenCalledWith('/today');
  });

  it('training, not done: shows the day name, estimate and a Start workout button', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: routineFor(weekdayOf(localDate())),
        nextWorkout: NEXT_WORKOUT,
      }),
    );
    await renderCard(queryClient);

    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent('Upper A');
    expect(screen.getByTestId('todays-workout-card')).toHaveTextContent(/~40 min · 1 exercises/);

    await user.press(screen.getByTestId('todays-workout-card-start'));
    expect(getMode()).toBe('gym');
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
    expect(activeSessionStore.get()?.doc.name).toBe('Upper A');
  });

  it('done today: "Done today ✓ · Next: …", no Start button, taps through to Gym Today', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: routineFor(weekdayOf(localDate())),
        nextWorkout: NEXT_WORKOUT,
        recentSessions: [todaySession()],
      }),
    );
    await renderCard(queryClient);

    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent(
      /Done today ✓ · Next: Upper A on/,
    );
    expect(screen.queryByTestId('todays-workout-card-start')).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('todays-workout-card'));
    expect(getMode()).toBe('gym');
    expect(router.push).toHaveBeenCalledWith('/today');
  });

  it('rest day: "Rest day · Next: …", a Train anyway link instead of Start', async () => {
    const user = userEvent.setup();
    const restWeekday = (weekdayOf(localDate()) + 1) % 7;
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: routineFor(restWeekday), nextWorkout: NEXT_WORKOUT }),
    );
    await renderCard(queryClient);

    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent(
      /Rest day · Next: Upper A on/,
    );
    expect(screen.queryByTestId('todays-workout-card-start')).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('todays-workout-card-train-anyway'));
    expect(getMode()).toBe('gym');
    expect(router.push).toHaveBeenCalledWith('/today');
  });

  // UX-FOOD-19: the Plan names the routine day pinned to today's weekday. The
  // card used to name the rotation's next day instead, so the two disagreed.
  it('names the day pinned to today, not the rotation’s next day (UX-FOOD-19)', async () => {
    const user = userEvent.setup();
    const today = weekdayOf(localDate());
    const queryClient = makeClient();
    const routine: RoutineDto = {
      ...routineFor((today + 2) % 7),
      days: [
        {
          id: 'day-a',
          position: 0,
          name: 'Upper A',
          plannedWeekday: (today + 2) % 7,
          exercises: [],
        },
        { id: 'day-b', position: 1, name: 'Lower B', plannedWeekday: today, exercises: [] },
      ],
    };
    // The rotation points at Upper A (due later this week); Plan says Lower B today.
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: routine, nextWorkout: NEXT_WORKOUT }),
    );
    await renderCard(queryClient);

    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent('Lower B');
    expect(screen.queryByText(/Rest day/)).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('todays-workout-card-start'));
    expect(activeSessionStore.get()?.doc.name).toBe('Lower B');
  });

  // T-36.A1.2: the resume line, built on the same resumeSummary() the gym
  // Today Resume card and the logger itself use (UX-36 A1, AC9) — it
  // outranks the done/rest/training states above.
  describe('an in-progress or paused session (T-36.A1.2)', () => {
    beforeEach(() => {
      startWorkout({ kind: 'planned', workout: NEXT_WORKOUT });
    });

    it('shows "Workout in progress · N of M exercises" and a Resume button', async () => {
      const user = userEvent.setup();
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({
          activeRoutine: routineFor(weekdayOf(localDate())),
          nextWorkout: NEXT_WORKOUT,
        }),
      );
      await renderCard(queryClient);

      expect(screen.getByTestId('todays-workout-card-resume-label')).toHaveTextContent(
        'Workout in progress · 0 of 1 exercises',
      );
      await user.press(screen.getByTestId('todays-workout-card-resume-button'));
      expect(getMode()).toBe('gym');
      expect(router.push).toHaveBeenCalledWith('/gym/workout');
    });

    it('shows "Workout paused" once saved for later', async () => {
      saveForLater();
      const queryClient = makeClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({
          activeRoutine: routineFor(weekdayOf(localDate())),
          nextWorkout: NEXT_WORKOUT,
        }),
      );
      await renderCard(queryClient);

      expect(screen.getByTestId('todays-workout-card-resume-label')).toHaveTextContent(
        'Workout paused · 0 of 1 exercises',
      );
    });
  });
});
