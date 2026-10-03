import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetGymReminderPermissionForTests } from '../../src/features/gym/reminders/permission';
import { SetupWizard } from '../../src/features/gym/setup/setup-wizard';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult, queryResult } from './gym-trpc-mock';

// UX-GYM-04 (WP-02 lane C), setup wizard half: "Remind me" must not stay
// selected when the OS refuses notifications — the wizard then submits
// `reminderTime: null` and shows an Open Settings row, instead of finishing
// with a reminder that can never fire.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted mock factory
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
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

const RECOMMEND_RESULT = {
  recommendedKey: 'fb3-beginner',
  reason: 'Full Body 3× is the best start.',
  alternatives: [],
  preview: { key: 'fb3-beginner', name: 'Full Body 3×', days: [] },
  volume: [],
  hints: [],
};
const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

async function renderOnReminderStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <SetupWizard />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  const user = userEvent.setup();
  await user.press(screen.getByTestId('gym-setup-next')); // 1 → 2
  await user.press(screen.getByTestId('gym-setup-next')); // 2 → 3
  await user.press(screen.getByTestId('gym-setup-next')); // 3 → 4
  return user;
}

let openSettings: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetGymReminderPermissionForTests();
  openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  trpc.gym.profile.recommend.useQuery.mockReturnValue(queryResult({ data: RECOMMEND_RESULT }));
  trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult());
  trpc.gym.profile.completeSetup.useMutation.mockReturnValue(mutationResult());
});

describe('gym setup — reminder step vs notification permission', () => {
  it('denied: "Remind me" goes back to "No reminder" and an Open Settings row appears', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });
    const user = await renderOnReminderStep();

    await user.press(screen.getByTestId('gym-setup-reminder-on'));

    expect(await screen.findByTestId('gym-setup-notifications-off')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('gym-setup-reminder-off')).toBeSelected());
    expect(screen.queryByTestId('gym-setup-reminder-hour')).toBeNull();

    await user.press(screen.getByTestId('gym-setup-notifications-off-open-settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('granted: "Remind me" stays selected with the time steppers', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
    });
    const user = await renderOnReminderStep();

    await user.press(screen.getByTestId('gym-setup-reminder-on'));

    expect(await screen.findByTestId('gym-setup-reminder-hour')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-setup-reminder-on')).toBeSelected();
    expect(screen.queryByTestId('gym-setup-notifications-off')).toBeNull();
  });
});
