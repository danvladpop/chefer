import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { getQueryKey } from '@trpc/react-query';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerRoutineRoute from '../../app/trainer/[clientId]/routine';
import { trpc } from '../../src/lib/trpc';
import { makeQueryClient, renderWithTrpc, trpcError } from './friends-core-harness';
import {
  LIBRARY,
  MARIA,
  nextTarget,
  settle,
  trainerHandlers,
  trainerRoutine,
} from './trainer-fixtures';

// WP-18 lane C: the trainer's routine editor for one client (spec §2.5, §6, §9): the shared DayEditor in
// trainer mode, "Note for Maria", "Changed by Maria", next-session targets, the curated-only picker, the
// version-checked save and the conflict dialog naming the client.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-crypto', () => {
  let n = 8000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { replace: jest.Mock } }>('expo-router');

const STAMP = { name: 'Maria', at: '2026-10-03T09:00:00.000Z' };
const row = (id: string) => `routine-editor-day-d1-exercise-${id}`;

function routineHandlers(overrides = {}) {
  return trainerHandlers({
    'trainer.client.routine': () => trainerRoutine(),
    'gym.library.list': () => LIBRARY,
    ...overrides,
  });
}

type SavedInput = {
  clientId: string;
  expectedVersion: number;
  routine: { days: { exercises: Record<string, unknown>[] }[] };
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('the editor', () => {
  it('loads the client’s routine, highlights the next day and shows "Changed by Maria" only on her rows', async () => {
    const dto = trainerRoutine({ lastEditedByOther: STAMP });
    const first = dto.days[0]?.exercises[0];
    if (first) first.lastEditedByOther = STAMP;
    await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.routine': () => dto }),
    );
    await settle();
    expect(screen.getByTestId('trainer-routine-header-title')).toHaveTextContent('Maria’s routine');
    expect(screen.getByTestId('trainer-routine-next-day-d1')).toHaveTextContent(
      'Next: Upper · planned Thu',
    );
    expect(screen.getByTestId('trainer-routine-changed-by')).toHaveTextContent(
      'Routine changed by Maria · 3 Oct',
    );
    expect(screen.getByTestId(`${row('e1')}-changed-by`)).toHaveTextContent(
      'Changed by Maria · 3 Oct',
    );
    expect(screen.queryByTestId(`${row('e2')}-changed-by`)).toBeNull();
    expect(screen.getByTestId(`${row('e1')}-name`)).toHaveAccessibleName(
      'Barbell Bench Press, view exercise',
    );
  });

  it('a trainer note and a swapped set count are saved version-checked, with no client notes', async () => {
    const user = userEvent.setup();
    const saved = trainerRoutine({ version: 5 });
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.saveRoutine': () => saved }),
    );
    await settle();
    expect(screen.getByTestId('trainer-routine-save')).toBeDisabled();

    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    const input = screen.getByTestId(`${row('e1')}-trainer-note-input`);
    expect(input.props.accessibilityLabel).toBe('Note for Maria');
    await fireEvent.changeText(input, 'Knees out, slow eccentric');
    await user.press(screen.getByTestId(`${row('e1')}-sets-inc`));
    expect(screen.getByTestId('trainer-routine-dirty')).toBeTruthy();

    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    const call = r.calls.find((c) => c.path === 'trainer.client.saveRoutine');
    const sent = call?.input as SavedInput;
    expect(sent.clientId).toBe(MARIA);
    expect(sent.expectedVersion).toBe(4);
    const bench = sent.routine.days[0]?.exercises[0];
    expect(bench).toMatchObject({
      id: 'e1',
      exerciseId: 'bench',
      sets: 5,
      trainerNote: 'Knees out, slow eccentric',
    });
    expect(sent.routine.days[0]?.exercises[1]).toMatchObject({ id: 'e2', trainerNote: null });
    expect(JSON.stringify(sent)).not.toContain('"notes"');
    // After the save the draft is clean again.
    await waitFor(() => expect(screen.queryByTestId('trainer-routine-dirty')).toBeNull());
  });

  it('the picker offers Chefer’s exercises only (the client’s custom exercise is hidden)', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.saveRoutine': () => trainerRoutine({ version: 5 }) }),
    );
    await settle();
    await user.press(screen.getByTestId('routine-editor-day-d1-add-exercise'));
    expect(screen.getByTestId('trainer-routine-picker-curated-only')).toBeTruthy();
    expect(screen.queryByText('Maria Custom Lift')).toBeNull();
    // Already in the day: hidden; a new one is pickable and saved as a new row (no id).
    expect(screen.queryByTestId('trainer-routine-picker-item-bench')).toBeNull();
    await user.press(screen.getByTestId('trainer-routine-picker-item-squat'));
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    const sent = r.calls.find((c) => c.path === 'trainer.client.saveRoutine')?.input as SavedInput;
    const added = sent.routine.days[0]?.exercises[2];
    expect(added).toMatchObject({ exerciseId: 'squat', trainerNote: null });
    expect(added).not.toHaveProperty('id');
  });

  it('shows "Needs a connection" offline instead of an endless spinner', async () => {
    // The gate's answers are already known (cached); only the routine itself needs the network.
    const queryClient = makeQueryClient();
    queryClient.setQueryData(getQueryKey(trpc.coaching.availability, undefined, 'query'), {
      enabled: true,
      canBeTrainer: true,
    });
    queryClient.setQueryData(getQueryKey(trpc.trainer.status, undefined, 'query'), {
      canActivate: true,
      active: true,
      displayName: 'Ana',
    });
    onlineManager.setOnline(false);
    await renderWithTrpc(<TrainerRoutineRoute />, routineHandlers(), queryClient);
    await settle();
    expect(screen.getByTestId('trainer-routine-offline')).toBeTruthy();
  });

  it('a client with no active routine can be given one (3 days)', async () => {
    const user = userEvent.setup();
    const created = trainerRoutine({ version: 1 });
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'trainer.client.routine': () => null,
        'trainer.client.createRoutine': () => created,
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-routine-none')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-routine-create'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.client.createRoutine')?.input).toEqual({
      clientId: MARIA,
      days: 3,
    });
    expect(screen.getByTestId('trainer-routine')).toBeTruthy();
  });

  it('a removed client is "not available", not an error', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'trainer.client.routine': () => {
          throw trpcError('NOT_FOUND', 404, {}, 'This client isn’t available');
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-routine-unavailable')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-routine-unavailable-back'));
    expect(router.replace).toHaveBeenCalledWith('/trainer');
  });
});

