import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { addDaysLocal, weekStartOf } from '@chefer/utils';
import { localDate } from '../../src/features/gym/offline/ids';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { GymSettingsScreen } from '../../src/features/gym/settings/settings-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeDoc } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// `GymSettingsScreen` (imported above) transitively imports
// `../../src/lib/trpc` BEFORE this file's own `./gym-trpc-mock` import would
// run, so the factory can't reference an imported binding — it has to
// `require()` lazily, right when Jest first asks for the mocked module.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderSettings(queryClient: QueryClient) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <GymSettingsScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

function seedParkedEntry() {
  kv.setJSON(KV_KEYS.outbox, {
    v: 1,
    entries: [
      {
        doc: makeDoc(1, { name: 'Upper A' }),
        ownerId: null,
        enqueuedAt: '2026-09-20T00:00:00.000Z',
        attempts: 2,
        lastError: 'Bad request',
        lastAttemptAt: '2026-09-20T00:00:00.000Z',
        parkedReason: 'rejected: invalid data',
      },
    ],
    lastSyncAt: '2026-09-19T00:00:00.000Z',
    failures: 0,
    nextAttemptAt: null,
    lastError: null,
  });
  outbox.reload();
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  outbox.reload();
  trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.create.useMutation.mockReturnValue(mutationResult());
});

describe('GymSettingsScreen — needs attention', () => {
  it('retrying a parked item clears its parked state', async () => {
    seedParkedEntry();
    const docId = makeDoc(1).id;
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    expect(screen.getByTestId(`gym-settings-parked-${docId}`)).toBeOnTheScreen();
    await user.press(screen.getByTestId(`gym-settings-parked-${docId}-retry`));

    expect(screen.queryByTestId(`gym-settings-parked-${docId}`)).not.toBeOnTheScreen();
    expect(outbox.getState().entries.find((e) => e.doc.id === docId)?.parkedReason).toBeUndefined();
  });

  it('discarding a parked item asks for confirmation, and cancel keeps it', async () => {
    seedParkedEntry();
    const docId = makeDoc(1).id;
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    await user.press(screen.getByTestId(`gym-settings-parked-${docId}-discard`));
    expect(screen.getByText('This workout will be lost.')).toBeOnTheScreen();

    await user.press(screen.getByTestId(`gym-settings-parked-${docId}-discard-cancel`));
    expect(screen.queryByText('This workout will be lost.')).not.toBeOnTheScreen();
    expect(outbox.getState().entries.find((e) => e.doc.id === docId)).toBeDefined();
  });

  it('confirming discard removes the entry for good', async () => {
    seedParkedEntry();
    const docId = makeDoc(1).id;
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    await user.press(screen.getByTestId(`gym-settings-parked-${docId}-discard`));
    await user.press(screen.getByTestId(`gym-settings-parked-${docId}-discard-confirm`));

    expect(screen.queryByTestId(`gym-settings-parked-${docId}`)).not.toBeOnTheScreen();
    expect(outbox.getState().entries.find((e) => e.doc.id === docId)).toBeUndefined();
  });
});

describe('GymSettingsScreen — units and pause', () => {
  it('changing units saves immediately', async () => {
    const mutate = jest.fn();
    trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    await user.press(screen.getByTestId('gym-settings-unit-lb'));
    expect(mutate).toHaveBeenCalledWith({ unit: 'LB' });
  });

  it('starts a pause with the chosen length and reason', async () => {
    const mutate = jest.fn();
    trpc.gym.pause.create.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    await user.press(screen.getByTestId('gym-settings-pause-start'));
    await user.press(screen.getByTestId('gym-settings-pause-reason-vacation'));
    await user.press(screen.getByTestId('gym-settings-pause-confirm'));

    const today = localDate();
    expect(mutate).toHaveBeenCalledWith({
      startDate: today,
      endDate: addDaysLocal(today, 6),
      reason: 'vacation',
    });
  });

  it('shows a paused note instead of the pause action during a paused week', async () => {
    const today = localDate();
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        weeks: [
          { weekStart: weekStartOf(today), goal: 3, sessions: 0, status: 'paused', flexTokens: 0 },
        ],
      }),
    );
    await renderSettings(queryClient);
    expect(screen.getByTestId('gym-settings-paused-note')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-pause-start')).not.toBeOnTheScreen();
  });
});
