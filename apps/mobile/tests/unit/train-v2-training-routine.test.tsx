import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import type { MuscleVolume, RoutineDto } from '@chefer/types';
import TrainingRoutineRoute from '../../app/training/routine';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { BalanceBar } from '../../src/features/shell/train/training-routine-screen';
import { makeBootstrap, makeExercise, photosIn } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';
import { activeDoc } from './gym-workout-helpers';

// 10 Oct redesign — /training/routine in the new shell (board
// "TrainingRoutine"): the routine card, day tiles with a play button that
// starts the day through the guarded start, and the weekly balance bars.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require, see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
}));
const mockShellV2 = { current: true };
jest.mock('../../src/features/shell/shell-store', () => ({
  useShellV2: () => mockShellV2.current,
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const exercise = (id: string, exerciseId: string, position: number) => ({
  id,
  exerciseId,
  position,
  sets: 3,
  repMin: 8,
  repMax: 12,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  notes: null,
});

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'Push Pull Legs + Upper',
  templateKey: null,
  isActive: true,
  nextDayId: 'd2',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T00:00:00.000Z',
  days: [
    {
      id: 'd1',
      position: 0,
      name: 'Pull A',
      plannedWeekday: 0,
      exercises: [exercise('e1', 'bench', 0)],
    },
    {
      id: 'd2',
      position: 1,
      name: 'Legs',
      plannedWeekday: 2,
      exercises: [exercise('e2', 'squat', 0), exercise('e3', 'bench', 1)],
    },
  ],
};

function renderRoute(bootstrap = makeBootstrap({ activeRoutine: ROUTINE })) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  client.setQueryData(gymBootstrapQueryKey, bootstrap);
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={client}>
        <TrainingRoutineRoute />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShellV2.current = true;
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  activeSessionStore.clear();
  trpc.gym.progression.setOverride.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.clearOverride.useMutation.mockReturnValue(mutationResult());
  jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('Routine (new shell)', () => {
  it('shows the routine card with Edit and My routines, titled Routine with Ask Chef', async () => {
    const user = userEvent.setup();
    await renderRoute();
    expect(screen.getByText('Routine')).toBeOnTheScreen();
    expect(screen.getByTestId('shell-ask-chef')).toBeOnTheScreen();
    expect(screen.getByTestId('training-routine-name')).toHaveTextContent('Push Pull Legs + Upper');
    expect(screen.getByText('2 days · goal 3 a week')).toBeOnTheScreen();
    await user.press(screen.getByTestId('training-routine-edit'));
    expect(router.push).toHaveBeenCalledWith('/gym/routine-editor?id=r1');
    await user.press(screen.getByTestId('training-routine-my-routines'));
    expect(router.push).toHaveBeenCalledWith('/gym/routines');
  });

  it('lists the days as tiles with weekday · exercises, and marks the next one', async () => {
    await renderRoute();
    const legs = screen.getByTestId('training-routine-day-d2');
    expect(within(legs).getByText('Wed · 2 exercises')).toBeOnTheScreen();
    // The badge is drawn on the frame and spoken as part of the tile's label.
    expect(
      within(legs).getByRole('button', { name: 'Legs, Wed · 2 exercises, Up next' }),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('training-routine-day-d1')).getByRole('button', {
        name: 'Pull A, Mon · 1 exercise',
      }),
    ).toBeOnTheScreen();
  });

  it('a day tile shows its first exercise photo, or the barbell when none has one', async () => {
    await renderRoute(
      makeBootstrap({
        activeRoutine: ROUTINE,
        library: [
          { ...makeExercise('bench'), images: ['/static/exercises/bench-start.jpg'] },
          makeExercise('squat'),
        ],
      }),
    );
    const photoOf = (dayId: string) =>
      photosIn(screen.getByTestId(`training-routine-day-${dayId}`));
    expect(photoOf('d1')).toEqual(['http://localhost:3001/static/exercises/bench-start.jpg']);
    // Legs: squat has no photo, so the day takes bench's.
    expect(photoOf('d2')).toEqual(['http://localhost:3001/static/exercises/bench-start.jpg']);
  });

  it('no exercise photos: the day tiles keep the illustration', async () => {
    await renderRoute();
    expect(photosIn(screen.getByTestId('training-routine-day-d1'))).toEqual([]);
  });

  it('the play button starts that day', async () => {
    const user = userEvent.setup();
    await renderRoute();
    await user.press(screen.getByTestId('training-routine-day-d1-start'));
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
    expect(activeSessionStore.get()?.doc.name).toBe('Pull A');
  });

  it('with a workout already open, the play button asks first', async () => {
    const user = userEvent.setup();
    activeSessionStore.set(activeDoc(), null);
    await renderRoute();
    await user.press(screen.getByTestId('training-routine-day-d1-start'));
    expect(screen.getByTestId('gym-start-conflict')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a day tile opens its exercises', async () => {
    const user = userEvent.setup();
    await renderRoute();
    await user.press(
      within(screen.getByTestId('training-routine-day-d2')).getByRole('button', {
        name: /^Legs, /,
      }),
    );
    expect(screen.getByTestId('training-routine-exercise-e2')).toBeOnTheScreen();
    expect(screen.getByTestId('training-routine-day-sheet-start')).toBeOnTheScreen();
  });

  it('shows the weekly balance with its caption', async () => {
    await renderRoute();
    expect(screen.getByTestId('training-routine-balance')).toBeOnTheScreen();
    expect(screen.getByText('Shaded band = weekly target sets')).toBeOnTheScreen();
  });

  it('Edit is off offline, with the offline note', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    await renderRoute();
    expect(screen.getByTestId('training-routine-offline')).toBeOnTheScreen();
    expect(screen.getByTestId('training-routine-edit').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('with no active routine it points to My routines', async () => {
    await renderRoute(makeBootstrap());
    expect(screen.getByTestId('training-routine-empty')).toBeOnTheScreen();
  });

  it('the old shell keeps the old Routine screen', async () => {
    mockShellV2.current = false;
    await renderRoute();
    expect(screen.getByTestId('gym-routine-title')).toBeOnTheScreen();
    expect(screen.queryByTestId('training-routine-card')).toBeNull();
  });
});

describe('BalanceBar', () => {
  const mv = (fractional: number): MuscleVolume => ({
    group: 'calves',
    direct: fractional,
    fractional,
    days: 1,
    floor: 6,
    productiveMax: 12,
    warnAbove: 20,
  });

  it('flags a muscle under its target in words', async () => {
    await render(<BalanceBar mv={mv(3)} testID="bar" />);
    expect(screen.getByText(' · under')).toBeOnTheScreen();
    expect(screen.getByTestId('bar').props.accessibilityLabel).toBe(
      'Calves: 3 sets a week, target 6 to 12, under target',
    );
  });

  it('says nothing extra inside the band', async () => {
    await render(<BalanceBar mv={mv(9)} testID="bar" />);
    expect(screen.queryByText(' · under')).toBeNull();
    expect(screen.getByTestId('bar').props.accessibilityLabel).toBe(
      'Calves: 9 sets a week, target 6 to 12',
    );
  });
});
