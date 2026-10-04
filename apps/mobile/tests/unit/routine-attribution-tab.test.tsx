import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ProgressionDto, RoutineDto } from '@chefer/types';
import RoutineScreen from '../../app/(gym)/routine';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// WP-18 lane C: the client's Routine tab shows "<trainer> changed your routine", "Changed by …" on the
// changed rows only, the trainer's note with "Remove note", and "Set by Ana" on a trainer target
// (spec §2.6). Remove note is a version-checked save naming the row in `clearTrainerNoteIds`.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-routine-supersets.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: () => '/routine',
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

type SaveInput = {
  routine: { id: string; days: { exercises: { id?: string }[] }[] };
  expectedVersion: number;
  clearTrainerNoteIds?: string[];
};

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const STAMP = { name: 'Ana', at: '2026-10-02T09:00:00.000Z' };

function row(id: string, exerciseId: string, position: number, extra = {}) {
  return {
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
    ...extra,
  };
}

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'My Routine',
  templateKey: null,
  isActive: true,
  nextDayId: 'd1',
  version: 7,
  archived: false,
  updatedAt: '2026-10-02T09:00:00.000Z',
  lastEditedByOther: STAMP,
  days: [
    {
      id: 'd1',
      position: 0,
      name: 'Upper A',
      plannedWeekday: 0,
      exercises: [
        row('re1', 'bench', 0, { trainerNote: 'Pause on chest', lastEditedByOther: STAMP }),
        row('re2', 'squat', 1),
      ],
    },
  ],
};

function progression(setByName?: string): ProgressionDto {
  return {
    exerciseId: 'bench',
    repBucket: '8-12',
    state: {} as ProgressionDto['state'],
    override: {
      weightKg: 62.5,
      reps: [6, 6, 6],
      at: '2026-10-02T09:00:00.000Z',
      ...(setByName ? { setByName } : {}),
    },
    suggestion: {
      kind: 'hold',
      weightKg: 60,
      reps: [8, 8, 8],
      sets: 3,
      reasonCode: 'USER_OVERRIDE',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
  };
}

const saveMutate = jest.fn((_input: SaveInput) => Promise.resolve({}));
// A variable (not a literal) so the extra `routine.save` path passes the mock's shape check.
const utilsFake = {
  client: { gym: { routine: { save: { mutate: saveMutate } }, bootstrap: { query: jest.fn() } } },
  preferences: { get: { invalidate: jest.fn() } },
  training: { getDayKinds: { setData: jest.fn() } },
  gym: {
    bootstrap: { invalidate: jest.fn() },
    session: { list: { fetch: jest.fn() } },
  },
};

function renderRoutine(routine: RoutineDto, progressions: ProgressionDto[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({ activeRoutine: routine, progressions, coaching: { trainerName: 'Ana' } }),
  );
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <RoutineScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  trpc.gym.progression.setOverride.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.clearOverride.useMutation.mockReturnValue(mutationResult());
  trpc.useUtils.mockReturnValue(utilsFake);
});

describe('Routine tab, client with a trainer', () => {
  it('names the trainer on the routine and on the changed row only, and shows the note', async () => {
    await renderRoutine(ROUTINE);
    expect(screen.getByTestId('gym-routine-changed-by')).toHaveTextContent(
      'Ana changed your routine · 2 Oct',
    );
    expect(screen.getByTestId('routine-exercise-re1-changed-by')).toHaveTextContent(
      'Changed by Ana · 2 Oct',
    );
    expect(screen.getByTestId('routine-exercise-re1-trainer-note')).toHaveTextContent(
      'Ana: Pause on chest',
    );
    expect(screen.queryByTestId('routine-exercise-re2-changed-by')).toBeNull();
    expect(screen.queryByTestId('routine-exercise-re2-trainer-note')).toBeNull();
  });

  it('Remove note saves the routine with clearTrainerNoteIds naming that row', async () => {
    const user = userEvent.setup();
    await renderRoutine(ROUTINE);
    await user.press(screen.getByTestId('routine-exercise-re1-trainer-note-remove'));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    const arg = saveMutate.mock.calls[0]?.[0];
    if (!arg) throw new Error('save was not called');
    expect(arg.expectedVersion).toBe(7);
    expect(arg.clearTrainerNoteIds).toEqual(['re1']);
    expect(arg.routine.days[0]?.exercises.map((e) => e.id)).toEqual(['re1', 're2']);
    expect(JSON.stringify(arg.routine)).not.toContain('trainerNote');
  });

  it('a trainer-set target reads "Set by Ana"; the client’s own reads "Edited"', async () => {
    await renderRoutine(ROUTINE, [progression('Ana')]);
    expect(screen.getByTestId('routine-exercise-re1-edited')).toHaveTextContent('Set by Ana');
  });

  it('an uncoached routine shows no coaching lines and the old "Edited" badge', async () => {
    const plain: RoutineDto = {
      ...ROUTINE,
      days: [
        {
          id: 'd1',
          position: 0,
          name: 'Upper A',
          plannedWeekday: 0,
          exercises: [row('re1', 'bench', 0), row('re2', 'squat', 1)],
        },
      ],
    };
    delete plain.lastEditedByOther;
    await renderRoutine(plain, [progression()]);
    expect(screen.queryByTestId('gym-routine-changed-by')).toBeNull();
    expect(screen.queryByTestId('routine-exercise-re1-changed-by')).toBeNull();
    expect(screen.getByTestId('routine-exercise-re1-edited')).toHaveTextContent('Edited');
  });
});
