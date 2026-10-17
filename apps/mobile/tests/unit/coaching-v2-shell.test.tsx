import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import type { GymBootstrap, NextWorkoutDto, ProgressionDto, RoutineDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainTab from '../../app/(main)/train';
import TrainingRoutineRoute from '../../app/training/routine';
import { isRoutineChangeUnseen, markRoutineSeen } from '../../src/features/coaching/seen-markers';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { TrainingSection } from '../../src/features/shell/today/training-card';
import { makeBootstrap } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// WP-18 in the one-tab-bar shell: the client's coaching surfaces follow the training wherever the new shell
// shows it — the notices ("Ana updated your routine", "Ana stopped coaching you", "Carry on joining your
// trainer") on Train and in Today's Training section, and on Train → Routine the attribution ("Ana changed
// your routine · 2 Oct", "Changed by Ana", the trainer's note with Remove note, "Set by Ana"). Opening the
// routine marks the change as seen, so the notice goes away.

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
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/features/shell/shell-store', () => ({
  ...jest.requireActual<object>('../../src/features/shell/shell-store'),
  useShellV2: () => true,
  isShellV2: () => true,
}));
// Today's card: the guarded start and the log sheet have their own tests.
jest.mock('../../src/features/shell/today/use-start-guard', () => ({
  useStartGuard: () => ({ startPlanned: jest.fn(), conflictSheet: null }),
}));
jest.mock('../../src/features/shell/log-workout-sheet', () => ({ LogWorkoutSheet: () => null }));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

// Mon 28 Sep 2026, local noon (d1 is planned on Mondays).
const NOW = new Date(2026, 8, 28, 12, 0, 0);
const CHANGED_AT = '2026-10-02T09:00:00.000Z';
const ANA = { name: 'Ana', at: CHANGED_AT };

type RoutineRow = RoutineDto['days'][number]['exercises'][number];

function routine(extra: Partial<RoutineDto> = {}, row: Partial<RoutineRow> = {}): RoutineDto {
  return {
    id: 'r1',
    name: 'Push Pull Legs',
    templateKey: null,
    isActive: true,
    nextDayId: 'd1',
    version: 3,
    archived: false,
    updatedAt: CHANGED_AT,
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
            ...row,
          },
        ],
      },
    ],
    ...extra,
  };
}

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

const TRAINER_TARGET: ProgressionDto = {
  exerciseId: 'bench',
  repBucket: '8-12',
  state: {} as ProgressionDto['state'],
  override: { weightKg: 62.5, reps: [6, 6, 6], at: CHANGED_AT, setByName: 'Ana' },
  suggestion: {
    kind: 'hold',
    weightKg: 62.5,
    reps: [6, 6, 6],
    sets: 3,
    reasonCode: 'USER_OVERRIDE',
    inputs: {},
    deltaKg: 0,
    engineVersion: 1,
  },
};

function setCoaching(opts: { enabled: boolean; status?: unknown }) {
  trpc.coaching.availability.useQuery.mockReturnValue({
    data: { enabled: opts.enabled, canBeTrainer: false },
    isError: false,
    isLoading: false,
    isPending: false,
    fetchStatus: 'idle',
    error: null,
    refetch: jest.fn(),
  });
  trpc.coaching.status.useQuery.mockReturnValue({
    data: opts.status,
    isError: false,
    isLoading: false,
  });
}

const COACHED = { trainer: { name: 'Ana', since: CHANGED_AT }, stopped: null };
const UNCOACHED = { trainer: null, stopped: null };

function renderWith(bootstrap: GymBootstrap, ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  client.setQueryData(gymBootstrapQueryKey, bootstrap);
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const coachedBootstrap = (extra: Partial<GymBootstrap> = {}) =>
  makeBootstrap({
    activeRoutine: routine({ lastEditedByOther: ANA }),
    nextWorkout: NEXT_WORKOUT,
    coaching: { trainerName: 'Ana' },
    ...extra,
  });

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
  trpc.gym.progression.setOverride.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.clearOverride.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
  jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
  setCoaching({ enabled: true, status: COACHED });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Train tab (new shell): coaching notices', () => {
  it('"Ana updated your routine" opens Train → Routine', async () => {
    const user = userEvent.setup();
    await renderWith(coachedBootstrap(), <TrainTab />);
    expect(screen.getByTestId('coaching-routine-updated')).toHaveTextContent(
      'Ana updated your routine · 2 Oct',
    );
    await user.press(screen.getByTestId('coaching-routine-updated'));
    expect(router.push).toHaveBeenCalledWith('/training/routine');
  });

  it('is gone once the routine was seen on this device', async () => {
    markRoutineSeen('r1', CHANGED_AT);
    await renderWith(coachedBootstrap(), <TrainTab />);
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
  });

  it('"Ana stopped coaching you" shows and can be dismissed', async () => {
    const user = userEvent.setup();
    setCoaching({
      enabled: true,
      status: { trainer: null, stopped: { trainerName: 'Ana', at: '2026-10-03T10:00:00.000Z' } },
    });
    await renderWith(makeBootstrap({ activeRoutine: routine() }), <TrainTab />);
    expect(screen.getByTestId('coaching-stopped')).toHaveTextContent(
      'Ana stopped coaching you · 3 Oct',
    );
    await user.press(screen.getByTestId('coaching-stopped-dismiss'));
    expect(screen.queryByTestId('coaching-stopped')).toBeNull();
  });

  it('"Carry on joining your trainer" shows even before training is set up', async () => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: UNCOACHED });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderWith(makeBootstrap({ profile: null }), <TrainTab />);
    expect(screen.getByTestId('train-empty-setup')).toBeOnTheScreen();
    await user.press(screen.getByTestId('coaching-carry-on-link'));
    expect(router.push).toHaveBeenCalledWith('/coaching/join/ABCD234567');
  });

  it('coaching off: no notice, and coaching.status is never enabled', async () => {
    setCoaching({ enabled: false });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderWith(coachedBootstrap(), <TrainTab />);
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
    for (const call of trpc.coaching.status.useQuery.mock.calls as unknown[][]) {
      expect(call[1]).toMatchObject({ enabled: false });
    }
  });
});

