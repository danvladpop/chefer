import { Platform } from 'react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  PUSH_UNREGISTER_TIMEOUT_MS,
  registerPushDevice,
  resetPushRegistrationForSignOut,
  unregisterPushDevice,
} from '../../src/features/notifications/push/push-registration';
import {
  getRegisteredPushToken,
  isPushActive,
  markPushRegistered,
  resetPushStoreForSignOut,
} from '../../src/features/notifications/push/push-store';
import { trpcError } from './friends-core-harness';

// Trainer mode M4 (trainer-mode.md §7.2): with the permission granted (read, never asked), the Expo
// push token goes to notifications.push.register — once per launch and again when the token rolls.
// A binary without the push entitlement / FCM (1.0.2 in the stores) cannot get a token: no crash,
// nothing logged, the device stays on local reminders. Sign-out unregisters, best effort.

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.3', extra: { eas: { projectId: 'proj-123' } } } },
}));

const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
}>('expo-notifications');

const TOKEN = 'ExponentPushToken[abc123]';
const ROLLED = 'ExponentPushToken[def456]';

let granted = true;
const register = jest.fn((_input: unknown) => Promise.resolve({ ok: true }));
const api = { register };

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetPushStoreForSignOut();
  resetPushRegistrationForSignOut();
  granted = true;
  Platform.OS = 'ios';
  Notifications.getPermissionsAsync.mockImplementation(() => Promise.resolve({ granted }));
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN });
});

describe('registerPushDevice', () => {
  it('granted: sends the Expo token with platform and app version, and push becomes active', async () => {
    await expect(registerPushDevice(api)).resolves.toBe('registered');
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-123' });
    expect(register).toHaveBeenCalledWith({ token: TOKEN, platform: 'IOS', appVersion: '1.0.3' });
    expect(isPushActive()).toBe(true);
    expect(getRegisteredPushToken()).toBe(TOKEN);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('once per launch: a second call with the same token does not call the server again', async () => {
    await registerPushDevice(api);
    await registerPushDevice(api);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('a rolled token (the token listener) registers the new one', async () => {
    await registerPushDevice(api);
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: ROLLED });
    const device = { type: 'ios' as const, data: 'apns-device-token' };
    await registerPushDevice(api, device);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: 'proj-123',
      devicePushToken: device,
    });
    expect(register).toHaveBeenLastCalledWith(expect.objectContaining({ token: ROLLED }));
    expect(getRegisteredPushToken()).toBe(ROLLED);
  });

  it('a binary without the push entitlement: no crash, nothing sent, stays on local reminders', async () => {
    markPushRegistered(TOKEN);
    Notifications.getExpoPushTokenAsync.mockRejectedValue(
      Object.assign(new Error('no valid aps-environment entitlement'), {
        code: 'E_REGISTRATION_FAILED',
      }),
    );
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(registerPushDevice(api)).resolves.toBe('unavailable');
    expect(register).not.toHaveBeenCalled();
    expect(isPushActive()).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });

  it('permission off (never granted, or revoked in Settings): no token asked, push inactive', async () => {
    markPushRegistered(TOKEN);
    granted = false;
    await expect(registerPushDevice(api)).resolves.toBe('no-permission');
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(isPushActive()).toBe(false);
  });

  it('offline (Expo or our API unreachable): keeps what was there, tries again next time', async () => {
    markPushRegistered(TOKEN);
    Notifications.getExpoPushTokenAsync.mockRejectedValueOnce(
      Object.assign(new Error('fetch failed'), { code: 'ERR_NOTIFICATIONS_NETWORK_ERROR' }),
    );
    await expect(registerPushDevice(api)).resolves.toBe('offline');
    expect(isPushActive()).toBe(true);
    register.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(registerPushDevice(api)).resolves.toBe('offline');
    expect(isPushActive()).toBe(true);
    await expect(registerPushDevice(api)).resolves.toBe('registered');
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('the server refuses the token: push off on this device', async () => {
    markPushRegistered(TOKEN);
    resetPushStoreForSignOut();
    register.mockRejectedValueOnce(trpcError('BAD_REQUEST', 400));
    await expect(registerPushDevice(api)).resolves.toBe('refused');
    expect(isPushActive()).toBe(false);
  });

  it('Android: makes sure the `default` channel the server names exists', async () => {
    Platform.OS = 'android';
    await registerPushDevice(api);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ importance: 3 }),
    );
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ platform: 'ANDROID' }));
  });
});

describe('unregisterPushDevice (sign-out)', () => {
  it('sends the registered token', async () => {
    markPushRegistered(TOKEN);
    const unregister = jest.fn((_input: unknown) => Promise.resolve({ ok: true }));
    await unregisterPushDevice({ unregister });
    expect(unregister).toHaveBeenCalledWith({ token: TOKEN });
  });

  it('nothing registered: no call', async () => {
    const unregister = jest.fn((_input: unknown) => Promise.resolve({ ok: true }));
    await unregisterPushDevice({ unregister });
    expect(unregister).not.toHaveBeenCalled();
  });

  it('best effort: a failure resolves, and a hung call gives up after the timeout', async () => {
    markPushRegistered(TOKEN);
    await expect(
      unregisterPushDevice({ unregister: () => Promise.reject(new Error('offline')) }),
    ).resolves.toBeUndefined();

    jest.useFakeTimers();
    try {
      let done = false;
      const pending = unregisterPushDevice({ unregister: () => new Promise(() => undefined) }).then(
        () => {
          done = true;
        },
      );
      await jest.advanceTimersByTimeAsync(PUSH_UNREGISTER_TIMEOUT_MS - 1);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await pending;
      expect(done).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
