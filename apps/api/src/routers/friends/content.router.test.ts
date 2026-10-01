import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { resetRateLimits } from '../../lib/rate-limit.js';
import { router, type Context } from '../../lib/trpc.js';
import { contentProcedures } from './content.router.js';

// friends.profile/week/recipes/routine/workouts wiring (plan §4.2): each row's
// access scope, the 300/h limit, and the client level reaching the gym reads.

vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: (key: string) => key === 'friends' }));
vi.mock('../../lib/env.js', () => ({ env: { FRIENDS_ALLOWLIST: new Set() } }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const access = vi.hoisted(() => ({
  assert: vi.fn(),
  profile: vi.fn(),
}));
vi.mock('../../application/friends/social-access.service.js', () => ({
  SocialAccessMemo: vi.fn(),
  socialAccessService: access,
}));
const content = vi.hoisted(() => ({
  profile: vi.fn(async () => 'profile'),
  week: vi.fn(async () => 'week'),
  recipes: vi.fn(async () => 'recipes'),
  routine: vi.fn(async () => 'routine'),
  workouts: vi.fn(async () => 'workouts'),
}));
vi.mock('../../application/friends/friend-content.service.js', () => ({
  friendContentService: content,
}));

const ME = 'cme000000000000000000001';
const OWNER = 'cowner000000000000000001';
const user: UserProfile = {
  id: ME,
  email: 'me@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const ctx = (clientApiLevel = 0): Context => ({
  user,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel,
  res: {} as ExpressResponse,
});
const caller = (level?: number) => router(contentProcedures).createCaller(ctx(level));
const resolved = { visible: true, isSelf: false, can: {} };

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  access.profile.mockResolvedValue({ userId: ME });
  access.assert.mockResolvedValue(resolved);
});

describe('friends content procedures', () => {
  it.each([
    ['profile', 'header'],
    ['week', 'plan'],
    ['recipes', 'recipes'],
    ['routine', 'workouts'],
    ['workouts', 'workouts'],
  ] as const)('friends.%s asserts scope %s for input.userId', async (name, scope) => {
    await expect(caller()[name]({ userId: OWNER })).resolves.toBe(name);
    expect(access.assert).toHaveBeenCalledWith(ME, OWNER, scope, expect.anything());
  });

  it('passes the viewer, the owner and the resolved access to the service', async () => {
    await caller().week({ userId: OWNER });
    expect(content.week).toHaveBeenCalledWith(ME, OWNER, resolved);
    await caller().recipes({ userId: OWNER, search: 'soup', limit: 10 });
    expect(content.recipes).toHaveBeenCalledWith(ME, OWNER, {
      search: 'soup',
      cursor: undefined,
      limit: 10,
    });
  });

  it('gates gym reads on the effective level (cardioLogging off caps at 2)', async () => {
    await caller(5).workouts({ userId: OWNER });
    expect(content.workouts).toHaveBeenCalledWith(OWNER, 2);
    await caller(1).routine({ userId: OWNER });
    expect(content.routine).toHaveBeenCalledWith(OWNER, 1);
  });

  it('a denied access never reaches the service', async () => {
    access.assert.mockRejectedValueOnce(new Error('denied'));
    await expect(caller().week({ userId: OWNER })).rejects.toThrow();
    expect(content.week).not.toHaveBeenCalled();
  });

  it('rate limit: 300 per hour per procedure, counted before the access check', async () => {
    access.assert.mockRejectedValue(new Error('denied'));
    for (let i = 0; i < 300; i++) {
      await caller()
        .profile({ userId: OWNER })
        .catch(() => undefined);
    }
    await expect(caller().profile({ userId: OWNER })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(access.assert).toHaveBeenCalledTimes(300);
    // Buckets are per procedure.
    access.assert.mockResolvedValue(resolved);
    await expect(caller().week({ userId: OWNER })).resolves.toBe('week');
  });
});
