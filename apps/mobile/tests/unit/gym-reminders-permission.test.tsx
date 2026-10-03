import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { resetGymReminderPermissionForTests } from '../../src/features/gym/reminders/permission';
import { GymSettingsScreen } from '../../src/features/gym/settings/settings-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, profile } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// UX-GYM-04 (WP-02 lane C): the reminder switch must not say "On" while the OS
// has notifications denied — it goes Off and an "Open Settings" row appears.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted mock factory
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
}>('expo-notifications');

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const os = (
  granted: boolean,
  status: 'granted' | 'denied' | 'undetermined',
  canAskAgain: boolean,
) => Notifications.getPermissionsAsync.mockResolvedValue({ granted, status, canAskAgain });

async function renderSettings(reminderEnabled: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({
      profile: { ...profile, reminderEnabled, reminderTime: reminderEnabled ? '07:00' : null },
    }),
  );
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <GymSettingsScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

let mutate: jest.Mock;

let openSettings: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  resetGymReminderPermissionForTests();
  openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mutate = jest.fn();
  trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult({ mutate }));
  trpc.gym.pause.create.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
  trpc.training.getDayKinds.useQuery.mockReturnValue({ data: {}, isLoading: false });
  trpc.training.setDayKinds.useMutation.mockReturnValue(mutationResult());
});

describe('gym settings — reminders vs notification permission', () => {
  it('saved as On but notifications are denied: shows Off plus an Open Settings row', async () => {
    os(false, 'denied', false);
    const user = userEvent.setup();
    await renderSettings(true);

    expect(await screen.findByTestId('gym-settings-notifications-off')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-reminder-off')).toBeSelected();
    expect(screen.getByTestId('gym-settings-reminder-on')).not.toBeSelected();
    // No time steppers for a reminder that can never fire.
    expect(screen.queryByTestId('gym-settings-reminder-hour')).toBeNull();

    await user.press(screen.getByTestId('gym-settings-notifications-off-open-settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('turning On while denied does not save "On"; it explains and offers Settings', async () => {
    os(false, 'denied', false);
    const user = userEvent.setup();
    await renderSettings(false);
    expect(screen.queryByTestId('gym-settings-notifications-off')).toBeNull();

    await user.press(screen.getByTestId('gym-settings-reminder-on'));

    expect(await screen.findByTestId('gym-settings-notifications-off')).toBeOnTheScreen();
    expect(mutate).not.toHaveBeenCalledWith(expect.objectContaining({ reminderEnabled: true }));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('refusing the OS prompt keeps the switch Off', async () => {
    os(false, 'undetermined', true);
    Notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const user = userEvent.setup();
    await renderSettings(false);

    await user.press(screen.getByTestId('gym-settings-reminder-on'));

    await waitFor(() => expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('gym-settings-notifications-off')).toBeOnTheScreen();
    expect(mutate).not.toHaveBeenCalledWith(expect.objectContaining({ reminderEnabled: true }));
  });

  it('granted: turning On saves the time, with no warning row', async () => {
    os(true, 'granted', true);
    const user = userEvent.setup();
    await renderSettings(false);

    await user.press(screen.getByTestId('gym-settings-reminder-on'));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ reminderEnabled: true, reminderTime: '07:00' }),
    );
    expect(screen.queryByTestId('gym-settings-notifications-off')).toBeNull();
  });
});
