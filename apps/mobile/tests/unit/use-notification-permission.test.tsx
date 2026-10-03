import { AppState, Linking } from 'react-native';
import { act, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import { NotificationsOffRow } from '../../src/components/notifications-off-row';
import {
  readNotificationPermission,
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../src/lib/use-notification-permission';

// WP-02 / audit §6.8: one hook for "what does the OS say about notifications",
// re-read when the app comes back to the foreground (after Settings), and one
// standard "Off for Chefer · Open Settings" row.

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
}));
const Notifications = jest.requireMock<{ getPermissionsAsync: jest.Mock }>('expo-notifications');

type AppStateHandler = (state: string) => void;
let appStateHandlers: AppStateHandler[] = [];
const removeSubscription = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: AppStateHandler,
  ) => {
    appStateHandlers.push(handler);
    return { remove: removeSubscription };
  }) as unknown as typeof AppState.addEventListener);
});

const answer = (granted: boolean, status: 'granted' | 'denied' | 'undetermined') =>
  Notifications.getPermissionsAsync.mockResolvedValue({ granted, status, canAskAgain: !granted });

describe('readNotificationPermission', () => {
  it.each([
    [true, 'granted', 'granted'],
    [false, 'denied', 'denied'],
    [false, 'undetermined', 'undetermined'],
  ] as const)('granted=%s status=%s -> %s', async (granted, status, expected) => {
    answer(granted, status);
    await expect(readNotificationPermission()).resolves.toBe(expected);
  });

  it('reads as undetermined when the module throws', async () => {
    Notifications.getPermissionsAsync.mockRejectedValue(new Error('no native module'));
    await expect(readNotificationPermission()).resolves.toBe('undetermined');
  });
});

describe('useNotificationPermission', () => {
  it('reports the OS answer without prompting', async () => {
    answer(false, 'denied');
    const { result } = await renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe('denied'));
  });

  it('re-checks when the app returns to the foreground (back from Settings)', async () => {
    answer(false, 'denied');
    const { result } = await renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe('denied'));

    answer(true, 'granted');
    await act(async () => {
      appStateHandlers.forEach((handler) => handler('active'));
    });
    await waitFor(() => expect(result.current).toBe('granted'));
  });

  it('does not re-check when the app goes to the background', async () => {
    answer(false, 'denied');
    await renderHook(() => useNotificationPermission());
    await waitFor(() => expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1));
    await act(async () => {
      appStateHandlers.forEach((handler) => handler('background'));
    });
    expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('re-reads on refreshNotificationPermission() (after a feature asked)', async () => {
    answer(false, 'undetermined');
    const { result } = await renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe('undetermined'));
    answer(false, 'denied');
    await act(async () => {
      refreshNotificationPermission();
    });
    await waitFor(() => expect(result.current).toBe('denied'));
  });

  it('unsubscribes on unmount', async () => {
    answer(true, 'granted');
    const { unmount } = await renderHook(() => useNotificationPermission());
    await unmount();
    expect(removeSubscription).toHaveBeenCalled();
  });
});

describe('NotificationsOffRow', () => {
  it('says it is off and opens the phone Settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(<NotificationsOffRow />);
    expect(screen.getByTestId('notifications-off-row-message')).toHaveTextContent('Off for Chefer');
    await user.press(screen.getByTestId('notifications-off-row-open-settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