describe('next session', () => {
  it('reads: app suggestion / set by you / set by the client, plus "Last done"', async () => {
    const dto = trainerRoutine();
    const [bench, row2] = dto.days[0]?.exercises ?? [];
    if (!bench || !row2) throw new Error('fixture');
    bench.next = nextTarget();
    row2.next = nextTarget({
      repBucket: '10-12',
      override: {
        weightKg: 50,
        reps: [10, 10, 10],
        at: '2026-10-03T08:00:00.000Z',
        setBy: 'CLIENT',
      },
      lastDoneDate: '2026-09-30',
    });
    await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.routine': () => dto }),
    );
    await settle();
    expect(screen.getByTestId('trainer-routine-next-e1-value')).toHaveTextContent(
      '60 kg × 8, 8, 8 · app suggestion',
    );
    expect(screen.queryByTestId('trainer-routine-next-e1-last-done')).toBeNull();
    expect(screen.getByTestId('trainer-routine-next-e2-value')).toHaveTextContent(
      '50 kg × 10, 10, 10 · set by the client 3 Oct',
    );
    expect(screen.getByTestId('trainer-routine-next-e2-last-done')).toHaveTextContent(
      'Last done 30 Sep',
    );
  });

  it('Adjust opens the override sheet, saves a target for the client and then reads "set by you"', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'trainer.client.setNextTarget': (input: unknown) => {
          const i = input as { weightKg: number; reps: number[]; repBucket: string };
          return nextTarget({
            repBucket: i.repBucket,
            override: {
              weightKg: i.weightKg,
              reps: i.reps,
              at: '2026-10-04T08:00:00.000Z',
              setBy: 'TRAINER',
            },
          });
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-routine-next-e1-adjust'));
    expect(screen.getByTestId('trainer-routine-override-description')).toHaveTextContent(
      'Applies the next time Maria does Barbell Bench Press (6–8 reps).',
    );
    // Reset is disabled while there is no pending target.
    expect(screen.getByTestId('trainer-routine-override-reset')).toBeDisabled();
    expect(screen.getByText('Reset to app suggestion')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-routine-override-weight-inc'));
    await user.press(screen.getByTestId('trainer-routine-override-save'));
    await settle();
    const sent = r.calls.find((c) => c.path === 'trainer.client.setNextTarget')?.input as {
      clientId: string;
      exerciseId: string;
      repBucket: string;
      weightKg: number;
      reps: number[];
    };
    expect(sent).toMatchObject({ clientId: MARIA, exerciseId: 'bench', repBucket: '6-8' });
    expect(sent.weightKg).toBeGreaterThan(60);
    expect(sent.reps).toEqual([8, 8, 8]);
    // The sheet closed and the line now says who set it.
    expect(screen.queryByTestId('trainer-routine-override')).toBeNull();
    expect(screen.getByTestId('trainer-routine-next-e1-value')).toHaveTextContent(
      /set by you 4 Oct$/,
    );
  });

  it('Reset to app suggestion clears the pending target', async () => {
    const user = userEvent.setup();
    const dto = trainerRoutine();
    const bench = dto.days[0]?.exercises[0];
    if (!bench) throw new Error('fixture');
    bench.next = nextTarget({
      override: {
        weightKg: 62.5,
        reps: [6, 6, 6, 6],
        at: '2026-10-02T08:00:00.000Z',
        setBy: 'TRAINER',
      },
    });
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'trainer.client.routine': () => dto,
        'trainer.client.clearNextTarget': () => nextTarget(),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-routine-next-e1-value')).toHaveTextContent(
      '62.5 kg × 6, 6, 6, 6 · set by you 2 Oct',
    );
    await user.press(screen.getByTestId('trainer-routine-next-e1-adjust'));
    await user.press(screen.getByTestId('trainer-routine-override-reset'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.client.clearNextTarget')?.input).toEqual({
      clientId: MARIA,
      exerciseId: 'bench',
      repBucket: '6-8',
    });
    expect(screen.getByTestId('trainer-routine-next-e1-value')).toHaveTextContent(
      '60 kg × 8, 8, 8 · app suggestion',
    );
  });

  it('unsaved edits disable Adjust until the routine is saved', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<TrainerRoutineRoute />, routineHandlers());
    await settle();
    expect(screen.getByTestId('trainer-routine-next-e1-adjust')).toBeEnabled();
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    await user.press(screen.getByTestId(`${row('e1')}-sets-inc`));
    expect(screen.getByTestId('trainer-routine-next-e1-adjust')).toBeDisabled();
    expect(screen.getByTestId('trainer-routine-save-first')).toBeTruthy();
  });
});

