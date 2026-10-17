import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import type { NextWorkoutDto, RoutineDto, SessionSummaryDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import TrainTab from '../../app/(main)/train';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { pastWorkoutMeta } from '../../src/features/shell/train/past-workouts';
import { makeBootstrap, makeExercise, photosIn } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';
import { activeDoc } from './gym-workout-helpers';

// 10 Oct redesign — the Train tab (board "Train"): the owner's order with the
// ongoing workout first, the guarded Start, past workouts one per line as
// MediaRows, and the Routines entry. Same trpc fake as gym-today.test.tsx.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require, see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
  usePathname: () => '/train',
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual<typeof import('react')>('react');
    mockUseEffect(cb, [cb]);
  },
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

// Mon 28 Sep 2026, local noon (the fixtures plan d1 on Mondays).
const NOW = new Date(2026, 8, 28, 12, 0, 0);

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'Push Pull Legs',
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
      name: 'Push A',
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
    { id: 'd2', position: 1, name: 'Legs', plannedWeekday: 2, exercises: [] },
  ],
};

const NEXT_WORKOUT: NextWorkoutDto = {
  routineId: 'r1',
  dayId: 'd1',
  dayName: 'Push A',
  isDeload: false,
  estimatedMin: 55,
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

function session(overrides: Partial<SessionSummaryDto> & { id: string }): SessionSummaryDto {
  return {
    name: 'Legs',
    routineDayId: 'd2',
    status: 'COMPLETED',
    localDate: '2026-09-23',
    startedAt: '2026-09-23T17:00:00.000Z',
    finishedAt: '2026-09-23T18:01:00.000Z',
    isDeload: false,
    exercises: [
      {
        exerciseId: 'squat',
        skipped: false,
        lastSetRir: 2,
        sets: [
          { weightKg: 100, reps: 5, isWarmup: false, completed: true },
          { weightKg: 100, reps: 5, isWarmup: false, completed: true },
        ],
      },
    ],
    ...overrides,
  };
}

function client(overrides: Parameters<typeof makeBootstrap>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({
      activeRoutine: ROUTINE,
      nextWorkout: NEXT_WORKOUT,
      streak: { current: 7, best: 7, flexTokens: 0, thisWeekSessions: 2, thisWeekGoal: 4 },
      ...overrides,
    }),
  );
  return queryClient;
}

function renderTrain(queryClient: QueryClient) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <TrainTab />
        <Snackbar />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

type Node = { props?: Record<string, unknown>; children?: (Node | string)[] | null };

/** Where each testID first appears in the rendered tree (render order). */
function orderOf(ids: string[]): number[] {
  const seen: string[] = [];
  const walk = (node: Node | string | null) => {
    if (!node || typeof node === 'string') return;
    const id = node.props?.testID;
    if (typeof id === 'string') seen.push(id);
    node.children?.forEach(walk);
  };
  const tree = screen.toJSON() as Node | Node[] | null;
  (Array.isArray(tree) ? tree : [tree]).forEach(walk);
  return ids.map((id) => seen.indexOf(id));
}

/** The in-progress fixture, started today (the fixture's own date is in the past). */
function todaysDoc() {
  return { ...activeDoc(), localDate: '2026-09-28' };
}

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

