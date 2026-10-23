import * as Notifications from 'expo-notifications';
import { REMINDER_LINES } from '@chefer/utils';
import { kv } from '../../src/features/gym/offline/kv';
import {
  clearGentleReminder,
  GENTLE_REMINDER_APP_TAG,
  GENTLE_REMINDER_KEY,
  nextIgnoredCount,
  planReminder,
  reminderIntervalDays,
  syncGentleReminder,
  triggerFallsOn,
  type ReminderState,
} from '../../src/features/progress/gentle-reminder';

// The gentle reminder (idea 58): tomorrow at the chosen time, backing off when
// it goes unanswered, never on a day that already has a Chefer notification.

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date', WEEKLY: 'weekly' },
}));
type Scheduled = {
  content: { title: string; body: string; data: { app: string } };
  trigger: { date: Date };
};
const N = Notifications as unknown as {
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock<Promise<string>, [Scheduled]>;
  getPermissionsAsync: jest.Mock;
};

// Thursday 22 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 22, 10, 0, 0);
const REMINDER = { enabled: true, time: '19:30' };
const at = (d: Date) => ({
  y: d.getFullYear(),
  m: d.getMonth() + 1,
  d: d.getDate(),
  h: d.getHours(),
  min: d.getMinutes(),
});

function lastScheduledDate(): Date {
  const call = N.scheduleNotificationAsync.mock.calls.at(-1)?.[0];
  if (!call) throw new Error('nothing scheduled');
  return call.trigger.date;
}

beforeEach(() => {
  kv.remove(GENTLE_REMINDER_KEY);
  jest.clearAllMocks();
  N.getPermissionsAsync.mockResolvedValue({ granted: true });
  N.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});

describe('back-off', () => {
  it('is daily, then every 3rd day, then weekly', () => {
    expect([0, 1, 2].map(reminderIntervalDays)).toEqual([1, 1, 1]);
    expect([3, 4, 5].map(reminderIntervalDays)).toEqual([3, 3, 3]);
    expect([6, 7, 20].map(reminderIntervalDays)).toEqual([7, 7, 7]);
  });

  it('counts a reminder that fired before the next open as ignored, and an earlier open as a reset', () => {
    const fired: ReminderState = {
      ignored: 2,
      scheduledAt: new Date(2026, 9, 21, 19, 30).toISOString(),
    };
    const pending: ReminderState = {
      ignored: 2,
      scheduledAt: new Date(2026, 9, 22, 19, 30).toISOString(),
    };
    expect(nextIgnoredCount(fired, NOW)).toBe(3);
    expect(nextIgnoredCount(pending, NOW)).toBe(0);
    expect(nextIgnoredCount({ ignored: 4, scheduledAt: null }, NOW)).toBe(4);
  });

  it('plans tomorrow at the chosen time first', () => {
    const plan = planReminder({
      now: NOW,
      time: '19:30',
      state: { ignored: 0, scheduledAt: null },
      busyOn: () => false,
    });
    expect(at(plan.at)).toEqual({ y: 2026, m: 10, d: 23, h: 19, min: 30 });
  });

  it('steps back after 3 ignored (3 days) and again after 6 (a week)', () => {
    const fired = (ignored: number): ReminderState => ({
      ignored,
      scheduledAt: new Date(2026, 9, 21, 19, 30).toISOString(),
    });
    const three = planReminder({ now: NOW, time: '19:30', state: fired(2), busyOn: () => false });
    expect(three.state.ignored).toBe(3);
    expect(at(three.at).d).toBe(25);
    const six = planReminder({ now: NOW, time: '19:30', state: fired(5), busyOn: () => false });
    expect(six.state.ignored).toBe(6);
    expect(at(six.at)).toMatchObject({ m: 10, d: 29 });
  });

  it('an open before the reminder fired starts over at daily', () => {
    const plan = planReminder({
      now: NOW,
      time: '19:30',
      state: { ignored: 7, scheduledAt: new Date(2026, 9, 22, 19, 30).toISOString() },
      busyOn: () => false,
    });
    expect(plan.state.ignored).toBe(0);
    expect(at(plan.at).d).toBe(23);
  });

  it('skips a day that already has a Chefer notification', () => {
    const busyDays = new Set([23, 24]);
    const plan = planReminder({
      now: NOW,
      time: '19:30',
      state: { ignored: 0, scheduledAt: null },
      busyOn: (day) => busyDays.has(day.getDate()),
    });
    expect(at(plan.at).d).toBe(25);
  });
});

