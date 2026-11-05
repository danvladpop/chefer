import { act, renderHook } from '@testing-library/react-native';
import { PUSH_KINDS, type PushData } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  openPushNotification,
  pushNotificationTarget,
} from '../../src/features/notifications/push/push-links';
import { useNotificationLinks } from '../../src/features/notifications/use-notification-links';
import {
  getShellMode,
  resetShellModeStoreForTests,
  setShellMode,
  setTrainerModeAvailableCache,
} from '../../src/features/trainer-mode/mode-store';

// Trainer mode M4 (trainer-mode.md §5.1 "deep links decide the mode", §7.2 "Opens"): a tapped push
// switches the shell to its kind's mode FIRST, then opens the screen — trainer kinds in trainer mode
// (or personal Trainer tools when trainer mode is not available), personal kinds in personal mode.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));
const mockTrack = jest.fn<undefined, unknown[]>();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));
jest.mock('../../src/features/shell/shell-store', () => ({ isShellV2: () => true }));

type Listener = (response: unknown) => void;
let mockLaunch: unknown = null;
let mockListener: Listener | null = null;
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getLastNotificationResponse: () => mockLaunch,
  addNotificationResponseReceivedListener: (l: Listener) => {
    mockListener = l;
    return { remove: () => undefined };
  },
}));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; replace: jest.Mock; navigate: jest.Mock };
}>('expo-router');

const push = (kind: PushData['kind'], ids: Partial<PushData> = {}): PushData => ({
  app: 'chefer-push',
  kind,
  ...ids,
});

/** Every router call in order, as `method:href`. */
const nav = () =>
  (['push', 'replace', 'navigate'] as const)
    .flatMap((m) =>
      router[m].mock.calls.map((c: [string], i: number) => ({
        order: router[m].mock.invocationCallOrder[i] ?? 0,
        call: `${m}:${c[0]}`,
      })),
    )
    .sort((a, b) => a.order - b.order)
    .map((x) => x.call);

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetShellModeStoreForTests();
  mockLaunch = null;
  mockListener = null;
});

describe('pushNotificationTarget', () => {
  it('reads a Chefer push (ids only); anything else is not one', () => {
    expect(pushNotificationTarget(push('BOOKING_REMINDER_CLIENT', { bookingId: 'b1' }))).toEqual(
      push('BOOKING_REMINDER_CLIENT', { bookingId: 'b1' }),
    );
    expect(
      pushNotificationTarget({ app: 'booking-reminder', role: 'client', bookingId: 'b1' }),
    ).toBeNull();
    expect(pushNotificationTarget({ app: 'chefer-push', kind: 'NOPE' })).toBeNull();
    expect(pushNotificationTarget(null)).toBeNull();
  });
});

describe('openPushNotification: trainer kinds (trainer mode available)', () => {
  beforeEach(() => {
    setTrainerModeAvailableCache(true);
    setShellMode('personal');
  });

  it.each(['COACHING_REQUEST_RECEIVED', 'COACHING_ENDED_FOR_TRAINER'] as const)(
    '%s: switches to trainer mode, landing on Clients',
    (kind) => {
      openPushNotification(push(kind, { clientId: 'c1' }));
      expect(getShellMode()).toBe('trainer');
      expect(nav()).toEqual(['replace:/(trainer)/clients']);
      expect(mockTrack).toHaveBeenCalledWith('push_opened', { kind });
    },
  );

  it('already in trainer mode: goes to the Clients tab', () => {
    setShellMode('trainer');
    openPushNotification(push('COACHING_REQUEST_RECEIVED'));
    expect(nav()).toEqual(['navigate:/(trainer)/clients']);
  });

  it('BOOKING_REMINDER_TRAINER: trainer mode first, then the booking', () => {
    openPushNotification(push('BOOKING_REMINDER_TRAINER', { bookingId: 'tb1' }));
    expect(getShellMode()).toBe('trainer');
    expect(nav()).toEqual(['replace:/(trainer)/today', 'push:/trainer/bookings/tb1']);
  });
});

