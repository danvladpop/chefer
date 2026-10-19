import { act } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetPushRegistrationForSignOut } from '../../src/features/notifications/push/push-registration';
import { PushRegistrationHost } from '../../src/features/notifications/push/push-registration-host';
import {
  isPushActive,
  requestPushRegistration,
  resetPushStoreForSignOut,
} from '../../src/features/notifications/push/push-store';
import { switchShellMode } from '../../src/features/trainer-mode/switch-mode';
import { renderWithTrpc } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// Trainer mode M4 (trainer-mode.md §7.2): the root host registers this device while signed in — on
// launch, after a grant, and when the OS rolls the token — and NEVER asks for the permission at
// launch. The first switch to trainer mode is a moment that may ask (once per account).

type TokenListener = (token: { type: string; data: string }) => void;
let mockTokenListener: TokenListener | null = null;
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  addPushTokenListener: (l: TokenListener) => {
    mockTokenListener = l;
    return { remove: () => undefined };
  },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.3', extra: { eas: { projectId: 'proj-123' } } } },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));
const mockTrack = jest.fn<undefined, unknown[]>();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
}>('expo-notifications');

let granted = false;

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetPushStoreForSignOut();
  resetPushRegistrationForSignOut();
  mockTokenListener = null;
  granted = false;
  Notifications.getPermissionsAsync.mockImplementation(() =>
    Promise.resolve({ granted, canAskAgain: true, status: granted ? 'granted' : 'undetermined' }),
  );
  Notifications.requestPermissionsAsync.mockImplementation(() => {
    granted = true;
    return Promise.resolve({ granted: true });
  });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({
    type: 'expo',
    data: 'ExponentPushToken[abc123]',
  });
});

const handlers = { 'notifications.push.register': () => ({ ok: true }) };
const registered = (r: { calls: { path: string; input: unknown }[] }) =>
  r.calls.filter((c) => c.path === 'notifications.push.register').map((c) => c.input);

describe('PushRegistrationHost', () => {
  it('launch without permission: never prompts, registers nothing, stays on local reminders', async () => {
    const r = await renderWithTrpc(<PushRegistrationHost signedIn />, handlers);
    await settle(6);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registered(r)).toEqual([]);
    expect(isPushActive()).toBe(false);
  });

  it('launch with permission: registers the token once', async () => {
    granted = true;
    const r = await renderWithTrpc(<PushRegistrationHost signedIn />, handlers);
    await settle(6);
    expect(registered(r)).toEqual([
      { token: 'ExponentPushToken[abc123]', platform: 'IOS', appVersion: '1.0.3' },
    ]);
    expect(isPushActive()).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('a grant at a moment of value (first trainer mode switch) registers right away', async () => {
    const r = await renderWithTrpc(<PushRegistrationHost signedIn />, handlers);
    await settle(4);
    await act(() => switchShellMode('trainer'));
    await settle(6);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('push_permission_prompted', { moment: 'trainer_mode' });
    expect(registered(r)).toHaveLength(1);
    // The second switch to trainer mode does not ask again.
    await act(() => switchShellMode('personal'));
    await act(() => switchShellMode('trainer'));
    await settle(4);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('a rolled token re-registers', async () => {
    granted = true;
    const r = await renderWithTrpc(<PushRegistrationHost signedIn />, handlers);
    await settle(6);
    Notifications.getExpoPushTokenAsync.mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[rolled]',
    });
    await act(() => mockTokenListener?.({ type: 'ios', data: 'new-apns-token' }));
    await settle(6);
    expect(registered(r).map((i) => (i as { token: string }).token)).toEqual([
      'ExponentPushToken[abc123]',
      'ExponentPushToken[rolled]',
    ]);
  });

  it('a binary without push (1.0.2): the token lookup throws, nothing crashes or registers', async () => {
    granted = true;
    Notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('no aps-environment'));
    const r = await renderWithTrpc(<PushRegistrationHost signedIn />, handlers);
    await settle(6);
    await act(() => requestPushRegistration());
    await settle(4);
    expect(registered(r)).toEqual([]);
    expect(isPushActive()).toBe(false);
  });

  it('signed out: renders nothing and calls nothing', async () => {
    granted = true;
    const r = await renderWithTrpc(<PushRegistrationHost signedIn={false} />, handlers);
    await settle(4);
    expect(r.calls).toHaveLength(0);
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
