import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetRestTimerForTests, startRest } from '../../src/features/gym/rest-timer';
import { RestTimerBar } from '../../src/features/gym/workout/rest-timer-bar';

// UX-GYM-11 / audit §6.8: the rest timer's "Allow notifications" button did
// nothing when the OS had notifications denied. It must open Settings then,
// and still ask normally when the OS can prompt.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
}>('expo-notifications');

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderBarWithRest() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <RestTimerBar />
    </SafeAreaProvider>,
  );
  await act(() => {
    startRest(90, 'se-1');
  });
  await waitFor(() => expect(screen.getByTestId('gym-rest-permission-allow')).toBeOnTheScreen());
}

let openSettings: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetRestTimerForTests();
  openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
});

describe('rest timer permission sheet', () => {
  it('opens Settings when notifications were denied earlier and cannot be asked again', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });
    const user = userEvent.setup();
    await renderBarWithRest();

    await user.press(screen.getByTestId('gym-rest-permission-allow'));

    await waitFor(() => expect(openSettings).toHaveBeenCalledTimes(1));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('shows the OS prompt (and not Settings) when the permission can still be asked', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'undetermined',
      canAskAgain: true,
    });
    Notifications.requestPermissionsAsync.mockResolvedValue({ granted: true });
    const user = userEvent.setup();
    await renderBarWithRest();

    await user.press(screen.getByTestId('gym-rest-permission-allow'));

    await waitFor(() => expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    expect(openSettings).not.toHaveBeenCalled();
  });
});
