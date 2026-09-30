import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type {
  ExerciseDto,
  NextWorkoutDto,
  NextWorkoutExerciseDto,
  RoutineDto,
} from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { estimateMinutes } from '@chefer/utils';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { getTimeToday, setTimeToday } from '../../src/features/gym/today/time-today';
import { TodayScreen } from '../../src/features/gym/today/today-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// T-36.6 (UX-36 (6)): `Time today:` chips at Start, remembered per weekday,
// with the `Short version · ~{min} min · {n} exercises` preview.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
  usePathname: () => '/today',
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

// Mon 28 Sep 2026, local noon (weekday 0).
const NOW = new Date(2026, 8, 28, 12, 0, 0);
const MONDAY = '2026-09-28';

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'My Routine',
  templateKey: 'ul4-beginner',
  isActive: true,
  nextDayId: 'd1',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T00:00:00.000Z',
  days: [{ id: 'd1', position: 0, name: 'Upper A', plannedWeekday: 0, exercises: [] }],
};

function exerciseRow(id: string, position: number): NextWorkoutExerciseDto {
  return {
    routineExerciseId: `re-${id}`,
    exerciseId: id,
    position,
    sets: 4,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    notes: null,
    repBucket: '8-12',
    suggestion: {
      kind: 'start',
      weightKg: 40,
      reps: [10, 10, 10, 10],
      sets: 4,
      reasonCode: 'START',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
    warmups: [],
    lastTime: null,
  };
}

// 2 compounds + 3 chest/triceps accessories.
const LIBRARY: ExerciseDto[] = [
  makeExercise('bench'),
  makeExercise('row'),
  { ...makeExercise('fly'), category: 'ISOLATION', primaryMuscles: ['chest'], restSec: 90 },
  { ...makeExercise('cable-cross'), category: 'ISOLATION', primaryMuscles: ['chest'], restSec: 90 },
  { ...makeExercise('pushdown'), category: 'ISOLATION', primaryMuscles: ['triceps'], restSec: 90 },
];
const EXERCISES = ['bench', 'row', 'fly', 'cable-cross', 'pushdown'].map(exerciseRow);
const FULL_MIN = estimateMinutes(
  EXERCISES.map((e) => ({
    sets: e.sets,
    restSec: e.restSec,
    isCompound: LIBRARY.find((l) => l.id === e.exerciseId)?.category === 'COMPOUND',
  })),
);
const NEXT_WORKOUT: NextWorkoutDto = {
  routineId: 'r1',
  dayId: 'd1',
  dayName: 'Upper A',
  isDeload: false,
  estimatedMin: FULL_MIN,
  exercises: EXERCISES,
};

function isSelected(testID: string): boolean {
  const chip = screen.getByTestId(testID) as unknown as {
    props: { accessibilityState?: { selected?: boolean } };
  };
  return chip.props.accessibilityState?.selected === true;
}

function renderToday() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({ activeRoutine: ROUTINE, nextWorkout: NEXT_WORKOUT, library: LIBRARY }),
  );
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <TodayScreen />
        <Snackbar />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  setKvBackendForTests(createMemoryKvBackend());
  activeSessionStore.clear();
  resetGymOwnerForTests();
  resetSnackbarForTests();
  outbox.reload();
  onlineManager.setOnline(true);
  trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.dismissOffer.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.startDeload.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
});

afterEach(() => jest.useRealTimers());

describe('Gym Today · Time today chips (T-36.6)', () => {
  it('offers 20 / 30 / 45 / Full, defaults to Full and shows no short preview', async () => {
    await renderToday();

    expect(screen.getByText('Time today:')).toBeOnTheScreen();
    for (const id of ['20', '30', '45', 'full']) {
      expect(screen.getByTestId(`gym-today-time-${id}`)).toBeOnTheScreen();
    }
    expect(isSelected('gym-today-time-full')).toBe(true);
    expect(screen.queryByTestId('gym-today-short-preview')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Time available today')).toBeOnTheScreen();
    // Full path is exactly as before: all five exercises, the full estimate.
    expect(screen.getByText(`~${String(FULL_MIN)} min`)).toBeOnTheScreen();
    expect(screen.getByText('cable-cross')).toBeOnTheScreen();
  });

  it('Full → Start keeps the session byte-for-byte as before (no carry-over ids)', async () => {
    const user = userEvent.setup();
    await renderToday();

    await user.press(screen.getByTestId('gym-today-start'));

    const doc = activeSessionStore.get()?.doc;
    expect(doc?.exercises).toHaveLength(5);
    expect(doc).not.toHaveProperty('carryOverExerciseIds');
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('choosing 30 previews the short version, trims the list and remembers the weekday', async () => {
    const user = userEvent.setup();
    await renderToday();

    await user.press(screen.getByTestId('gym-today-time-30'));

    const preview = screen.getByTestId('gym-today-short-preview');
    const match = /^Short version · ~(\d+) min · (\d+) exercises$/.exec(
      preview.props.children as string,
    );
    expect(match).not.toBeNull();
    const minutes = Number(match?.[1]);
    const count = Number(match?.[2]);
    expect(minutes).toBeLessThanOrEqual(32); // AC7
    expect(count).toBeLessThan(5);
    expect(screen.getByText(`~${String(minutes)} min`)).toBeOnTheScreen();
    // The second chest accessory is the first thing to go.
    expect(screen.queryByText('cable-cross')).not.toBeOnTheScreen();
    expect(screen.getByText('bench')).toBeOnTheScreen();

    // Remembered per weekday, on-device.
    expect(getTimeToday(MONDAY)).toBe(30);
    expect(getTimeToday('2026-09-29')).toBeNull(); // Tuesday unaffected
  });

  it('starting a short version keeps the kept exercises and queues the dropped for next time', async () => {
    const user = userEvent.setup();
    await renderToday();

    await user.press(screen.getByTestId('gym-today-time-30'));
    await user.press(screen.getByTestId('gym-today-start'));

    const doc = activeSessionStore.get()?.doc;
    const keptIds = doc?.exercises.map((e) => e.exerciseId) ?? [];
    expect(keptIds).toContain('bench');
    expect(keptIds).toContain('row'); // compounds are always kept
    const carried = doc?.carryOverExerciseIds ?? [];
    expect(carried.length).toBeGreaterThan(0);
    expect([...keptIds, ...carried].sort()).toEqual(
      ['bench', 'cable-cross', 'fly', 'pushdown', 'row'].sort(),
    );
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('pre-selects the remembered choice for this weekday and Full clears it', async () => {
    setTimeToday(MONDAY, 20);
    const user = userEvent.setup();
    await renderToday();

    expect(isSelected('gym-today-time-20')).toBe(true);
    expect(screen.getByTestId('gym-today-short-preview')).toBeOnTheScreen();

    await user.press(screen.getByTestId('gym-today-time-full'));
    expect(screen.queryByTestId('gym-today-short-preview')).not.toBeOnTheScreen();
    expect(getTimeToday(MONDAY)).toBeNull();
  });

  it('shows the preview only when the chosen time actually cuts the day', async () => {
    const user = userEvent.setup();
    await renderToday();

    // The fixture day is ~55 min: 45 (budget 47) cuts it…
    expect(FULL_MIN).toBeGreaterThan(47);
    await user.press(screen.getByTestId('gym-today-time-45'));
    expect(screen.getByTestId('gym-today-short-preview')).toBeOnTheScreen();
  });
});
