import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { clearLocalUserData } from '../../src/features/gym/offline/clear-local-data';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  setNativeRestTimerForTests,
  type NativeRestTimer,
} from '../../src/features/gym/rest-native';
import { resetRestTimerForTests, skipRest, startRest } from '../../src/features/gym/rest-timer';
import { RestTimerBar } from '../../src/features/gym/workout/rest-timer-bar';

// Owner decision 2026-10-23 (C1): on Android 12+, a rest longer than ~3 min can
// ring late unless "Alarms & reminders" is on. The rest sheet asks ONCE per
// device, in context, only when notifications are already allowed — and never
// again after either answer, sign-out included. iOS / old binaries: never.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
const Notifications = jest.requireMock<{ getPermissionsAsync: jest.Mock }>('expo-notifications');

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function fakeNative(needsExact: boolean | undefined) {
  const openExactAlarmSettings = jest.fn(() => true);
  const native: NativeRestTimer = {
    sync: jest.fn(() => Promise.resolve()),
    getState: () => ({ rest: null, lastActionAt: null }),
    addListener: () => ({ remove: () => undefined }),
    ...(needsExact === undefined
      ? {}
      : { needsExactAlarmPermission: () => needsExact, openExactAlarmSettings }),
  };
  setNativeRestTimerForTests(native);
  return { openExactAlarmSettings };
}

async function startARest() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <RestTimerBar />
    </SafeAreaProvider>,
  );
  await act(() => {
    startRest(240, 'se-1');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetRestTimerForTests();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});
afterEach(() => setNativeRestTimerForTests(undefined));

describe('exact rest alarms ask (Android)', () => {
  it('asks once when notifications are allowed and exact alarms are off; Open Settings opens the switch', async () => {
    const { openExactAlarmSettings } = fakeNative(true);
    const user = userEvent.setup();
    await startARest();
    await waitFor(() => expect(screen.getByText(/Alarms & reminders/)).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-rest-permission-allow'));
    expect(openExactAlarmSettings).toHaveBeenCalledTimes(1);

    // The next rest: not asked again.
    await act(() => {
      skipRest();
      startRest(240, 'se-2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/Alarms & reminders/)).toBeNull();
  });

  it('a "Not now" is never asked again, even after signing out', async () => {
    fakeNative(true);
    const user = userEvent.setup();
    await startARest();
    await waitFor(() => expect(screen.getByText(/Alarms & reminders/)).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-rest-permission-dismiss'));

    await clearLocalUserData({ keepGymData: false });
    await act(() => {
      startRest(240, 'se-2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/Alarms & reminders/)).toBeNull();
  });

  it('is not asked when exact alarms are already allowed, on iOS, or on an older binary', async () => {
    for (const needsExact of [false, undefined]) {
      setKvBackendForTests(createMemoryKvBackend());
      fakeNative(needsExact);
      await startARest();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByText(/Alarms & reminders/)).toBeNull();
    }
    setNativeRestTimerForTests(null);
    await startARest();
    expect(screen.queryByText(/Alarms & reminders/)).toBeNull();
  });

  it('is not asked while notifications are off (no alert to make exact)', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    fakeNative(true);
    await startARest();
    // The notification rationale shows instead.
    await waitFor(() =>
      expect(screen.getByText(/Want a buzz when your rest is over/)).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/Alarms & reminders/)).toBeNull();
  });
});
