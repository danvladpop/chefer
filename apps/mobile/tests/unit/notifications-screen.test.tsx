import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  NO_FOOD_NUDGES,
  readFoodNudgePrefs,
  writeFoodNudgePrefs,
} from '../../src/features/notifications/food-nudges';
import { NotificationsScreen } from '../../src/features/notifications/notifications-screen';

// UX-PO-08: Settings → Notifications gathers every reminder in one place.

const mockPush = jest.fn<undefined, [string]>();
const mockBack = jest.fn<undefined, []>();
jest.mock('expo-router', () => ({
  router: {
    push: (href: string): undefined => mockPush(href),
    back: (): undefined => mockBack(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
}));

// The Weekly updates card has its own suite (weekly-updates-card.test.tsx).
const mockWeeklyCard = jest.fn(() => null);
jest.mock('../../src/features/preferences/weekly-updates-card', () => ({
  WeeklyUpdatesCard: () => mockWeeklyCard(),
}));

let mockProfile: { reminderEnabled: boolean; reminderTime: string | null } | null = {
  reminderEnabled: true,
  reminderTime: '07:30',
};
jest.mock('../../src/features/gym/use-gym-bootstrap', () => ({
  useGymBootstrap: () => ({
    data: mockProfile === null ? { profile: null } : { profile: mockProfile },
  }),
}));

let mockPermission: 'granted' | 'denied' | 'undetermined' = 'granted';
const mockRefresh = jest.fn<undefined, []>();
jest.mock('../../src/lib/use-notification-permission', () => ({
  useNotificationPermission: () => mockPermission,
  refreshNotificationPermission: (): undefined => mockRefresh(),
}));

let mockNudgeAllowed = true;
jest.mock('../../src/features/gym/reminders/permission', () => ({
  ensureGymReminderPermission: () => Promise.resolve(mockNudgeAllowed),
}));
const mockEnsureRest = jest.fn(() => Promise.resolve(true));
jest.mock('../../src/features/gym/rest-timer', () => ({
  ensureRestNotificationPermission: () => mockEnsureRest(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <NotificationsScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { reminderEnabled: true, reminderTime: '07:30' };
  mockPermission = 'granted';
  mockNudgeAllowed = true;
  setKvBackendForTests(createMemoryKvBackend());
  writeFoodNudgePrefs(NO_FOOD_NUDGES);
});

describe('NotificationsScreen', () => {
  it('gathers weekly updates, training reminders, the two nudges and the rest-timer alert', async () => {
    await renderScreen();
    expect(screen.getByTestId('notifications-title')).toHaveTextContent('Notifications');
    expect(mockWeeklyCard).toHaveBeenCalled();
    expect(screen.getByTestId('notifications-training')).toBeTruthy();
    expect(screen.getByTestId('notifications-nudge-dinner')).toBeTruthy();
    expect(screen.getByTestId('notifications-nudge-plan')).toBeTruthy();
    expect(screen.getByTestId('notifications-rest-timer')).toBeTruthy();
    // Class reminders arrive with classes (WP-05): no placeholder row until then.
    expect(screen.queryByText(/class/i)).toBeNull();
  });

  it('the training row reports the reminder and opens gym settings', async () => {
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.getByTestId('notifications-training-summary')).toHaveTextContent('On, at 07:30');
    await user.press(screen.getByTestId('notifications-training'));
    expect(mockPush).toHaveBeenCalledWith('/gym/settings?section=reminders');
  });

  it('says Off when the training reminder is off, and hides the row without a training profile', async () => {
    mockProfile = { reminderEnabled: false, reminderTime: null };
    await renderScreen();
    expect(screen.getByTestId('notifications-training-summary')).toHaveTextContent('Off');
  });

  it('a food-only account has no training row', async () => {
    mockProfile = null;
    await renderScreen();
    expect(screen.queryByTestId('notifications-training')).toBeNull();
    expect(screen.getByTestId('notifications-nudge-dinner')).toBeTruthy();
  });

  it('turning a nudge on asks the OS and stores the choice; turning it off clears it', async () => {
    await renderScreen();
    await fireEvent(screen.getByTestId('notifications-nudge-plan'), 'valueChange', true);
    await waitFor(() => expect(readFoodNudgePrefs()).toEqual({ dinner: false, planSunday: true }));
    expect(mockRefresh).toHaveBeenCalled();

    await fireEvent(screen.getByTestId('notifications-nudge-dinner'), 'valueChange', true);
    await waitFor(() => expect(readFoodNudgePrefs()).toEqual({ dinner: true, planSunday: true }));

    await fireEvent(screen.getByTestId('notifications-nudge-plan'), 'valueChange', false);
    await waitFor(() => expect(readFoodNudgePrefs()).toEqual({ dinner: true, planSunday: false }));
  });

  it('a refused permission stores nothing and shows the Open Settings row', async () => {
    mockNudgeAllowed = false;
    await renderScreen();
    expect(screen.queryByTestId('notifications-nudge-off')).toBeNull();
    await fireEvent(screen.getByTestId('notifications-nudge-dinner'), 'valueChange', true);
    await waitFor(() => expect(screen.getByTestId('notifications-nudge-off')).toBeTruthy());
    expect(readFoodNudgePrefs()).toEqual(NO_FOOD_NUDGES);
  });

  it('with notifications denied in the OS, the nudges and the rest timer show the off row', async () => {
    mockPermission = 'denied';
    await renderScreen();
    expect(screen.getByTestId('notifications-nudge-off')).toBeTruthy();
    expect(screen.getByTestId('notifications-rest-timer-off')).toBeTruthy();
    expect(screen.queryByTestId('notifications-rest-timer-on')).toBeNull();
  });

  it('rest-timer alerts: On when granted; a Turn on button while the OS has not been asked', async () => {
    await renderScreen();
    expect(screen.getByTestId('notifications-rest-timer-on')).toBeTruthy();
    expect(screen.queryByTestId('notifications-rest-timer-enable')).toBeNull();
  });

  it('the Turn on button asks for the permission and re-reads it', async () => {
    mockPermission = 'undetermined';
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('notifications-rest-timer-enable'));
    expect(mockEnsureRest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('back goes back', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('notifications-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