describe('conflict', () => {
  function conflictCurrent() {
    return {
      id: 'r1',
      name: 'Maria routine (client edit)',
      templateKey: null,
      isActive: true,
      nextDayId: 'd1',
      version: 6,
      archived: false,
      updatedAt: '2026-10-04T08:00:00.000Z',
      lastEditedByOther: { name: 'Maria', at: '2026-10-04T08:00:00.000Z' },
      days: [
        {
          id: 'd1',
          position: 0,
          name: 'Upper (client)',
          plannedWeekday: 3,
          exercises: [],
        },
      ],
    };
  }

  async function renderConflicting() {
    let attempts = 0;
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'trainer.client.saveRoutine': () => {
          attempts += 1;
          if (attempts === 1) {
            throw trpcError('CONFLICT', 409, {
              conflict: { kind: 'routine', current: conflictCurrent() },
            });
          }
          return trainerRoutine({ version: 7 });
        },
      }),
    );
    await settle();
    const user = userEvent.setup();
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    await user.press(screen.getByTestId(`${row('e1')}-sets-inc`));
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    return { r, user };
  }

  it('names the client; Keep mine re-saves on the newer version', async () => {
    const { r, user } = await renderConflicting();
    expect(screen.getByTestId('trainer-routine-conflict-message')).toHaveTextContent(
      /^Maria changed this routine while you were editing\./,
    );
    await user.press(screen.getByTestId('trainer-routine-conflict-keep-mine'));
    await settle();
    const saves = r.calls.filter((c) => c.path === 'trainer.client.saveRoutine');
    expect(saves).toHaveLength(2);
    expect((saves[0]?.input as SavedInput).expectedVersion).toBe(4);
    expect((saves[1]?.input as SavedInput).expectedVersion).toBe(6);
    // Both saves carry the trainer's own edit (5 sets).
    expect((saves[1]?.input as SavedInput).routine.days[0]?.exercises[0]).toMatchObject({
      sets: 5,
    });
  });

  it('Use the other version reloads the client’s copy and discards the local edit', async () => {
    const { r, user } = await renderConflicting();
    await user.press(screen.getByTestId('trainer-routine-conflict-use-theirs'));
    await settle();
    expect(screen.queryByTestId('trainer-routine-conflict')).toBeNull();
    expect(screen.getByTestId('routine-editor-day-d1-name').props.value).toBe('Upper (client)');
    expect(screen.queryByTestId('trainer-routine-dirty')).toBeNull();
    // Only the first save went out.
    expect(r.calls.filter((c) => c.path === 'trainer.client.saveRoutine')).toHaveLength(1);
  });
});