describe('Train (new shell)', () => {
  it('titles itself Train with Ask Chef, and lays the cards out in the owner’s order', async () => {
    activeSessionStore.set(todaysDoc(), null);
    await renderTrain(client({ recentSessions: [session({ id: 's1' })] }));

    expect(screen.getByText('Train')).toBeOnTheScreen();
    expect(screen.getByTestId('shell-ask-chef')).toBeOnTheScreen();
    const order = orderOf([
      'train-ongoing',
      'train-week',
      'train-up-next',
      'train-log-workout',
      'train-routines',
      'train-past',
      'train-links',
    ]);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Gym settings moved under You; Routine is the Routines entry card.
    expect(screen.queryByTestId('train-settings')).toBeNull();
    expect(screen.queryByText('How this works')).toBeNull();
  });

  it('shows the ongoing workout card only while one is open, and Resume opens it', async () => {
    const user = userEvent.setup();
    activeSessionStore.set(todaysDoc(), null);
    await renderTrain(client());
    const card = screen.getByTestId('train-ongoing');
    expect(within(card).getByText('Upper A · in progress')).toBeOnTheScreen();
    expect(within(card).getByText('20 min · 1 exercise')).toBeOnTheScreen();
    await user.press(screen.getByTestId('train-ongoing-resume'));
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('has no ongoing card when no workout is open', async () => {
    await renderTrain(client());
    expect(screen.getByTestId('train-week')).toBeOnTheScreen();
    expect(screen.queryByTestId('train-ongoing')).toBeNull();
  });

  it('a saved-for-later workout reads "saved"', async () => {
    activeSessionStore.set(todaysDoc(), null);
    activeSessionStore.setPausedAt(new Date(NOW.getTime() - 60_000).toISOString());
    await renderTrain(client());
    expect(screen.getByText('Upper A · saved')).toBeOnTheScreen();
  });

  it('this week: ring, line, streak and one spoken sentence for the strip', async () => {
    await renderTrain(client());
    expect(screen.getByTestId('train-week-line')).toHaveTextContent('2 of 4 this week');
    expect(screen.getByTestId('train-streak')).toHaveTextContent('7-week streak');
    expect(screen.getByTestId('train-week-strip').props.accessibilityLabel).toMatch(
      /^This week: Monday, planned, today; Tuesday, rest day; Wednesday, planned/,
    );
  });

  it('Up next starts the planned day', async () => {
    const user = userEvent.setup();
    await renderTrain(client());
    expect(screen.getByTestId('train-up-next-name')).toHaveTextContent('Push A');
    expect(screen.getByText('1 exercise · ~55 min')).toBeOnTheScreen();
    await user.press(screen.getByTestId('train-start'));
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
    expect(activeSessionStore.get()?.doc.name).toBe('Push A');
  });

  it('a start while a workout is open asks first (the conflict sheet)', async () => {
    const user = userEvent.setup();
    activeSessionStore.set(todaysDoc(), null);
    await renderTrain(client());
    await user.press(screen.getByTestId('train-freestyle'));
    expect(screen.getByTestId('gym-start-conflict')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Edit opens the routine editor; the ⋯ menu lists the exercises and day actions', async () => {
    const user = userEvent.setup();
    await renderTrain(client());
    await user.press(screen.getByTestId('train-edit'));
    expect(router.push).toHaveBeenCalledWith('/gym/routine-editor?id=r1');
    await user.press(screen.getByTestId('train-up-next-more'));
    expect(screen.getByTestId('train-up-next-exercise-re1')).toBeOnTheScreen();
    expect(screen.getByTestId('train-pick-day')).toBeOnTheScreen();
    expect(screen.getByTestId('train-skip')).toBeOnTheScreen();
  });

  it('the time segmented control trims the day and remembers the choice', async () => {
    const user = userEvent.setup();
    await renderTrain(client());
    expect(screen.queryByTestId('train-short-preview')).toBeNull();
    await user.press(screen.getByTestId('train-time-20'));
    expect(screen.getByTestId('train-time-20').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('past workouts: one MediaRow per session, date · minutes · sets, ⋯ menu, All', async () => {
    const user = userEvent.setup();
    await renderTrain(
      client({
        recentSessions: [
          session({ id: 's1' }),
          session({
            id: 's2',
            name: 'Pull A',
            routineDayId: 'd1',
            localDate: '2026-09-21',
            startedAt: '2026-09-21T17:00:00.000Z',
            finishedAt: '2026-09-21T17:54:00.000Z',
          }),
        ],
      }),
    );
    const row = screen.getByTestId('train-past-row-s1');
    expect(within(row).getByText('Legs')).toBeOnTheScreen();
    expect(within(row).getByText('Wed 23 Sep · 61 min · 2 sets')).toBeOnTheScreen();
    expect(screen.getByTestId('train-past-row-s2')).toBeOnTheScreen();
    await user.press(screen.getByTestId('train-past-row-s1-options'));
    expect(screen.getByTestId('train-past-menu-edit')).toBeOnTheScreen();
    await user.press(screen.getByTestId('train-past-all'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/training/stats',
      params: { tab: 'history' },
    });
  });

  it('covers: Up next and past workouts show the first exercise photo; activities keep the glyph', async () => {
    const SQUAT_PHOTO = '/static/exercises/squat-start.jpg';
    const BENCH_PHOTO = 'https://cdn.example/bench.jpg';
    await renderTrain(
      client({
        library: [
          { ...makeExercise('bench'), images: [BENCH_PHOTO] },
          { ...makeExercise('squat'), images: [SQUAT_PHOTO] },
        ],
        recentSessions: [
          session({ id: 's1' }),
          // The skipped squat doesn't count: the cover is bench, done second.
          session({
            id: 's2',
            localDate: '2026-09-21',
            startedAt: '2026-09-21T17:00:00.000Z',
            finishedAt: '2026-09-21T17:54:00.000Z',
            exercises: [
              { exerciseId: 'squat', skipped: true, lastSetRir: null, sets: [] },
              {
                exerciseId: 'bench',
                skipped: false,
                lastSetRir: 2,
                sets: [{ weightKg: 60, reps: 10, isWarmup: false, completed: true }],
              },
            ],
          }),
          session({
            id: 'a1',
            name: 'Run',
            routineDayId: null,
            localDate: '2026-09-20',
            startedAt: '2026-09-20T07:00:00.000Z',
            finishedAt: '2026-09-20T07:30:00.000Z',
            exercises: [
              {
                exerciseId: 'running',
                skipped: false,
                lastSetRir: null,
                sets: [
                  { weightKg: 0, reps: 0, isWarmup: false, completed: true, durationSec: 1800 },
                ],
              },
            ],
          }),
        ],
      }),
    );
    expect(
      photosIn(screen.getByTestId('train-up-next-cover', { includeHiddenElements: true })),
    ).toEqual([BENCH_PHOTO]);
    expect(photosIn(screen.getByTestId('train-past-row-s1'))).toEqual([
      `http://localhost:3001${SQUAT_PHOTO}`,
    ]);
    expect(photosIn(screen.getByTestId('train-past-row-s2'))).toEqual([BENCH_PHOTO]);
    expect(photosIn(screen.getByTestId('train-past-row-a1'))).toEqual([]);
  });

  it('covers: without exercise photos the frames keep the illustration', async () => {
    await renderTrain(client({ recentSessions: [session({ id: 's1' })] }));
    expect(
      photosIn(screen.getByTestId('train-up-next-cover', { includeHiddenElements: true })),
    ).toEqual([]);
    expect(photosIn(screen.getByTestId('train-past-row-s1'))).toEqual([]);
  });

  it('an activity row shows its distance instead of sets', () => {
    const run = session({
      id: 'a1',
      name: 'Running',
      routineDayId: null,
      exercises: [
        {
          exerciseId: 'run',
          skipped: false,
          lastSetRir: null,
          sets: [
            {
              weightKg: 0,
              reps: 0,
              isWarmup: false,
              completed: true,
              durationSec: 1920,
              distanceM: 5100,
            },
          ],
        },
      ],
    });
    const meta = pastWorkoutMeta(
      {
        id: 'a1',
        name: 'Running',
        localDate: '2026-10-02',
        startTime: '07:00',
        durationMin: 32,
        workingSets: 1,
        hasPr: false,
        activity: true,
        caloriesKcal: null,
      },
      run,
      'KM',
    );
    expect(meta.text).toBe('Fri 2 Oct · 32 min · 5.1 km');
  });

  it('Routines opens the routine; + Routine opens My routines; Log a workout opens the sheet', async () => {
    const user = userEvent.setup();
    await renderTrain(client());
    expect(screen.getByTestId('train-routines-open').props.accessibilityLabel).toBe(
      'Routines, Push Pull Legs',
    );
    await user.press(screen.getByTestId('train-routines-open'));
    expect(router.push).toHaveBeenCalledWith('/training/routine');
    await user.press(screen.getByTestId('train-routines-add'));
    expect(router.push).toHaveBeenCalledWith('/gym/routines');
    await user.press(screen.getByTestId('train-log-workout'));
    expect(screen.getByTestId('log-workout-sheet')).toBeOnTheScreen();
  });

  it('without a gym profile it offers setup', async () => {
    const user = userEvent.setup();
    await renderTrain(client({ profile: null, activeRoutine: null, nextWorkout: null }));
    await user.press(screen.getByTestId('train-setup-cta'));
    expect(router.push).toHaveBeenCalledWith('/gym/setup');
  });

  it('a rest day keeps Start anyway and the day picker', async () => {
    const user = userEvent.setup();
    // Tuesday after Monday's Push A: Legs is next, planned for Wednesday.
    jest.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
    await renderTrain(
      client({
        activeRoutine: { ...ROUTINE, nextDayId: 'd2' },
        nextWorkout: { ...NEXT_WORKOUT, dayId: 'd2', dayName: 'Legs', exercises: [] },
        recentSessions: [
          session({
            id: 'mon',
            name: 'Push A',
            routineDayId: 'd1',
            localDate: '2026-09-28',
            startedAt: '2026-09-28T09:00:00.000Z',
            finishedAt: '2026-09-28T10:00:00.000Z',
          }),
        ],
      }),
    );
    expect(screen.getByTestId('train-rest')).toBeOnTheScreen();
    await user.press(screen.getByTestId('train-rest-pick-day'));
    expect(screen.getByTestId('train-day-picker')).toBeOnTheScreen();
  });
});
