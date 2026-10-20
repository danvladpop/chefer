import { BOOKING_REMINDER_APP_TAG, planClientReminders, planTrainerReminders } from '@chefer/utils';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  askBookingReminderPermissionOnce,
  bookingReminderTarget,
  clearBookingReminders,
  getBookingReminderPrefs,
  getBookingReminderSyncTick,
  resetBookingReminderPrefsForTests,
  setBookingReminderPref,
  syncBookingReminders,
} from '../../src/features/notifications/booking-reminders';
import { clientBooking, trainerBooking, ZONE } from './trainer-bookings-fixtures';

// Trainer mode M3 (docs/prd-2026-10/trainer-mode.md §7.3): LOCAL reminders 60 minutes before each
// upcoming booking in the next 14 days, keyed by booking id (cancel + reschedule), per side (client /
// trainer) with a switch that defaults on. Permission is checked, asked only once at a moment of value.

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

let mockGranted = true;
let mockAskAnswer = true;
const mockEnsure = jest.fn(() => Promise.resolve(mockAskAnswer));
jest.mock('../../src/features/gym/reminders/permission', () => ({
  hasGymReminderPermission: () => Promise.resolve(mockGranted),
  ensureGymReminderPermission: () => mockEnsure(),
}));

const Notifications = jest.requireMock<{
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
}>('expo-notifications');

type Scheduled = {
  identifier: string;
  content: { body: string; data: { app: string; role: string; bookingId: string } };
  trigger: { type: string; date: Date };
};
const scheduled = (): Scheduled[] =>
  Notifications.scheduleNotificationAsync.mock.calls.map((c: [Scheduled]) => c[0]);

const NOW = new Date('2026-10-20T08:00:00.000Z');
const HOUR = 3_600_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted = true;
  mockAskAnswer = true;
  setKvBackendForTests(createMemoryKvBackend());
  resetBookingReminderPrefsForTests();
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  Notifications.scheduleNotificationAsync.mockResolvedValue('id');
});

// The plan itself (60 minutes before, next 14 days, keyed by booking id) is shared and tested in
// @chefer/utils coaching/bookings.test.ts; this file covers scheduling it on the device.

describe('syncBookingReminders', () => {
  it('cancels this side’s reminders, then schedules the plan keyed by booking id with ids only', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      {
        identifier: 'old-client',
        content: { data: { app: BOOKING_REMINDER_APP_TAG, role: 'client' } },
      },
      {
        identifier: 'old-trainer',
        content: { data: { app: BOOKING_REMINDER_APP_TAG, role: 'trainer' } },
      },
      { identifier: 'food', content: { data: { app: 'food-nudge' } } },
    ]);
    const plan = planClientReminders([clientBooking({ id: 'cb1', startsAt: at(3 * HOUR) })], NOW);
    await syncBookingReminders('client', plan);
    expect(Notifications.cancelScheduledNotificationAsync.mock.calls).toEqual([['old-client']]);
    expect(scheduled()).toHaveLength(1);
    expect(scheduled()[0]).toMatchObject({
      identifier: 'booking-reminder:client:cb1',
      content: {
        body: 'Session with Ana in 1 hour',
        data: { app: BOOKING_REMINDER_APP_TAG, role: 'client', bookingId: 'cb1' },
      },
      trigger: { type: 'date', date: new Date(NOW.getTime() + 2 * HOUR) },
    });
  });

  it('a cancelled or removed booking leaves nothing behind (the plan no longer has it)', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      {
        identifier: 'booking-reminder:client:cb1',
        content: { data: { app: BOOKING_REMINDER_APP_TAG, role: 'client' } },
      },
    ]);
    await syncBookingReminders(
      'client',
      planClientReminders(
        [clientBooking({ id: 'cb1', startsAt: at(3 * HOUR), cancelledAt: at(-1) })],
        NOW,
      ),
    );
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'booking-reminder:client:cb1',
    );
    expect(scheduled()).toHaveLength(0);
  });

  it('switch off → nothing scheduled (and it stays off after a reload)', async () => {
    expect(getBookingReminderPrefs()).toEqual({ client: true, trainer: true }); // default on
    setBookingReminderPref('client', false);
    resetBookingReminderPrefsForTests();
    expect(getBookingReminderPrefs()).toEqual({ client: false, trainer: true });
    await syncBookingReminders(
      'client',
      planClientReminders([clientBooking({ startsAt: at(3 * HOUR) })], NOW),
    );
    expect(scheduled()).toHaveLength(0);
  });

  it('no OS permission → nothing scheduled, nothing asked', async () => {
    mockGranted = false;
    await syncBookingReminders('trainer', planTrainerReminders([trainerBooking()], NOW, ZONE));
    expect(scheduled()).toHaveLength(0);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('sign-out cancels every booking reminder, both sides', async () => {
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'a', content: { data: { app: BOOKING_REMINDER_APP_TAG, role: 'client' } } },
      { identifier: 'b', content: { data: { app: BOOKING_REMINDER_APP_TAG, role: 'trainer' } } },
      { identifier: 'c', content: { data: { app: 'weekly' } } },
    ]);
    await clearBookingReminders();
    expect(Notifications.cancelScheduledNotificationAsync.mock.calls).toEqual([['a'], ['b']]);
  });
});

describe('permission at a moment of value, and taps', () => {
  it('asks once per account, only when not granted, then re-syncs', async () => {
    mockGranted = false;
    const before = getBookingReminderSyncTick();
    await askBookingReminderPermissionOnce('client');
    await askBookingReminderPermissionOnce('client');
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    expect(getBookingReminderSyncTick()).toBe(before + 1);
  });

  it('never asks while that side is switched off, or when already granted', async () => {
    setBookingReminderPref('trainer', false);
    mockGranted = false;
    await askBookingReminderPermissionOnce('trainer');
    mockGranted = true;
    await askBookingReminderPermissionOnce('client');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('reads the booking from a tapped reminder; anything else is not one', () => {
    expect(
      bookingReminderTarget({ app: BOOKING_REMINDER_APP_TAG, role: 'trainer', bookingId: 'b1' }),
    ).toEqual({ role: 'trainer', bookingId: 'b1' });
    expect(bookingReminderTarget({ app: 'food-nudge', kind: 'dinner' })).toBeNull();
    expect(
      bookingReminderTarget({ app: BOOKING_REMINDER_APP_TAG, role: 'admin', bookingId: 'b1' }),
    ).toBeNull();
    expect(bookingReminderTarget(null)).toBeNull();
  });
});
