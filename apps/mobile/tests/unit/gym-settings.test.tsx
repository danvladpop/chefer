import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { RoutineDto } from '@chefer/types';
import { addDaysLocal, weekdayOf, weekStartOf } from '@chefer/utils';
import { localDate } from '../../src/features/gym/offline/ids';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { GymSettingsScreen } from '../../src/features/gym/settings/settings-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeDoc, profile } from './gym-fixtures';
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
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
  trpc.training.getDayKinds.useQuery.mockReturnValue({ data: {}, isLoading: false });
  trpc.training.setDayKinds.useMutation.mockReturnValue(mutationResult());
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

  it('T-36.2: the quiet-days nudge saves in one tap and reflects the stored value', async () => {
    const mutate = jest.fn();
    trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ profile: { ...profile, quietNudgeDays: 5 } }),
    );
    const user = userEvent.setup();
    await renderSettings(queryClient);

    expect(screen.getByTestId('gym-settings-quiet-nudge-5')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-settings-quiet-nudge-never'));
    expect(mutate).toHaveBeenCalledWith({ quietNudgeDays: null });

    await user.press(screen.getByTestId('gym-settings-quiet-nudge-3'));
    expect(mutate).toHaveBeenLastCalledWith({ quietNudgeDays: 3 });
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

  it('shows an End pause action for the active pause, and calls pause.end with its id', async () => {
    const mutate = jest.fn();
    trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activePause: {
          id: 'pause-1',
          startDate: '2026-09-20',
          endDate: '2026-09-30',
          reason: 'vacation',
        },
      }),
    );
    const user = userEvent.setup();
    await renderSettings(queryClient);

    expect(screen.getByTestId('gym-settings-paused-note')).toBeOnTheScreen();
    // UX-GYM-16: one consistent line with a human date — not "Paused until 2026-09-30".
    expect(screen.getByTestId('gym-settings-paused-note')).toHaveTextContent(
      'Paused through Wed 30 Sep · Vacation',
    );
    expect(screen.queryByTestId('gym-settings-pause-start')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-settings-pause-end'));
    expect(mutate).toHaveBeenCalledWith({ id: 'pause-1' });
  });

  it('UX-GYM-16: the pause sheet explains pausing and offers a start choice', async () => {
    const mutate = jest.fn();
    trpc.gym.pause.create.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    await user.press(screen.getByTestId('gym-settings-pause-start'));
    expect(screen.getByTestId('gym-settings-pause-explainer')).toHaveTextContent(
      /don’t break your streak/,
    );

    await user.press(screen.getByTestId('gym-settings-pause-starting-tomorrow'));
    await user.press(screen.getByTestId('gym-settings-pause-confirm'));
    const tomorrow = addDaysLocal(localDate(), 1);
    expect(mutate).toHaveBeenCalledWith({
      startDate: tomorrow,
      endDate: addDaysLocal(tomorrow, 6),
      reason: null,
    });
  });

  it('UX-GYM-16: "Next Monday" starts on the coming Monday', async () => {
    const mutate = jest.fn();
    trpc.gym.pause.create.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    const user = userEvent.setup();
    await renderSettings(queryClient);

    await user.press(screen.getByTestId('gym-settings-pause-start'));
    await user.press(screen.getByTestId('gym-settings-pause-starting-monday'));
    await user.press(screen.getByTestId('gym-settings-pause-confirm'));
    const input = mutate.mock.calls[0]?.[0] as { startDate: string };
    expect(weekdayOf(input.startDate)).toBe(0);
    expect(input.startDate > localDate()).toBe(true);
  });

  it('UX-GYM-16: a pause that starts later is shown with a Cancel action, not a second Pause button', async () => {
    const mutate = jest.fn();
    trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    const start = addDaysLocal(localDate(), 2);
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        upcomingPause: {
          id: 'pause-2',
          startDate: start,
          endDate: addDaysLocal(start, 6),
          reason: 'injury',
        },
      }),
    );
    const user = userEvent.setup();
    await renderSettings(queryClient);

    expect(screen.getByTestId('gym-settings-paused-note')).toHaveTextContent(/^Starts .*· Injury$/);
    expect(screen.queryByTestId('gym-settings-pause-start')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-settings-pause-end'));
    expect(mutate).toHaveBeenCalledWith({ id: 'pause-2' });
  });
});

describe('GymSettingsScreen — weekday kinds (T-06.9)', () => {
  const ROUTINE: RoutineDto = {
    id: 'r1',
    name: 'Upper/Lower',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 1,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    days: [{ id: 'd1', position: 0, name: 'Upper', plannedWeekday: 0, exercises: [] }], // Monday
  };

  it('shows a lift day (from the routine) as read-only, other days as tappable', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, recentSessions: [] }),
    );
    await renderSettings(queryClient);

    const monday = screen.getByTestId('gym-settings-day-kind-0'); // 0 = Monday, a lift day
    expect(monday).toHaveTextContent(/Lift/);
    expect(monday).toBeDisabled();

    const tuesday = screen.getByTestId('gym-settings-day-kind-1');
    expect(tuesday).toHaveTextContent(/—/);
  });

  it('picking a kind for a non-lift day calls setDayKinds and shows the result', async () => {
    const user = userEvent.setup();
    const mutate = jest.fn();
    trpc.training.setDayKinds.useMutation.mockReturnValue(mutationResult({ mutate }));
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, recentSessions: [] }),
    );
    await renderSettings(queryClient);

    await user.press(screen.getByTestId('gym-settings-day-kind-1')); // Tuesday
    await user.press(screen.getByTestId('gym-settings-day-kind-sheet-long-run'));

    expect(mutate).toHaveBeenCalledWith({ days: { '1': 'long_run' } });
  });

  it('Clear sends null for that weekday', async () => {
    const user = userEvent.setup();
    const mutate = jest.fn();
    trpc.training.setDayKinds.useMutation.mockReturnValue(mutationResult({ mutate }));
    trpc.training.getDayKinds.useQuery.mockReturnValue({ data: { '1': 'run' }, isLoading: false });
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ activeRoutine: ROUTINE, recentSessions: [] }),
    );
    await renderSettings(queryClient);

    expect(screen.getByTestId('gym-settings-day-kind-1')).toHaveTextContent(/Run/);
    await user.press(screen.getByTestId('gym-settings-day-kind-1'));
    await user.press(screen.getByTestId('gym-settings-day-kind-sheet-clear'));

    expect(mutate).toHaveBeenCalledWith({ days: { '1': null } });
  });
});
