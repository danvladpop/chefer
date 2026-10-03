import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  cancelAllFoodNudges,
  clearFoodNudges,
  DINNER_NUDGE_DAYS,
  dinnerNudgeDates,
  FOOD_NUDGE_APP_TAG,
  foodNudgeNotificationUrl,
  getFoodNudgePrefs,
  NO_FOOD_NUDGES,
  readFoodNudgePrefs,
  syncFoodNudges,
  writeFoodNudgePrefs,
} from '../../src/features/notifications/food-nudges';

// UX-PO-08: the opt-in "log dinner" / "plan Sunday" nudges are LOCAL
// notifications. The dinner nudge is a rolling 7-evening window at 20:30 that
// skips tonight once dinner is logged; the Sunday nudge repeats weekly.

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
  content: { title: string; data: { app: string; kind: string } };
  trigger: { type: string; date?: Date; weekday?: number; hour?: number; minute?: number };
};
const scheduledCalls = (): Scheduled[] =>
  Notifications.scheduleNotificationAsync.mock.calls.map((c: [Scheduled]) => c[0]);

const row = (app: string, identifier: string) => ({ identifier, content: { data: { app } } });

// A Wednesday, 2026-10-07, 12:00 local.
const NOON = new Date(2026, 9, 7, 12, 0, 0);

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = true;
  setKvBackendForTests(createMemoryKvBackend());
  writeFoodNudgePrefs(NO_FOOD_NUDGES);
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  Notifications.scheduleNotificationAsync.mockResolvedValue('id');
});

describe('dinnerNudgeDates', () => {
  it('is the next 7 evenings at 20:30, starting tonight', () => {
    const dates = dinnerNudgeDates(NOON, false);
    expect(dates).toHaveLength(DINNER_NUDGE_DAYS);
    expect(dates[0]).toEqual(new Date(2026, 9, 7, 20, 30));
    expect(dates[6]).toEqual(new Date(2026, 9, 13, 20, 30));
  });

  it('skips tonight when dinner is already logged, and keeps tomorrow on', () => {
    const dates = dinnerNudgeDates(NOON, true);
    expect(dates).toHaveLength(DINNER_NUDGE_DAYS - 1);
    expect(dates[0]).toEqual(new Date(2026, 9, 8, 20, 30));
  });

  it('drops tonight once 20:30 has passed, whether or not dinner is logged', () => {
    const late = new Date(2026, 9, 7, 21, 0, 0);
    expect(dinnerNudgeDates(late, false)[0]).toEqual(new Date(2026, 9, 8, 20, 30));
    expect(dinnerNudgeDates(late, true)[0]).toEqual(new Date(2026, 9, 8, 20, 30));
  });
});

