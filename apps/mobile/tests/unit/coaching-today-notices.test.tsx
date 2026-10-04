import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { RoutineDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { markRoutineSeen } from '../../src/features/coaching/seen-markers';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { TodayScreen } from '../../src/features/gym/today/today-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// WP-18 lane D: Gym Today's one-line coaching notices (spec §2.6, §2.7): "Ana updated your routine · 2 Oct"
// until the routine is opened on this device, "Ana stopped coaching you" (dismissible), "Carry on joining
// your trainer" after the gym setup a join needed. Flag off: nothing, and nothing but availability asked.

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

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const CHANGED_AT = '2026-10-02T09:00:00.000Z';

function routine(extra: Partial<RoutineDto> = {}): RoutineDto {
  return {
    id: 'r1',
    name: 'My Routine',
    templateKey: null,
    isActive: true,
    nextDayId: 'd1',
    version: 1,
    archived: false,
    updatedAt: CHANGED_AT,
    days: [{ id: 'd1', position: 0, name: 'Upper A', plannedWeekday: 0, exercises: [] }],
    ...extra,
  };
}

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

function renderToday(active: RoutineDto | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({ activeRoutine: active, coaching: { trainerName: 'Ana' } }),
  );
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <TodayScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const COACHED = { trainer: { name: 'Ana', since: CHANGED_AT }, stopped: null };

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  setKvBackendForTests(createMemoryKvBackend());
  activeSessionStore.clear();
  resetGymOwnerForTests();
  resetSnackbarForTests();
  outbox.reload();
  trpc.gym.routine.setNextDay.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.dismissOffer.useMutation.mockReturnValue(mutationResult());
  trpc.gym.progression.startDeload.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
  setCoaching({ enabled: true, status: COACHED });
});
afterEach(() => jest.restoreAllMocks());

describe('Today: "Ana updated your routine"', () => {
  it('shows once, opens the routine, and is gone after the routine was opened', async () => {
    const user = userEvent.setup();
    await renderToday(routine({ lastEditedByOther: { name: 'Ana', at: CHANGED_AT } }));
    expect(screen.getByTestId('coaching-routine-updated')).toHaveTextContent(
      'Ana updated your routine · 2 Oct',
    );
    await user.press(screen.getByTestId('coaching-routine-updated'));
    expect(router.push).toHaveBeenCalledWith('/routine');

    // The Routine tab calls markRoutineSeen when it opens: the line goes away.
    await act(() => {
      markRoutineSeen('r1', CHANGED_AT);
    });
    expect(screen.queryByTestId('coaching-routine-updated')).toBeNull();
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
  });

  it('a later change by the trainer brings the line back', async () => {
    markRoutineSeen('r1', CHANGED_AT);
    await renderToday(
      routine({ lastEditedByOther: { name: 'Ana', at: '2026-10-03T08:00:00.000Z' } }),
    );
    expect(screen.getByTestId('coaching-routine-updated')).toHaveTextContent(/· 3 Oct$/);
  });

  it('an uncoached routine shows no notice', async () => {
    setCoaching({ enabled: true, status: { trainer: null, stopped: null } });
    await renderToday(routine());
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
  });

  it('flag off: no notice, and coaching.status is not even enabled', async () => {
    setCoaching({ enabled: false });
    await renderToday(routine({ lastEditedByOther: { name: 'Ana', at: CHANGED_AT } }));
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
    const calls = trpc.coaching.status.useQuery.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call[1]).toMatchObject({ enabled: false });
  });
});

describe('Today: "Ana stopped coaching you"', () => {
  const stopped = {
    trainer: null,
    stopped: { trainerName: 'Ana', at: '2026-10-03T10:00:00.000Z' },
  };

  it('shows with the date and can be dismissed', async () => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: stopped });
    await renderToday(routine());
    expect(screen.getByTestId('coaching-stopped')).toHaveTextContent(
      'Ana stopped coaching you · 3 Oct',
    );
    await user.press(screen.getByTestId('coaching-stopped-dismiss'));
    expect(screen.queryByTestId('coaching-stopped')).toBeNull();
    expect(kv.getString(KV_KEYS.coachingStoppedDismissed)).toBe('2026-10-03T10:00:00.000Z');
  });

  it('stays dismissed when Today is opened again', async () => {
    setCoaching({ enabled: true, status: stopped });
    kv.setString(KV_KEYS.coachingStoppedDismissed, '2026-10-03T10:00:00.000Z');
    await renderToday(routine());
    expect(screen.queryByTestId('coaching-stopped')).toBeNull();
  });

  it('a newer "stopped" (a different time) shows again after an older one was dismissed', async () => {
    setCoaching({ enabled: true, status: stopped });
    kv.setString(KV_KEYS.coachingStoppedDismissed, '2026-09-01T10:00:00.000Z');
    await renderToday(routine());
    expect(screen.getByTestId('coaching-stopped')).toBeTruthy();
  });
});

describe('Today: "Carry on joining your trainer"', () => {
  it('shows after gym setup, opens the invite, and can be dismissed', async () => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: { trainer: null, stopped: null } });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderToday(routine());
    expect(screen.getByText('Carry on joining your trainer')).toBeTruthy();
    await user.press(screen.getByTestId('coaching-carry-on-link'));
    expect(router.push).toHaveBeenCalledWith('/coaching/join/ABCD234567');
    await user.press(screen.getByTestId('coaching-carry-on-dismiss'));
    expect(screen.queryByTestId('coaching-carry-on')).toBeNull();
    expect(kv.getString(KV_KEYS.coachingPendingJoin)).toBeNull();
  });

  it('is not offered once the client already has a trainer', async () => {
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderToday(routine());
    expect(screen.queryByTestId('coaching-carry-on')).toBeNull();
  });

  it('is not offered with the flag off', async () => {
    setCoaching({ enabled: false });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderToday(routine());
    expect(screen.queryByTestId('coaching-carry-on')).toBeNull();
  });

  it('also shows on the "set up your training" empty state', async () => {
    setCoaching({ enabled: true, status: { trainer: null, stopped: null } });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>
          <TodayScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('coaching-carry-on')).toBeTruthy();
  });
});
