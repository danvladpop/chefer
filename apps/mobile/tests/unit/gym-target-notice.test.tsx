import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ProgressionDto, Suggestion } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import {
  getTargetNotice,
  resetSessionCorrectionsForTests,
  saveEditedSession,
  setTargetNotice,
} from '../../src/features/gym/offline/session-corrections';
import { TargetChangeNotice } from '../../src/features/gym/today/target-change-notice';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeDoc, makeExercise } from './gym-fixtures';
import { mutationResult } from './gym-trpc-mock';

// UX-44 (T-44.4, PAT-14, AC2): "Next time changed after your edit" — the card
// shows before → after once the correction has synced and the bootstrap was
// refetched; `Keep the old ones` keeps the old targets as the user's overrides.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require, see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof import('./gym-trpc-mock').createTrpcGymMock>>(
    '../../src/lib/trpc',
  );

function suggestion(weightKg: number, reps = [8, 8, 8]): Suggestion {
  return {
    kind: 'hold',
    weightKg,
    reps,
    sets: reps.length,
    reasonCode: 'ADD_REPS',
    inputs: {},
    deltaKg: 0,
    engineVersion: 1,
  };
}

function progression(exerciseId: string, weightKg: number): ProgressionDto {
  return {
    exerciseId,
    repBucket: '6-10',
    state: {} as ProgressionDto['state'],
    override: null,
    suggestion: suggestion(weightKg),
  };
}

const SYNCED_AT = '2026-09-24T10:00:00.000Z';
const AFTER_SYNC = Date.parse(SYNCED_AT) + 1000;
const mutateAsync = jest.fn((_input: unknown) => Promise.resolve({}));

function renderNotice(dataUpdatedAt = AFTER_SYNC) {
  const bootstrap = makeBootstrap({
    library: [makeExercise('bench', 'Barbell Bench Press'), makeExercise('squat', 'Squat')],
    // After the edit: bench 62.5 → 60.
    progressions: [progression('bench', 60), progression('squat', 80)],
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TargetChangeNotice bootstrap={bootstrap} dataUpdatedAt={dataUpdatedAt} />
    </QueryClientProvider>,
  );
}

function seedNotice(over: { syncedAt?: string | null } = {}) {
  setTargetNotice({
    sessionId: 's1',
    kind: 'edit',
    localDate: '2026-09-22',
    before: [
      { exerciseId: 'bench', repBucket: '6-10', suggestion: suggestion(62.5) },
      { exerciseId: 'squat', repBucket: '6-10', suggestion: suggestion(80) },
    ],
    syncedAt: over.syncedAt === undefined ? SYNCED_AT : over.syncedAt,
  });
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetSessionCorrectionsForTests();
  resetSnackbarForTests();
  resetGymOwnerForTests();
  outbox.reload();
  outbox.configure(null);
  setGymOwner('user-a');
  mutateAsync.mockClear();
  trpc.gym.progression.setOverride.useMutation.mockReturnValue(mutationResult({ mutateAsync }));
  jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('TargetChangeNotice', () => {
  it('names the exercise that moved with before → after, and skips the ones that did not', async () => {
    seedNotice();
    await renderNotice();
    expect(screen.getByText('Next time changed after your edit')).toBeOnTheScreen();
    expect(screen.getByText('Barbell Bench Press')).toBeOnTheScreen();
    expect(screen.getByText('62.5 kg')).toBeOnTheScreen();
    expect(screen.getByText('60 kg')).toBeOnTheScreen();
    expect(screen.queryByText('Squat')).toBeNull();
    expect(screen.getByText('Because you edited Tuesday’s sets.')).toBeOnTheScreen();
  });

  it('shows nothing while the correction is still waiting to sync, or before the bootstrap was refetched', async () => {
    seedNotice({ syncedAt: null });
    const first = await renderNotice();
    expect(screen.queryByTestId('gym-today-target-notice')).toBeNull();
    await first.unmount();

    seedNotice();
    await renderNotice(Date.parse(SYNCED_AT) - 5000);
    expect(screen.queryByTestId('gym-today-target-notice')).toBeNull();
  });

  it('AC2: `Keep the old ones` writes the old target back as an override', async () => {
    const user = userEvent.setup();
    seedNotice();
    await renderNotice();
    await user.press(screen.getByTestId('gym-today-target-notice-secondary'));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      exerciseId: 'bench',
      repBucket: '6-10',
      weightKg: 62.5,
      reps: [8, 8, 8],
    });
    await waitFor(() => expect(getTargetNotice()).toBeNull());
  });

  it('`Use the new targets` just answers it', async () => {
    const user = userEvent.setup();
    seedNotice();
    await renderNotice();
    await user.press(screen.getByTestId('gym-today-target-notice-primary'));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(getTargetNotice()).toBeNull();
  });

  it('nothing moved: no card, and the snapshot is dropped', async () => {
    setTargetNotice({
      sessionId: 's1',
      kind: 'delete',
      localDate: '2026-09-22',
      before: [{ exerciseId: 'squat', repBucket: '6-10', suggestion: suggestion(80) }],
      syncedAt: SYNCED_AT,
    });
    await renderNotice();
    expect(screen.queryByTestId('gym-today-target-notice')).toBeNull();
    expect(getTargetNotice()).toBeNull();
  });
});

describe('saveEditedSession notice', () => {
  it('UX-GYM-32: the notice carries the EDITED date, not the session’s old one', async () => {
    // The shared tRPC fake has no `gym.session.get`; the query key only needs its path.
    Object.assign(trpc.gym, {
      session: { get: { _def: () => ({ path: ['gym', 'session', 'get'] }) } },
    });
    const original = makeDoc(1, { localDate: '2026-09-22' });
    const draft = { ...original, localDate: '2026-09-24' };
    const queryClient = new QueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({}));

    await saveEditedSession({ queryClient, original, draft });

    expect(getTargetNotice()?.localDate).toBe('2026-09-24');
  });
});