describe('openPushNotification: trainer kinds without trainer mode (personal fallback)', () => {
  beforeEach(() => {
    setTrainerModeAvailableCache(false);
    setShellMode('trainer');
  });

  it('a request opens Trainer tools in personal mode', () => {
    openPushNotification(push('COACHING_REQUEST_RECEIVED'));
    expect(getShellMode()).toBe('personal');
    expect(nav()).toEqual(['replace:/home', 'push:/trainer']);
  });

  it('a booking reminder opens the booking in personal mode', () => {
    openPushNotification(push('BOOKING_REMINDER_TRAINER', { bookingId: 'tb1' }));
    expect(getShellMode()).toBe('personal');
    expect(nav()).toEqual(['replace:/home', 'push:/trainer/bookings/tb1']);
  });
});

describe('openPushNotification: personal kinds', () => {
  beforeEach(() => {
    setTrainerModeAvailableCache(true);
    setShellMode('trainer');
  });

  it.each([
    ['COACHING_REQUEST_ANSWERED', {}, ['replace:/home', 'push:/coaching']],
    ['ROUTINE_CHANGED_BY_TRAINER', {}, ['replace:/home', 'navigate:/train']],
    [
      'BOOKING_CHANGED_FOR_CLIENT',
      { bookingId: 'cb1' },
      ['replace:/home', 'push:/coaching/bookings/cb1'],
    ],
    [
      'BOOKING_REMINDER_CLIENT',
      { bookingId: 'cb2' },
      ['replace:/home', 'push:/coaching/bookings/cb2'],
    ],
    [
      'COACHED_WORKOUT_LOGGED',
      { workoutSessionId: 'ws1' },
      ['replace:/home', 'push:/gym/session/ws1'],
    ],
    ['SOCIAL_FOLLOW', {}, ['replace:/home', 'push:/friends/activity']],
  ] as const)('%s: personal mode first, then its screen', (kind, ids, expected) => {
    openPushNotification(push(kind, ids));
    expect(getShellMode()).toBe('personal');
    expect(nav()).toEqual(expected);
    expect(mockTrack).toHaveBeenCalledWith('push_opened', { kind });
  });

  it('already in personal mode: no shell switch', () => {
    setShellMode('personal');
    openPushNotification(push('SOCIAL_FOLLOW'));
    expect(nav()).toEqual(['push:/friends/activity']);
  });

  it('a booking kind without an id falls back to Your trainer', () => {
    openPushNotification(push('BOOKING_CHANGED_FOR_CLIENT'));
    expect(nav()).toEqual(['replace:/home', 'push:/coaching']);
  });

  it('every push kind routes somewhere', () => {
    for (const kind of PUSH_KINDS) {
      jest.clearAllMocks();
      openPushNotification(push(kind, { bookingId: 'b', workoutSessionId: 'w' }));
      expect(nav().length).toBeGreaterThan(0);
    }
  });
});

describe('useNotificationLinks: push taps, cold start and warm, deduped', () => {
  const response = (id: string, data: unknown) => ({
    notification: { date: 1, request: { identifier: id, content: { data } } },
  });

  it('a cold-start tap opens after the stack mounts; the same tap again is ignored', async () => {
    jest.useFakeTimers();
    try {
      setShellMode('personal');
      mockLaunch = response('n1', push('SOCIAL_FOLLOW'));
      await renderHook(() => useNotificationLinks(true));
      expect(router.push).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });
      expect(nav()).toEqual(['push:/friends/activity']);
      await act(() => mockListener?.(mockLaunch));
      expect(router.push).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a warm tap routes through the mode rule; signed out does nothing', async () => {
    setTrainerModeAvailableCache(true);
    setShellMode('personal');
    const { rerender } = await renderHook(
      ({ signedIn }: { signedIn: boolean }) => useNotificationLinks(signedIn),
      { initialProps: { signedIn: false } },
    );
    expect(mockListener).toBeNull();
    await rerender({ signedIn: true });
    await act(() => mockListener?.(response('n2', push('COACHING_REQUEST_RECEIVED'))));
    expect(getShellMode()).toBe('trainer');
    expect(nav()).toEqual(['replace:/(trainer)/clients']);
  });
});
