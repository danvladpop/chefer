import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialProfile } from '@chefer/database';
import { FRIENDS_COPY, FRIENDS_LIMITS, type UserProfile } from '@chefer/types';
import { PROFILE_NOT_AVAILABLE_MESSAGE } from '../../lib/friends-errors.js';
import { resetRateLimits } from '../../lib/rate-limit.js';
import type { Context } from '../../lib/trpc.js';
import { friendsRouter } from './index.js';

// friends.* graph procedures (plan §4.2, L-GRAPH rows): the wiring only —
// base procedure, middleware, rate limits and the service each one calls.
// The services themselves are tested in application/friends/*.test.ts.

vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: (key: string) => key === 'friends' }));
vi.mock('../../lib/env.js', () => ({
  env: new Proxy({}, { get: (_t, key) => (key === 'FRIENDS_ALLOWLIST' ? new Set() : undefined) }),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ME = 'cme000000000000000000001';
const PUB = 'cpub00000000000000000001';
const BLOCKER = 'cblocker0000000000000001';
const DORMANT = 'cdormant0000000000000001';

const world = vi.hoisted(() => ({ profiles: new Map<string, unknown>() }));
vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    socialProfileRepository: {
      find: vi.fn((id: string) => Promise.resolve(world.profiles.get(id) ?? null)),
    },
    followRepository: {
      findPair: vi.fn(() => Promise.resolve({ outgoing: null, incoming: null })),
    },
    blockRepository: {
      existsEither: vi.fn((a: string, b: string) =>
        Promise.resolve([a, b].includes(BLOCKER) && [a, b].includes(ME)),
      ),
    },
  };
});

const svc = vi.hoisted(() => ({
  me: vi.fn(() => Promise.resolve({ activated: true })),
  activate: vi.fn(() => Promise.resolve({ activated: true })),
  deactivate: vi.fn(() => Promise.resolve({ ok: true })),
  search: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  suggestions: vi.fn(() => Promise.resolve([])),
  follow: vi.fn(() => Promise.resolve({ relation: 'following' })),
  block: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('../../application/friends/social-profile.service.js', () => ({
  socialProfileService: { me: svc.me, activate: svc.activate, deactivate: svc.deactivate },
}));
vi.mock('../../application/friends/friend-search.service.js', () => ({
  friendSearchService: { search: svc.search },
}));
vi.mock('../../application/friends/suggestion.service.js', () => ({
  suggestionService: { list: svc.suggestions },
}));
vi.mock('../../application/friends/follow.service.js', () => ({
  followService: { follow: svc.follow },
}));
vi.mock('../../application/friends/block.service.js', () => ({
  blockService: { block: svc.block },
}));

function profile(userId: string, over: Partial<SocialProfile> = {}): SocialProfile {
  return {
    userId,
    visibility: 'PUBLIC',
    searchName: userId,
    sharePlan: true,
    shareRecipes: true,
    shareWorkouts: true,
    shareTargets: false,
    forcedPrivateAt: null,
    featured: false,
    activatedAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...over,
  };
}

const user: UserProfile = {
  id: ME,
  email: 'me@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = () =>
  friendsRouter.createCaller({
    user,
    requestId: 't',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: true,
    clientApiLevel: 0,
    res: {} as ExpressResponse,
  } satisfies Context);

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  world.profiles = new Map<string, unknown>([
    [ME, profile(ME)],
    [PUB, profile(PUB)],
    [BLOCKER, profile(BLOCKER)],
  ]);
});

describe('friends graph procedures', () => {
  it('me and activate work before turning on; the rest need an activated caller', async () => {
    world.profiles.delete(ME);
    await expect(caller().me()).resolves.toEqual({ activated: true });
    await caller().activate({ visibility: 'PRIVATE', firstName: 'Maria', lastName: 'Pop' });
    expect(svc.activate).toHaveBeenCalledWith(
      ME,
      { visibility: 'PRIVATE', firstName: 'Maria', lastName: 'Pop' },
      'mobile',
    );
    await expect(caller().search({ query: 'ana' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(svc.search).not.toHaveBeenCalled();
  });

  it('search: 60 a minute, then the Following copy', async () => {
    for (let i = 0; i < 60; i++) await caller().search({ query: 'ana' });
    await expect(caller().search({ query: 'ana' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: FRIENDS_COPY.search.rateLimited,
    });
    expect(svc.search).toHaveBeenCalledTimes(60);
    expect(svc.search).toHaveBeenCalledWith(ME, { query: 'ana', limit: FRIENDS_LIMITS.pageSize });
  });

  it('search input: 2–100 chars after trimming', async () => {
    await expect(caller().search({ query: ' a ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().search({ query: 'a'.repeat(101) })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('follow runs requireSocialAccess(header): blocked / not activated → NOT_FOUND before the service', async () => {
    for (const target of [BLOCKER, DORMANT]) {
      await expect(caller().follow({ userId: target })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: PROFILE_NOT_AVAILABLE_MESSAGE,
      });
    }
    expect(svc.follow).not.toHaveBeenCalled();
    await expect(caller().follow({ userId: PUB })).resolves.toEqual({ relation: 'following' });
    expect(svc.follow).toHaveBeenCalledWith(ME, PUB, expect.anything());
  });

  it('follow: 60 an hour', async () => {
    for (let i = 0; i < 60; i++) await caller().follow({ userId: PUB });
    await expect(caller().follow({ userId: PUB })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('F3.1 follow: probing ids that are not visible counts against the same 60 an hour', async () => {
    for (let i = 0; i < 60; i++) {
      await expect(caller().follow({ userId: BLOCKER })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    await expect(caller().follow({ userId: PUB })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(svc.follow).not.toHaveBeenCalled();
  });

  it('F3.1 deactivate: idempotent — turning off again (no profile) answers ok, not PRECONDITION_FAILED', async () => {
    await expect(caller().deactivate({ confirm: 'TURN_OFF' })).resolves.toEqual({ ok: true });
    world.profiles.delete(ME);
    await expect(caller().deactivate({ confirm: 'TURN_OFF' })).resolves.toEqual({ ok: true });
    expect(svc.deactivate).toHaveBeenCalledTimes(2);
  });

  it('block: 30 a day, no access check (works on someone who blocked me)', async () => {
    for (let i = 0; i < 30; i++) await caller().block({ userId: BLOCKER });
    await expect(caller().block({ userId: BLOCKER })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('suggestions: default 5, at most 30', async () => {
    await caller().suggestions();
    expect(svc.suggestions).toHaveBeenLastCalledWith(ME, FRIENDS_LIMITS.suggestionsHome);
    await caller().suggestions({ limit: 30 });
    expect(svc.suggestions).toHaveBeenLastCalledWith(ME, 30);
    await expect(caller().suggestions({ limit: 31 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