describe('Today (new shell): coaching notices in Training', () => {
  it('"Ana updated your routine" sits in the Training section, above the planned workout', async () => {
    await renderWith(coachedBootstrap(), <TrainingSection />);
    const section = within(screen.getByTestId('today-training'));
    expect(section.getByTestId('coaching-routine-updated')).toHaveTextContent(
      'Ana updated your routine · 2 Oct',
    );
    expect(section.getByTestId('today-training-planned')).toBeOnTheScreen();
  });

  it('with no training to show, the notice stands alone', async () => {
    setCoaching({ enabled: true, status: UNCOACHED });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderWith(makeBootstrap({ profile: null }), <TrainingSection />);
    expect(screen.queryByTestId('today-training')).toBeNull();
    expect(screen.getByTestId('coaching-carry-on')).toBeOnTheScreen();
  });

  it('an uncoached client sees only the training card', async () => {
    setCoaching({ enabled: true, status: UNCOACHED });
    await renderWith(
      coachedBootstrap({ activeRoutine: routine(), coaching: null }),
      <TrainingSection />,
    );
    expect(screen.getByTestId('today-training-planned')).toBeOnTheScreen();
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
  });
});

async function openDay(user: ReturnType<typeof userEvent.setup>) {
  await user.press(
    within(screen.getByTestId('training-routine-day-d1')).getByRole('button', {
      name: /^Push A, /,
    }),
  );
}

describe('Train → Routine (new shell): coaching attribution', () => {
  function coachedRoutine() {
    return makeBootstrap({
      coaching: { trainerName: 'Ana' },
      progressions: [TRAINER_TARGET],
      activeRoutine: routine(
        { lastEditedByOther: ANA },
        { lastEditedByOther: ANA, trainerNote: 'knees out, slow eccentric' },
      ),
    });
  }

  it('opening the routine marks the trainer’s change as seen', async () => {
    expect(isRoutineChangeUnseen('r1', CHANGED_AT)).toBe(true);
    await renderWith(coachedRoutine(), <TrainingRoutineRoute />);
    expect(screen.getByTestId('training-routine-changed-by')).toHaveTextContent(
      'Ana changed your routine · 2 Oct',
    );
    expect(isRoutineChangeUnseen('r1', CHANGED_AT)).toBe(false);
  });

  it('a day shows who changed an exercise, the trainer’s note and "Set by Ana"', async () => {
    const user = userEvent.setup();
    await renderWith(coachedRoutine(), <TrainingRoutineRoute />);
    await openDay(user);
    expect(screen.getByTestId('training-routine-exercise-re1-changed-by')).toHaveTextContent(
      'Changed by Ana · 2 Oct',
    );
    expect(screen.getByTestId('training-routine-exercise-re1-trainer-note')).toHaveTextContent(
      'Ana: knees out, slow eccentric',
    );
    expect(screen.getByTestId('training-routine-exercise-re1')).toHaveTextContent(
      /Next 62\.5 kg × 6\/6\/6 · Set by Ana/,
    );
  });

  it('Remove note saves the routine naming that row', async () => {
    const user = userEvent.setup();
    const save = jest.fn(() => Promise.resolve({}));
    // Remove note is an imperative, version-checked save (no mutation hook).
    const utils = {
      client: { gym: { routine: { save: { mutate: save } }, bootstrap: { query: jest.fn() } } },
      gym: { bootstrap: { invalidate: jest.fn() } },
    };
    trpc.useUtils.mockReturnValue(utils as unknown as ReturnType<typeof trpc.useUtils>);
    await renderWith(coachedRoutine(), <TrainingRoutineRoute />);
    await openDay(user);
    await user.press(screen.getByTestId('training-routine-exercise-re1-trainer-note-remove'));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 3, clearTrainerNoteIds: ['re1'] }),
    );
  });

  it('an uncoached routine shows none of it', async () => {
    const user = userEvent.setup();
    await renderWith(makeBootstrap({ activeRoutine: routine() }), <TrainingRoutineRoute />);
    expect(screen.queryByTestId('training-routine-changed-by')).toBeNull();
    await openDay(user);
    expect(screen.queryByTestId('training-routine-exercise-re1-trainer-note')).toBeNull();
    expect(screen.queryByTestId('training-routine-exercise-re1-changed-by')).toBeNull();
  });
});
