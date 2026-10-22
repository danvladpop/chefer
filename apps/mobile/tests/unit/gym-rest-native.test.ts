import { AppState, type AppStateStatus } from 'react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  setNativeRestTimerForTests,
  type NativeRest,
  type NativeRestState,
  type NativeRestTimer,
} from '../../src/features/gym/rest-native';
import {
  adjustRest,
  getRestTimer,
  resetRestTimerForTests,
  skipRest,
  startRest,
  startRestNotifications,
  syncNotification,
} from '../../src/features/gym/rest-timer';

// C1: on a binary with the chefer-rest-timer module, the module owns the
// lock-screen countdown and the "Rest is over" alert; lock-screen +30 s / Skip
// flow back into the JS rest. Old binaries keep the expo-notifications path
// (gym-rest-timer.test.tsx).

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
}>('expo-notifications');

const NOW = new Date(2026, 9, 22, 18, 0, 0).getTime();

function fakeNative(initial: NativeRestState = { rest: null, lastActionAt: null }) {
  let state = initial;
  const listeners = new Set<(s: NativeRestState) => void>();
  const sync = jest.fn<Promise<void>, [NativeRest | null]>((rest) => {
    state = { ...state, rest };
    return Promise.resolve();
  });
  const native: NativeRestTimer = {
    sync,
    getState: () => state,
    addListener: (_event, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  /** What the module does when +30 s / Skip is tapped on the lock screen. */
  const lockScreen = (rest: NativeRest | null, at: number, emit = true) => {
    state = { rest, lastActionAt: at };
    if (emit) listeners.forEach((l) => l(state));
  };
  return { native, sync, lockScreen, listenerCount: () => listeners.size };
}

let appStateListener: ((status: AppStateStatus) => void) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  setKvBackendForTests(createMemoryKvBackend());
  resetRestTimerForTests();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: () => (appStateListener = null) };
  });
});
afterEach(() => {
  setNativeRestTimerForTests(undefined);
  jest.useRealTimers();
});

describe('rest timer on a binary with the native module', () => {
  it('hands every rest change to the module and never schedules through expo-notifications', async () => {
    const { native, sync } = fakeNative();
    setNativeRestTimerForTests(native);

    startRest(90, 'se-1');
    await syncNotification();
    expect(sync).toHaveBeenLastCalledWith({ endsAt: NOW + 90_000, durationSec: 90, label: null });

    adjustRest(15);
    await syncNotification();
    expect(sync).toHaveBeenLastCalledWith({ endsAt: NOW + 105_000, durationSec: 105, label: null });

    skipRest();
    await syncNotification();
    expect(sync).toHaveBeenLastCalledWith(null);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('applies a lock-screen +30 s while JS is running', () => {
    const { native, lockScreen } = fakeNative();
    setNativeRestTimerForTests(native);
    const stop = startRestNotifications();
    startRest(90, 'se-1');

    lockScreen({ endsAt: NOW + 120_000, durationSec: 120, label: null }, NOW + 1);
    expect(getRestTimer()).toEqual({ endsAt: NOW + 120_000, durationSec: 120, seId: 'se-1' });
    stop();
  });

  it('applies a lock-screen Skip taken while JS was suspended, on the next foreground, once', async () => {
    const { native, lockScreen, sync } = fakeNative();
    setNativeRestTimerForTests(native);
    const stop = startRestNotifications();
    startRest(90, 'se-1');

    lockScreen(null, NOW + 5_000, false); // no live event: JS was suspended
    expect(getRestTimer()).not.toBeNull();
    appStateListener?.('active');
    expect(getRestTimer()).toBeNull();

    // A rest started later is not undone by re-reading the same action.
    startRest(60, 'se-2');
    await syncNotification();
    sync.mockClear();
    appStateListener?.('active');
    expect(getRestTimer()?.seId).toBe('se-2');
    stop();
  });

  it('ignores the module state when nothing was tapped on the lock screen', () => {
    // e.g. a native sync that failed: the JS rest wins.
    const { native } = fakeNative({ rest: null, lastActionAt: null });
    setNativeRestTimerForTests(native);
    startRest(90, 'se-1');
    const stop = startRestNotifications();
    appStateListener?.('active');
    expect(getRestTimer()?.endsAt).toBe(NOW + 90_000);
    stop();
  });

  it('stops listening to the module when stopped', () => {
    const fake = fakeNative();
    setNativeRestTimerForTests(fake.native);
    const stop = startRestNotifications();
    expect(fake.listenerCount()).toBe(1);
    stop();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe('rest timer on an older binary (no native module)', () => {
  it('keeps scheduling the alert through expo-notifications', async () => {
    setNativeRestTimerForTests(null);
    Notifications.scheduleNotificationAsync.mockResolvedValue('n1');
    startRest(90, 'se-1');
    await syncNotification();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