describe('what counts as "busy"', () => {
  it('matches one-shot dates and weekly repeats on that day', () => {
    const fri = new Date(2026, 9, 23);
    expect(
      triggerFallsOn({ type: 'date', value: new Date(2026, 9, 23, 20, 30).getTime() }, fri),
    ).toBe(true);
    expect(
      triggerFallsOn({ type: 'date', value: new Date(2026, 9, 24, 20, 30).getTime() }, fri),
    ).toBe(false);
    // expo weekly: 1 = Sunday … 7 = Saturday. Friday is 6.
    expect(triggerFallsOn({ type: 'weekly', weekday: 6 }, fri)).toBe(true);
    expect(triggerFallsOn({ type: 'weekly', weekday: 1 }, fri)).toBe(false);
    expect(triggerFallsOn(null, fri)).toBe(false);
  });
});

describe('syncGentleReminder', () => {
  it('schedules one notification for tomorrow with a line from the shared copy', async () => {
    await syncGentleReminder(REMINDER, { gateOn: true, now: NOW });
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const content = N.scheduleNotificationAsync.mock.calls[0]?.[0].content;
    if (!content) throw new Error('nothing scheduled');
    expect(REMINDER_LINES.some((l) => l.title === content.title && l.body === content.body)).toBe(
      true,
    );
    expect(content.data.app).toBe(GENTLE_REMINDER_APP_TAG);
    expect(at(lastScheduledDate())).toMatchObject({ d: 23, h: 19, min: 30 });
  });

  it('replaces the pending one on every foreground (cancel, then schedule)', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([
      {
        identifier: 'old',
        content: { data: { app: GENTLE_REMINDER_APP_TAG } },
        trigger: { type: 'date', value: NOW.getTime() + 1e6 },
      },
    ]);
    await syncGentleReminder(REMINDER, { gateOn: true, now: NOW });
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('skips tomorrow when a food nudge already sits on it', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([
      {
        identifier: 'dinner',
        content: { data: { app: 'food-nudge' } },
        trigger: { type: 'date', value: new Date(2026, 9, 23, 20, 30).getTime() },
      },
    ]);
    await syncGentleReminder(REMINDER, { gateOn: true, now: NOW });
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(at(lastScheduledDate()).d).toBe(24);
  });

  it('backs off across opens: three fired and unanswered, then every 3rd day', async () => {
    let now = NOW;
    const days: number[] = [];
    // The user is away: each open comes AFTER the reminder fired.
    for (let i = 0; i < 4; i += 1) {
      await syncGentleReminder(REMINDER, { gateOn: true, now });
      days.push(lastScheduledDate().getDate());
      now = new Date(lastScheduledDate().getTime() + 3_600_000); // an hour after it fired
    }
    // 22 → 23 → 24 → 25 daily, then the 4th (3 ignored) is three days out.
    expect(days).toEqual([23, 24, 25, 28]);
  });

  it('does nothing when the setting is off, and nothing if it never scheduled', async () => {
    await syncGentleReminder({ enabled: false, time: '19:30' }, { gateOn: true, now: NOW });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(N.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels what it scheduled when the user switches it off', async () => {
    await syncGentleReminder(REMINDER, { gateOn: true, now: NOW });
    N.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'ours', content: { data: { app: GENTLE_REMINDER_APP_TAG } }, trigger: null },
    ]);
    await syncGentleReminder({ enabled: false, time: '19:30' }, { gateOn: true, now: NOW });
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('ours');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing when Kitchen progress is off', async () => {
    await syncGentleReminder(REMINDER, { gateOn: false, now: NOW });
    expect(N.getPermissionsAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never asks for permission, and schedules nothing without it', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false });
    await syncGentleReminder(REMINDER, { gateOn: true, now: NOW });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('sign-out forgets it', async () => {
    await syncGentleReminder(REMINDER, { gateOn: true, now: NOW });
    await clearGentleReminder();
    expect(kv.getJSON(GENTLE_REMINDER_KEY)).toBeNull();
  });
});
