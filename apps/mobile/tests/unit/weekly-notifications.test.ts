import {
  areWeeklyNotificationsOn,
  cancelWeeklyNotifications,
  scheduleWeeklyNotifications,
  WEEKLY_APP_TAG,
  weeklyNotificationUrl,
} from '../../src/features/notifications/weekly-notifications';

// Audit P2-5: the Monday "week ready" and Sunday recap phone notifications
// are LOCAL repeating (WEEKLY) notifications — no push tokens.

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
  AndroidImportance: { DEFAULT: 3 },
}));

const Notifications = jest.requireMock<{
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
}>('expo-notifications');

const scheduled = (app: string, identifier: string) => ({
  identifier,
  content: { data: { app } },
});

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  Notifications.scheduleNotificationAsync.mockResolvedValue('id');
});

describe('weekly notifications', () => {
  it('schedules Monday 08:00 → plan and Sunday 18:00 → recap, weekly', async () => {
    expect(await scheduleWeeklyNotifications()).toBe(true);
    type Call = { content: { title: string; data: { url: string } }; trigger: object };
    const [monday, sunday] = Notifications.scheduleNotificationAsync.mock.calls.map(
      (c: [Call]) => c[0],
    ) as [Call, Call];
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(monday.content.title).toBe('Your week is ready');
    expect(monday.content.data.url).toBe('/meal-plan');
    expect(monday.trigger).toMatchObject({ type: 'weekly', weekday: 2, hour: 8, minute: 0 });
    expect(sunday.content.title).toBe('Your week in review');
    expect(sunday.content.data.url).toBe('/progress');
    expect(sunday.trigger).toMatchObject({ type: 'weekly', weekday: 1, hour: 18 });
  });

  it('re-scheduling replaces the old ones and never touches gym reminders', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      scheduled(WEEKLY_APP_TAG, 'old-weekly'),
      scheduled('gym-reminder', 'gym-1'),
    ]);
    await scheduleWeeklyNotifications();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-weekly');
  });

  it('"on" is read from what is actually scheduled', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      scheduled('gym-reminder', 'gym-1'),
    ]);
    expect(await areWeeklyNotificationsOn()).toBe(false);
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      scheduled(WEEKLY_APP_TAG, 'w1'),
    ]);
    expect(await areWeeklyNotificationsOn()).toBe(true);
    await cancelWeeklyNotifications();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('w1');
  });

  it('a failed schedule leaves nothing half-scheduled', async () => {
    Notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('denied'));
    expect(await scheduleWeeklyNotifications()).toBe(false);
  });

  it('only weekly notifications carry a deep link', () => {
    expect(weeklyNotificationUrl({ app: WEEKLY_APP_TAG, url: '/progress' })).toBe('/progress');
    expect(weeklyNotificationUrl({ app: 'gym-reminder', url: '/progress' })).toBeNull();
    expect(weeklyNotificationUrl({ app: WEEKLY_APP_TAG, url: 'https://evil.test' })).toBeNull();
    expect(weeklyNotificationUrl(null)).toBeNull();
  });
});