describe('Fill from one of my routines', () => {
  const mineRow = (id: string, exerciseId: string, extra = {}) => ({
    id,
    exerciseId,
    position: 0,
    sets: 5,
    repMin: 3,
    repMax: 5,
    targetRir: 1,
    restSec: 240,
    supersetGroup: null,
    notes: 'my private note',
    trainerNote: 'should not be copied',
    ...extra,
  });
  const mine = {
    id: 'm1',
    name: 'My Strength',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 9,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    days: [
      {
        id: 'md1',
        position: 0,
        name: 'Squat day',
        plannedWeekday: 1,
        exercises: [mineRow('m-e1', 'squat'), mineRow('m-e2', 'mine', { position: 1 })],
      },
    ],
  };

  it('copies the trainer\u2019s routine as new rows (curated exercises only), then saves version-checked', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'gym.routine.list': () => [
          {
            id: 'm1',
            name: 'My Strength',
            templateKey: null,
            isActive: true,
            dayCount: 1,
            archived: false,
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        'gym.routine.get': () => mine,
        'trainer.client.saveRoutine': () => trainerRoutine({ version: 5 }),
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-routine-fill'));
    await settle();
    await user.press(screen.getByTestId('trainer-fill-m1'));
    await settle();
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent(
      'Copied 1 exercises. 1 custom exercises were skipped.',
    );
    expect(screen.getByTestId('trainer-routine-dirty')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    const sent = r.calls.find((c) => c.path === 'trainer.client.saveRoutine')?.input as SavedInput;
    // The client's routine id and version stay; the copied day and row are new (no ids).
    expect(sent.expectedVersion).toBe(4);
    const day = sent.routine.days[0] as {
      name: string;
      id?: string;
      exercises: Record<string, unknown>[];
    };
    expect(day.name).toBe('Squat day');
    expect(day).not.toHaveProperty('id');
    expect(day.exercises).toHaveLength(1);
    expect(day.exercises[0]).toMatchObject({ exerciseId: 'squat', sets: 5, trainerNote: null });
    expect(day.exercises[0]).not.toHaveProperty('id');
    expect(JSON.stringify(sent)).not.toContain('my private note');
    expect(JSON.stringify(sent)).not.toContain('should not be copied');
  });

  it('Undo restores the previous draft', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'gym.routine.list': () => [
          {
            id: 'm1',
            name: 'My Strength',
            templateKey: null,
            isActive: true,
            dayCount: 1,
            archived: false,
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        'gym.routine.get': () => mine,
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-routine-fill'));
    await settle();
    await user.press(screen.getByTestId('trainer-fill-m1'));
    await settle();
    await user.press(screen.getByTestId('snackbar-action'));
    expect(screen.queryByTestId('trainer-routine-dirty')).toBeNull();
    expect(screen.getByTestId(`${row('e1')}-toggle`)).toBeTruthy();
  });
});
