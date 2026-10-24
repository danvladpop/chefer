import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { resetRateLimits } from '../lib/rate-limit.js';
import { router, type Context } from '../lib/trpc.js';
import { notificationsRouter } from './notifications.router.js';

// notifications.push.* (trainer-mode.md §9): signed-in only, inputs parsed by
// the shared schemas, each call reaching PushService for the CALLER.

vi.mock('../lib/env.js', () => ({ env: {} }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../application/notifications/email-preferences.service.js', () => ({
  emailPreferencesService: {},
}));
const push = vi.hoisted(() => ({
  register: vi.fn(async () => ({ ok: true as const })),
  unregister: vi.fn(async () => ({ ok: true as const })),
  preferences: vi.fn(async () => ({ preferences: [], hasDevice: false })),
  setPreference: vi.fn(async () => ({ preferences: [], hasDevice: true })),
}));
vi.mock('../application/notifications/push.service.js', () => ({ pushService: push }));

const ME = 'cme000000000000000000001';
const user: UserProfile = {
  id: ME,
  email: 'me@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const ctx = (signedIn = true): Context => ({
  user: signedIn ? user : null,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel: 9,
  res: {} as ExpressResponse,
});
const caller = (signedIn = true) =>
  router({ notifications: notificationsRouter }).createCaller(ctx(signedIn)).notifications.push;

const TOKEN = 'ExponentPushToken[abc123]';

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
});

describe('notifications.push', () => {
  it('register / unregister / preferences / setPreference reach the service for the caller', async () => {
    await caller().register({ token: TOKEN, platform: 'IOS', appVersion: '1.0.3' });
    expect(push.register).toHaveBeenCalledWith(ME, {
      token: TOKEN,
      platform: 'IOS',
      appVersion: '1.0.3',
    });
    await caller().unregister({ token: TOKEN });
    expect(push.unregister).toHaveBeenCalledWith(ME, TOKEN);
    await expect(caller().preferences()).resolves.toEqual({ preferences: [], hasDevice: false });
    expect(push.preferences).toHaveBeenCalledWith(ME);
    await caller().setPreference({ key: 'coaching.routine', enabled: false });
    expect(push.setPreference).toHaveBeenCalledWith(ME, 'coaching.routine', false);
  });

  it('rejects a malformed token or an unknown key', async () => {
    await expect(
      caller().register({ token: 'not-a-token', platform: 'IOS', appVersion: '1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller().setPreference({ key: 'food.weight' as never, enabled: false }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(push.register).not.toHaveBeenCalled();
  });

  it('is signed-in only', async () => {
    await expect(caller(false).preferences()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('register is rate-limited', async () => {
    for (let i = 0; i < 30; i += 1) {
      await caller().register({ token: TOKEN, platform: 'ANDROID', appVersion: '1' });
    }
    await expect(
      caller().register({ token: TOKEN, platform: 'ANDROID', appVersion: '1' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});