describe('syncFoodNudges', () => {
  it('with both off schedules nothing and never checks permission', async () => {
    mockPermission = false;
    await syncFoodNudges({ prefs: NO_FOOD_NUDGES, dinnerLoggedToday: false, now: NOON });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('dinner on: schedules the 7-evening window as one-shot notifications tagged food-nudge', async () => {
    await syncFoodNudges({
      prefs: { dinner: true, planSunday: false },
      dinnerLoggedToday: false,
      now: NOON,
    });
    const calls = scheduledCalls();
    expect(calls).toHaveLength(DINNER_NUDGE_DAYS);
    expect(calls[0]?.trigger).toMatchObject({ type: 'date', date: new Date(2026, 9, 7, 20, 30) });
    expect(calls[0]?.content.data).toEqual({ app: FOOD_NUDGE_APP_TAG, kind: 'dinner' });
  });

  it('dinner already logged today: tonight is skipped', async () => {
    await syncFoodNudges({
      prefs: { dinner: true, planSunday: false },
      dinnerLoggedToday: true,
      now: NOON,
    });
    const calls = scheduledCalls();
    expect(calls).toHaveLength(DINNER_NUDGE_DAYS - 1);
    expect(calls[0]?.trigger.date).toEqual(new Date(2026, 9, 8, 20, 30));
  });

  it('plan-Sunday on: one weekly notification, Sunday 18:30 (after the 18:00 weekly recap)', async () => {
    await syncFoodNudges({
      prefs: { dinner: false, planSunday: true },
      dinnerLoggedToday: false,
      now: NOON,
    });
    const calls = scheduledCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.trigger).toMatchObject({ type: 'weekly', weekday: 1, hour: 18, minute: 30 });
    expect(calls[0]?.content.data.kind).toBe('plan-sunday');
  });

  it('replaces what is scheduled: cancels only food nudges first', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      row(FOOD_NUDGE_APP_TAG, 'old-nudge'),
      row('weekly-digest', 'weekly'),
      row('gym-reminder', 'gym'),
    ]);
    await syncFoodNudges({
      prefs: { dinner: false, planSunday: true },
      dinnerLoggedToday: false,
      now: NOON,
    });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-nudge');
  });

  it('turning both off cancels what was scheduled', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      row(FOOD_NUDGE_APP_TAG, 'a'),
      row(FOOD_NUDGE_APP_TAG, 'b'),
    ]);
    await syncFoodNudges({ prefs: NO_FOOD_NUDGES, dinnerLoggedToday: false, now: NOON });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('without OS permission schedules nothing (and never prompts)', async () => {
    mockPermission = false;
    await syncFoodNudges({
      prefs: { dinner: true, planSunday: true },
      dinnerLoggedToday: false,
      now: NOON,
    });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('a scheduler failure cleans up and never throws', async () => {
    Notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(
      syncFoodNudges({
        prefs: { dinner: true, planSunday: true },
        dinnerLoggedToday: false,
        now: NOON,
      }),
    ).resolves.toBeUndefined();
  });

  it('two overlapping syncs run one after the other (no duplicates)', async () => {
    const order: string[] = [];
    Notifications.getAllScheduledNotificationsAsync.mockImplementation(async () => {
      order.push('list');
      await Promise.resolve();
      return [];
    });
    Notifications.scheduleNotificationAsync.mockImplementation(() => {
      order.push('schedule');
      return Promise.resolve('id');
    });
    const prefs = { dinner: false, planSunday: true };
    await Promise.all([
      syncFoodNudges({ prefs, dinnerLoggedToday: false, now: NOON }),
      syncFoodNudges({ prefs, dinnerLoggedToday: false, now: NOON }),
    ]);
    expect(order).toEqual(['list', 'schedule', 'list', 'schedule']);
  });
});

describe('stored choice', () => {
  it('round-trips through the device store, and garbage reads as both off', () => {
    writeFoodNudgePrefs({ dinner: true, planSunday: false });
    expect(readFoodNudgePrefs()).toEqual({ dinner: true, planSunday: false });
    expect(getFoodNudgePrefs()).toEqual({ dinner: true, planSunday: false });
  });

  it('a missing, malformed or partly wrong stored value reads as off', () => {
    kv.setString('notifications.food-nudges', 'not json');
    expect(readFoodNudgePrefs()).toEqual(NO_FOOD_NUDGES);
    kv.setString('notifications.food-nudges', '{"dinner":"yes","planSunday":true}');
    expect(readFoodNudgePrefs()).toEqual({ dinner: false, planSunday: true });
    kv.remove('notifications.food-nudges');
    expect(readFoodNudgePrefs()).toEqual(NO_FOOD_NUDGES);
  });

  it('clearFoodNudges cancels every nudge and resets the cached choice', async () => {
    writeFoodNudgePrefs({ dinner: true, planSunday: true });
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      row(FOOD_NUDGE_APP_TAG, 'a'),
    ]);
    // Sign-out wipes the KV key itself; simulate that, then clear.
    setKvBackendForTests(createMemoryKvBackend());
    await clearFoodNudges();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('a');
    expect(getFoodNudgePrefs()).toEqual(NO_FOOD_NUDGES);
  });

  it('cancelAllFoodNudges swallows a failing scheduler', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('boom'));
    await expect(cancelAllFoodNudges()).resolves.toBeUndefined();
  });
});

describe('foodNudgeNotificationUrl', () => {
  it('maps each kind to its own screen and ignores everything else', () => {
    expect(foodNudgeNotificationUrl({ app: FOOD_NUDGE_APP_TAG, kind: 'dinner' })).toBe('/tracker');
    expect(foodNudgeNotificationUrl({ app: FOOD_NUDGE_APP_TAG, kind: 'plan-sunday' })).toBe(
      '/meal-plan',
    );
    // A payload-supplied path is never followed.
    expect(
      foodNudgeNotificationUrl({ app: FOOD_NUDGE_APP_TAG, kind: 'dinner', url: '/profile' }),
    ).toBe('/tracker');
    expect(foodNudgeNotificationUrl({ app: FOOD_NUDGE_APP_TAG, kind: 'other' })).toBeNull();
    expect(foodNudgeNotificationUrl({ app: 'gym-reminder', kind: 'dinner' })).toBeNull();
    expect(foodNudgeNotificationUrl(null)).toBeNull();
  });
});
