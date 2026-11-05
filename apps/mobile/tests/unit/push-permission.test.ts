import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { askBookingReminderPermissionOnce } from '../../src/features/notifications/booking-reminders';
import { askNotificationPermissionAt } from '../../src/features/notifications/push/push-permission';
import { getPushRegistrationRequestTick } from '../../src/features/notifications/push/push-store';

// Trainer mode M4 (docs/prd-2026-10/trainer-mode.md §7.2): the push permission is asked at a moment
// of value — trainer mode the first time, a client's first booking, a sent coaching request — never at
// launch, once per account per moment, with push_permission_prompted {moment} / granted / denied for a
// REAL OS prompt only. M3's booking-reminder moment is the same `first_booking` moment: one OS prompt.

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));
const mockTrack = jest.fn<undefined, unknown[]>();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));
jest.mock('../../src/lib/use-notification-permission', () => ({
  refreshNotificationPermission: jest.fn(),
}));

const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
}>('expo-notifications');

let osGranted = false;
let canAskAgain = true;
let answer = true;

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  osGranted = false;
  canAskAgain = true;
  answer = true;
  Notifications.getPermissionsAsync.mockImplementation(() =>
    Promise.resolve({
      granted: osGranted,
      canAskAgain,
      status: osGranted ? 'granted' : 'undetermined',
    }),
  );
  Notifications.requestPermissionsAsync.mockImplementation(() => {
    osGranted = answer;
    return Promise.resolve({ granted: answer, canAskAgain: false });
  });
});

describe('askNotificationPermissionAt', () => {
  it('prompts once per moment, tracks prompted {moment} then granted, and asks push to register', async () => {
    const tick = getPushRegistrationRequestTick();
    await expect(askNotificationPermissionAt('trainer_mode')).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockTrack.mock.calls).toEqual([
      ['push_permission_prompted', { moment: 'trainer_mode' }],
      ['push_permission_granted', {}],
    ]);
    expect(getPushRegistrationRequestTick()).toBe(tick + 1);
  });

  it('a refusal is tracked as denied, and that moment never asks again', async () => {
    answer = false;
    await expect(askNotificationPermissionAt('coaching_request')).resolves.toBe(false);
    canAskAgain = true; // even when the OS would allow another prompt
    await expect(askNotificationPermissionAt('coaching_request')).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockTrack.mock.calls).toEqual([
      ['push_permission_prompted', { moment: 'coaching_request' }],
      ['push_permission_denied', {}],
    ]);
  });

  it('each moment is its own: another moment may ask after one was refused', async () => {
    answer = false;
    await askNotificationPermissionAt('coaching_request');
    await askNotificationPermissionAt('trainer_mode');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  });

  it('already granted: no prompt, no event — just a registration request', async () => {
    osGranted = true;
    const tick = getPushRegistrationRequestTick();
    await expect(askNotificationPermissionAt('first_booking')).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(getPushRegistrationRequestTick()).toBe(tick + 1);
  });

  it('the OS will not ask again: no prompt and no prompted event', async () => {
    canAskAgain = false;
    await expect(askNotificationPermissionAt('trainer_mode')).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('two moments in the same frame share one OS prompt', async () => {
    await Promise.all([
      askNotificationPermissionAt('trainer_mode'),
      askNotificationPermissionAt('first_booking'),
    ]);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('M3 already asked at the first booking: `first_booking` is not asked again', async () => {
    kv.setString('notifications.booking-reminders.asked', '1');
    await expect(askNotificationPermissionAt('first_booking')).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('the booking-reminder moment is push’s `first_booking`', () => {
  it('askBookingReminderPermissionOnce prompts through the push moment, once', async () => {
    await askBookingReminderPermissionOnce('client');
    await askBookingReminderPermissionOnce('trainer');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('push_permission_prompted', { moment: 'first_booking' });
  });
});
