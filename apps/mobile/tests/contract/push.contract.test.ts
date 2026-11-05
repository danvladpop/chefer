import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PUSH_PREFERENCE_AUDIENCE,
  PUSH_PREFERENCE_KEYS,
  type PushPreferencesDto,
} from '@chefer/types';
import { makeCoachUser } from './coaching-helpers';

// Trainer mode M4 (docs/prd-2026-10/trainer-mode.md §7.2, §9): what the app's
// push registration and the notification switches rely on —
// notifications.push.register / unregister / preferences / setPreference.
// The tokens are fake but well-formed; the local API runs without
// EXPO_PUSH_ENABLED, so nothing here ever reaches Expo. (Whether an event
// enqueues a push is not visible through the API: PushService and the
// delivery worker are covered by the API unit tests.)

const fakeToken = () => `ExponentPushToken[contract-${randomUUID()}]`;

const enabledOf = (dto: PushPreferencesDto) =>
  Object.fromEntries(dto.preferences.map((p) => [p.key, p.enabled]));

describe('notifications.push', () => {
  it('preferences: every §7.2 key, default on, with its audience; no device yet', async () => {
    const user = await makeCoachUser({ prefix: 'push-defaults' });
    const prefs = await user.api.notifications.push.preferences.query();
    expect(prefs.hasDevice).toBe(false);
    expect(prefs.preferences).toEqual(
      PUSH_PREFERENCE_KEYS.map((key) => ({
        key,
        enabled: true,
        audience: PUSH_PREFERENCE_AUDIENCE[key],
      })),
    );
  });

  it('setPreference turns one switch off (and back on), returning the whole list', async () => {
    const user = await makeCoachUser({ prefix: 'push-switch' });
    const off = await user.api.notifications.push.setPreference.mutate({
      key: 'coaching.routine',
      enabled: false,
    });
    expect(enabledOf(off)['coaching.routine']).toBe(false);
    expect(off.preferences.filter((p) => !p.enabled)).toHaveLength(1);
    // Persisted: a fresh read agrees.
    const read = await user.api.notifications.push.preferences.query();
    expect(enabledOf(read)['coaching.routine']).toBe(false);
    const on = await user.api.notifications.push.setPreference.mutate({
      key: 'coaching.routine',
      enabled: true,
    });
    expect(on.preferences.every((p) => p.enabled)).toBe(true);
  });

  it('register → hasDevice; registering again is idempotent; unregister → no device', async () => {
    const user = await makeCoachUser({ prefix: 'push-register' });
    const token = fakeToken();
    await expect(
      user.api.notifications.push.register.mutate({
        token,
        platform: 'IOS',
        appVersion: '1.0.3',
      }),
    ).resolves.toEqual({ ok: true });
    await user.api.notifications.push.register.mutate({
      token,
      platform: 'IOS',
      appVersion: '1.0.4',
    });
    expect((await user.api.notifications.push.preferences.query()).hasDevice).toBe(true);
    await expect(user.api.notifications.push.unregister.mutate({ token })).resolves.toEqual({
      ok: true,
    });
    expect((await user.api.notifications.push.preferences.query()).hasDevice).toBe(false);
    // Unregistering an unknown token is a no-op, not an error.
    await expect(user.api.notifications.push.unregister.mutate({ token })).resolves.toEqual({
      ok: true,
    });
  });

  it('a token signed in on another account moves to it; the old account cannot unregister it', async () => {
    const first = await makeCoachUser({ prefix: 'push-move-a' });
    const second = await makeCoachUser({ prefix: 'push-move-b' });
    const token = fakeToken();
    await first.api.notifications.push.register.mutate({
      token,
      platform: 'ANDROID',
      appVersion: '1.0.3',
    });
    await second.api.notifications.push.register.mutate({
      token,
      platform: 'ANDROID',
      appVersion: '1.0.3',
    });
    expect((await first.api.notifications.push.preferences.query()).hasDevice).toBe(false);
    expect((await second.api.notifications.push.preferences.query()).hasDevice).toBe(true);
    // The first account signing out (late) must not remove the second's device.
    await first.api.notifications.push.unregister.mutate({ token });
    expect((await second.api.notifications.push.preferences.query()).hasDevice).toBe(true);
  });

  it('rejects a malformed token and an unknown preference key', async () => {
    const user = await makeCoachUser({ prefix: 'push-invalid' });
    await expect(
      user.api.notifications.push.register.mutate({
        token: 'not-a-push-token',
        platform: 'IOS',
        appVersion: '1.0.3',
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    await expect(
      user.api.notifications.push.setPreference.mutate({
        key: 'food.weight' as never,
        enabled: false,
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
  });
});
