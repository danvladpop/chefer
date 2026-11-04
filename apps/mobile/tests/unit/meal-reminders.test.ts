import type { MealReminders } from '@chefer/types';
import {
  cancelAllMealReminders,
  MEAL_REMINDER_APP_TAG,
  MEAL_REMINDER_ROUTE,
  mealReminderNotificationUrl,
  syncMealReminders,
} from '../../src/features/notifications/meal-reminders';

// Lane E1: meal-time reminders are LOCAL one-shot notifications for the next
// few days, skipped for a meal that is already logged or ticked today.

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

let mockPermission = true;
jest.mock('../../src/features/gym/reminders/permission', () => ({
  hasGymReminderPermission: () => Promise.resolve(mockPermission),
}));

const Notifications = jest.requireMock<{
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
}>('expo-notifications');

type Scheduled = {
  content: { title: string; body: string; data: { app: string; slot: string } };
  trigger: { type: string; date: Date };
};
const scheduled = (): Scheduled[] =>
  Notifications.scheduleNotificationAsync.mock.calls.map((c: [Scheduled]) => c[0]);

const ON: MealReminders = {
  enabled: true,
  times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: null },
};
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// Wednesday 2026-10-21, 10:00 local.
const WED_10AM = new Date(2026, 9, 21, 10, 0);

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = true;
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  Notifications.scheduleNotificationAsync.mockResolvedValue('id');
});

describe('syncMealReminders', () => {
  it('schedules each meal at its time for the window, tagged and warm', async () => {
    await syncMealReminders({
      reminders: ON,
      planDays: EVERY_DAY,
      doneToday: new Set(),
      now: WED_10AM,
    });
    const calls = scheduled();
    // Today: lunch + dinner (breakfast has passed); then 3 more days × 3 meals.
    expect(calls).toHaveLength(2 + 3 * 3);
    expect(calls[0]?.trigger.date).toEqual(new Date(2026, 9, 21, 12, 30));
    expect(calls[0]?.content).toMatchObject({
      title: 'Lunch time',
      data: { app: MEAL_REMINDER_APP_TAG, slot: 'lunch' },
    });
    for (const call of calls) expect(call.content.body).not.toMatch(/missed|forgot/i);
  });

  it('skips today’s reminder for a meal that is already logged or ticked', async () => {
    await syncMealReminders({
      reminders: ON,
      planDays: EVERY_DAY,
      doneToday: new Set(['lunch'] as const),
      now: WED_10AM,
    });
    const todays = scheduled().filter((c) => c.trigger.date.getDate() === 21);
    expect(todays.map((c) => c.content.data.slot)).toEqual(['dinner']);
  });

  it('cancels the old window first and schedules nothing without permission', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'old', content: { data: { app: MEAL_REMINDER_APP_TAG } } },
      { identifier: 'gym', content: { data: { app: 'gym-reminder' } } },
    ]);
    mockPermission = false;
    await syncMealReminders({
      reminders: ON,
      planDays: EVERY_DAY,
      doneToday: new Set(),
      now: WED_10AM,
    });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('gym');
    expect(scheduled()).toHaveLength(0);
  });

  it('switched off: only cancels', async () => {
    await syncMealReminders({
      reminders: { ...ON, enabled: false },
      planDays: EVERY_DAY,
      doneToday: new Set(),
      now: WED_10AM,
    });
    expect(scheduled()).toHaveLength(0);
  });
});

describe('mealReminderNotificationUrl', () => {
  it('opens the log for a meal reminder and nothing for other notifications', () => {
    expect(mealReminderNotificationUrl({ app: MEAL_REMINDER_APP_TAG, slot: 'lunch' })).toBe(
      MEAL_REMINDER_ROUTE,
    );
    expect(mealReminderNotificationUrl({ app: 'food-nudge' })).toBeNull();
    expect(mealReminderNotificationUrl(null)).toBeNull();
  });
});

describe('cancelAllMealReminders', () => {
  it('never throws', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('no module'));
    await expect(cancelAllMealReminders()).resolves.toBeUndefined();
  });
});
