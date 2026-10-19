import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { expoPushTokenSchema } from '@chefer/types';
import { isNetworkError } from '@chefer/utils';
import { getRegisteredPushToken, markPushInactive, markPushRegistered } from './push-store';

// ─── Registering this device for push (trainer-mode.md §7.2, M4) ──────────────
// Only ever READS the permission (asking is push-permission.ts's job, at a
// moment of value). With it granted: the Expo push token → the API's
// `notifications.push.register`. Once per launch (the server's lastSeenAt)
// and again whenever the token changes; a foreground with the same token
// does not call the server again.
//
// Every failure is quiet and leaves the device on LOCAL reminders:
//  - a binary without the push entitlement / FCM config (1.0.2 in the
//    stores) throws from getExpoPushTokenAsync — nothing is logged (the error
//    may carry device details), the app simply keeps local reminders;
//  - the server refusing the token turns push off here;
//  - a network failure changes nothing (the server keeps what it had); the
//    next launch or foreground tries again.
// The token goes to the API and nowhere else, and is never logged.

/** Android channel the server's pushes name (`channelId: 'default'`). */
export const PUSH_ANDROID_CHANNEL_ID = 'default';

export type PushDeviceApi = {
  register: (input: {
    token: string;
    platform: 'IOS' | 'ANDROID';
    appVersion: string;
  }) => Promise<unknown>;
};

export type PushRegistrationResult =
  | 'registered'
  | 'no-permission'
  | 'unavailable'
  | 'offline'
  | 'refused';

/** The token this process registered (once per launch); null after a token change. */
let registeredThisLaunch: string | null = null;

function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === 'string' && id !== '' ? id : null;
}

async function permissionGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(PUSH_ANDROID_CHANNEL_ID, {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // Android then falls back to its own default channel
  }
}

type TokenLookup =
  | { kind: 'token'; token: string }
  /** This binary cannot get one (no entitlement / FCM, no project id, a malformed token). */
  | { kind: 'unavailable' }
  /** Expo's token service could not be reached. */
  | { kind: 'offline' };

async function readExpoToken(
  devicePushToken?: Notifications.DevicePushToken,
): Promise<TokenLookup> {
  const projectId = easProjectId();
  if (!projectId) return { kind: 'unavailable' };
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId,
      // From the token listener: reuse it, so the lookup does not fetch the device token again.
      ...(devicePushToken ? { devicePushToken } : {}),
    });
    return expoPushTokenSchema.safeParse(data).success
      ? { kind: 'token', token: data }
      : { kind: 'unavailable' };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return code === 'ERR_NOTIFICATIONS_NETWORK_ERROR'
      ? { kind: 'offline' }
      : { kind: 'unavailable' };
  }
}

// Launch, foreground and a grant can all ask at once: one registration at a time.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Registers this device when notifications are allowed. `devicePushToken`:
 * a rolled token from `addPushTokenListener` (forces a new registration).
 */
export function registerPushDevice(
  api: PushDeviceApi,
  devicePushToken?: Notifications.DevicePushToken,
): Promise<PushRegistrationResult> {
  const run = queue.then(
    () => registerNow(api, devicePushToken),
    () => registerNow(api, devicePushToken),
  );
  queue = run.catch(() => undefined);
  return run;
}

async function registerNow(
  api: PushDeviceApi,
  devicePushToken: Notifications.DevicePushToken | undefined,
): Promise<PushRegistrationResult> {
  if (!(await permissionGranted())) {
    markPushInactive();
    return 'no-permission';
  }
  await ensureAndroidChannel();
  if (devicePushToken) registeredThisLaunch = null;
  const lookup = await readExpoToken(devicePushToken);
  if (lookup.kind === 'offline') return 'offline';
  if (lookup.kind === 'unavailable') {
    markPushInactive();
    return 'unavailable';
  }
  const { token } = lookup;
  if (registeredThisLaunch === token && getRegisteredPushToken() === token) {
    markPushRegistered(token);
    return 'registered';
  }
  try {
    await api.register({
      token,
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      appVersion: Constants.expoConfig?.version ?? 'unknown',
    });
  } catch (error) {
    if (isNetworkError(error)) return 'offline';
    markPushInactive();
    return 'refused';
  }
  registeredThisLaunch = token;
  markPushRegistered(token);
  return 'registered';
}

/** Sign-out / tests: the next account registers afresh. */
export function resetPushRegistrationForSignOut(): void {
  registeredThisLaunch = null;
}

/** Longest a sign-out waits for the unregister call before going on without it. */
export const PUSH_UNREGISTER_TIMEOUT_MS = 3000;

/**
 * Sign-out (§7.2 "unregister on sign out"): tells the API to forget this
 * device's token while the session is still valid. Best effort and bounded —
 * it never fails and never holds the sign-out longer than the timeout; a token
 * the server keeps is pruned by its retention job or re-bound by the next
 * account's registration.
 */
export async function unregisterPushDevice(api: {
  unregister: (input: { token: string }) => Promise<unknown>;
}): Promise<void> {
  const token = getRegisteredPushToken();
  if (!token) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      api.unregister({ token }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PUSH_UNREGISTER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // offline or already gone server-side — the sign-out goes on
  } finally {
    if (timer) clearTimeout(timer);
  }
}
