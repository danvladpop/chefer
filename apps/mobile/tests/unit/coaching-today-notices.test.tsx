import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { CoachingNoticeDto, RoutineDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
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

// Gym Today's coaching notices (PRD 2026-10 §4.2, §4.3): the client's unread server notices from their
// trainer — "Ana updated your routine" with what changed (View opens the routine and dismisses), the
// coaching ending, a request's answer — each dismissible on the server; plus the device-local "Carry on
// joining your trainer" after the gym setup a join needed. Flag off: nothing but availability asked.

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

function notice(overrides: Partial<CoachingNoticeDto> = {}): CoachingNoticeDto {
  return {
    id: 'n1',
    kind: 'ROUTINE_UPDATED',
    at: CHANGED_AT,
    read: false,
    other: { id: 'trainer-ana', name: 'Ana', role: 'TRAINER' },
    changes: [
      { kind: 'added', exercise: 'Romanian deadlift' },
      { kind: 'changed', exercise: 'Squat', from: '3×8', to: '4×6' },
    ],
    ...overrides,
  };
}

const mockDismiss = jest.fn();

function setCoaching(opts: { enabled: boolean; status?: unknown; notices?: CoachingNoticeDto[] }) {
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
  trpc.coaching.notices.useQuery.mockReturnValue({
    data: opts.notices ?? [],
    isError: false,
    isLoading: false,
  });
  trpc.coaching.dismissNotice.useMutation.mockReturnValue({
    mutate: mockDismiss,
    isPending: false,
  });
}

function renderToday(active: RoutineDto | null = routine()) {
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
const UNCOACHED = { trainer: null, stopped: null };

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
  it('shows what changed; View opens the routine and dismisses the card', async () => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: COACHED, notices: [notice()] });
    await renderToday();
    expect(screen.getByTestId('coaching-routine-updated-title')).toHaveTextContent(
      'Ana updated your routine',
    );
    expect(screen.getByTestId('coaching-routine-updated-detail')).toHaveTextContent(
      '+ Romanian deadlift · Squat 3×8 → 4×6',
    );
    await user.press(screen.getByTestId('coaching-routine-updated-view'));
    expect(router.push).toHaveBeenCalledWith('/routine');
    expect(mockDismiss).toHaveBeenCalledWith({ id: 'n1' });
  });

  it('Dismiss marks it read on the server without opening anything', async () => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: COACHED, notices: [notice()] });
    await renderToday();
    await user.press(screen.getByTestId('coaching-routine-updated-dismiss'));
    expect(mockDismiss).toHaveBeenCalledWith({ id: 'n1' });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a read notice, or one from a client (the trainer side), shows nothing', async () => {
    setCoaching({
      enabled: true,
      status: COACHED,
      notices: [
        notice({ read: true }),
        notice({ id: 'n2', other: { id: 'maria', name: 'Maria', role: 'CLIENT' } }),
      ],
    });
    await renderToday();
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
  });

  it('flag off: no notice, and neither coaching.status nor coaching.notices is enabled', async () => {
    setCoaching({ enabled: false, notices: [notice()] });
    await renderToday();
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
    const calls = [
      ...(trpc.coaching.status.useQuery.mock.calls as unknown[][]),
      ...(trpc.coaching.notices.useQuery.mock.calls as unknown[][]),
    ];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call[1]).toMatchObject({ enabled: false });
  });
});

describe('Today: the coaching ended, and a request’s answer', () => {
  it.each([
    [
      notice({ kind: 'COACHING_ENDED', endedBy: 'TRAINER', changes: undefined }),
      'Ana stopped coaching you. Your routine stays yours.',
    ],
    [
      notice({
        kind: 'COACHING_ENDED',
        endedBy: 'SYSTEM',
        other: { id: null, name: 'your trainer', role: 'TRAINER' },
      }),
      'Your trainer stopped using Chefer. Your routine stays yours.',
    ],
    [
      notice({ kind: 'COACHING_ENDED', endedBy: 'SYSTEM' }),
      'Ana stopped coaching you. Your routine stays yours.',
    ],
    [notice({ kind: 'REQUEST_ACCEPTED' }), 'Ana is now your trainer'],
    [notice({ kind: 'REQUEST_DECLINED' }), 'Ana can’t take you on right now'],
  ])('notice %#: reads its line and can be dismissed', async (n, text) => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: UNCOACHED, notices: [n] });
    await renderToday();
    const testID = `coaching-notice-${n.kind.toLowerCase()}`;
    expect(screen.getByTestId(`${testID}-title`)).toHaveTextContent(text);
    expect(screen.queryByTestId(`${testID}-view`)).toBeNull();
    await user.press(screen.getByTestId(`${testID}-dismiss`));
    expect(mockDismiss).toHaveBeenCalledWith({ id: 'n1' });
  });

  it('the client’s own leaving is not news to them', async () => {
    setCoaching({
      enabled: true,
      status: UNCOACHED,
      notices: [notice({ kind: 'COACHING_ENDED', endedBy: 'CLIENT' })],
    });
    await renderToday();
    expect(screen.queryByTestId('coaching-notices')).toBeNull();
  });
});

describe('Today: "Carry on joining your trainer"', () => {
  it('shows after gym setup, opens the invite, and can be dismissed', async () => {
    const user = userEvent.setup();
    setCoaching({ enabled: true, status: UNCOACHED });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderToday();
    expect(screen.getByText('Carry on joining your trainer')).toBeTruthy();
    await user.press(screen.getByTestId('coaching-carry-on-link'));
    expect(router.push).toHaveBeenCalledWith('/coaching/join/ABCD234567');
    await user.press(screen.getByTestId('coaching-carry-on-dismiss'));
    expect(screen.queryByTestId('coaching-carry-on')).toBeNull();
    expect(kv.getString(KV_KEYS.coachingPendingJoin)).toBeNull();
  });

  it('is not offered once the client already has a trainer', async () => {
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderToday();
    expect(screen.queryByTestId('coaching-carry-on')).toBeNull();
  });

  it('is not offered with the flag off', async () => {
    setCoaching({ enabled: false });
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderToday();
    expect(screen.queryByTestId('coaching-carry-on')).toBeNull();
  });

  it('also shows on the "set up your training" empty state', async () => {
    setCoaching({ enabled: true, status: UNCOACHED });
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
