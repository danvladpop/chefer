import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Prisma,
  type MutualCandidateRow,
  type PopularProfileRow,
  type SocialProfile,
  type SocialProfileWithUser,
  type SocialUserRow,
} from '@chefer/database';
import { FRIENDS_LIMITS } from '@chefer/types';
import { FriendSummaryHydrator } from './activity.service.js';
import { SuggestionCache, SuggestionService } from './suggestion.service.js';

// "Suggested for you" (PRD §11, FR-09; plan §9 "Services": suggestions incl.
// `featured`). Sources, exclusions, ordering, reason lines, the 10-minute
// per-viewer cache and its invalidation.

const ME = 'cme000000000000000000001';
const MUT = 'cmut00000000000000000001'; // followed by 2 people I follow
const FOL = 'cfol00000000000000000001'; // follows me, I don't follow back
const POP = 'cpop00000000000000000001'; // popular, 40 followers
const KIT = 'ckit00000000000000000001'; // Chefer Kitchen, featured, 0 followers
const GONE = 'cgone0000000000000000001'; // a mutual candidate who turned Following off
const FORCED = 'cforced00000000000000001';
const BOB = 'cbob00000000000000000001'; // the mutual ("Followed by Bob")
const DISMISSED = 'cdism0000000000000000001';
const BLOCKED = 'cblock0000000000000000001';
const FOLLOWED = 'cfollowed000000000000001';

const T0 = new Date('2026-09-30T10:00:00.000Z');

function profile(userId: string, over: Partial<SocialProfile> = {}): SocialProfileWithUser {
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
    activatedAt: T0,
    updatedAt: T0,
    ...over,
    user: user(userId),
  };
}

function user(id: string): SocialUserRow {
  const first = id.slice(1, 4);
  return {
    id,
    firstName: `${first.charAt(0).toUpperCase()}${first.slice(1)}`,
    lastName: 'X',
    name: null,
    image: null,
  };
}

function makeWorld() {
  let now = T0.getTime();
  const mutuals: MutualCandidateRow[] = [
    { userId: MUT, mutualCount: 2, latestMutualId: BOB },
    { userId: GONE, mutualCount: 1, latestMutualId: BOB },
  ];
  const popular: PopularProfileRow[] = [
    { profile: profile(POP), followerCount: 40 },
    { profile: profile(KIT, { featured: true }), followerCount: 0 },
  ];
  const profiles = new Map<string, SocialProfileWithUser>([
    [MUT, profile(MUT, { visibility: 'PRIVATE' })],
    [FOL, profile(FOL)],
    [FORCED, profile(FORCED, { forcedPrivateAt: T0 })],
  ]);
  const follows = {
    mutualCandidates: vi.fn(() => Promise.resolve(mutuals)),
    followersNotFollowedBack: vi.fn(() => Promise.resolve([FOL, FORCED])),
    followerCounts: vi.fn((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, id === MUT ? 2 : 1]))),
    ),
    outgoingIds: vi.fn(() => Promise.resolve([FOLLOWED])),
  };
  const repoProfiles = {
    popular: vi.fn(() => Promise.resolve(popular)),
    findMany: vi.fn((ids: string[]) =>
      Promise.resolve(
        ids.flatMap((id) => {
          const p = profiles.get(id);
          return p ? [p] : [];
        }),
      ),
    ),
  };
  const blocks = { blockedIdsEither: vi.fn(() => Promise.resolve([BLOCKED])) };
  const dismissals = {
    activeIds: vi.fn(() => Promise.resolve([DISMISSED])),
    upsert: vi.fn(() => Promise.resolve({ userId: ME, dismissedUserId: MUT, createdAt: T0 })),
  };
  const users = [MUT, FOL, POP, KIT, BOB, GONE].map(user);
  const hydrator = new FriendSummaryHydrator(
    { findUsers: (ids: string[]) => Promise.resolve(users.filter((u) => ids.includes(u.id))) },
    { findEdgesWith: () => Promise.resolve([]) },
  );
  const cache = new SuggestionCache();
  const service = new SuggestionService(
    follows,
    repoProfiles,
    blocks,
    dismissals,
    hydrator,
    cache,
    () => now,
  );
  return {
    service,
    follows,
    repoProfiles,
    dismissals,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

describe('SuggestionService.list', () => {
  it('merges the three sources, ranked: follows-you (25) > mutual ×2 (20) > popular > featured', async () => {
    const list = await w.service.list(ME, 30);
    expect(list.map((s) => [s.id, s.reason])).toEqual([
      [FOL, 'follows_you'],
      [MUT, 'mutual'],
      [POP, 'popular'],
      [KIT, 'popular'],
    ]);
  });

  it('Chefer Kitchen (featured) is suggested with 0 followers — the cold start is never empty', async () => {
    w.follows.mutualCandidates.mockResolvedValueOnce([]);
    w.follows.followersNotFollowedBack.mockResolvedValueOnce([]);
    w.repoProfiles.popular.mockResolvedValueOnce([
      { profile: profile(KIT, { featured: true }), followerCount: 0 },
    ]);
    const list = await w.service.list(ME, 5);
    expect(list).toEqual([expect.objectContaining({ id: KIT, reason: 'popular', mutualCount: 0 })]);
  });

  it('no candidates at all → empty (the app shows the invite card)', async () => {
    w.follows.mutualCandidates.mockResolvedValueOnce([]);
    w.follows.followersNotFollowedBack.mockResolvedValueOnce([]);
    w.repoProfiles.popular.mockResolvedValueOnce([]);
    await expect(w.service.list(ME, 5)).resolves.toEqual([]);
  });

  it('passes me, blocks, dismissals (90 d) and my follows/requests as exclusions to every source', async () => {
    await w.service.list(ME, 5);
    const exclude = [ME, BLOCKED, DISMISSED, FOLLOWED];
    expect(w.follows.mutualCandidates).toHaveBeenCalledWith(ME, expect.any(Number), exclude);
    expect(w.follows.followersNotFollowedBack).toHaveBeenCalledWith(
      ME,
      expect.any(Number),
      exclude,
    );
    const [minFollowers, activeSince, popExclude] = w.repoProfiles.popular.mock
      .calls[0] as unknown as [number, Date, string[]];
    expect(minFollowers).toBe(FRIENDS_LIMITS.popularMinFollowers);
    expect(T0.getTime() - activeSince.getTime()).toBe(
      FRIENDS_LIMITS.popularActiveDays * 86_400_000,
    );
    expect(popExclude).toEqual(exclude);
    const [, since] = w.dismissals.activeIds.mock.calls[0] as unknown as [string, Date];
    expect(T0.getTime() - since.getTime()).toBe(FRIENDS_LIMITS.dismissalDays * 86_400_000);
  });

  it('drops a candidate who is forced private or has no profile any more', async () => {
    const ids = (await w.service.list(ME, 30)).map((s) => s.id);
    expect(ids).not.toContain(FORCED);
    expect(ids).not.toContain(GONE);
  });

  it('reason lines: mutual carries reasonName + mutualCount; others have no reasonName', async () => {
    const list = await w.service.list(ME, 30);
    expect(list.find((s) => s.id === MUT)).toMatchObject({
      reason: 'mutual',
      mutualCount: 2,
      reasonName: 'Bob X',
      relation: 'none',
    });
    expect(list.find((s) => s.id === FOL)).not.toHaveProperty('reasonName');
  });

  it('caps the limit at 30 and honours smaller limits', async () => {
    expect(await w.service.list(ME, 2)).toHaveLength(2);
    expect(await w.service.list(ME, 1000)).toHaveLength(4);
  });
});

describe('cache (10 min per viewer)', () => {
  it('serves repeat reads from the cache, recomputes after 10 minutes', async () => {
    await w.service.list(ME, 5);
    await w.service.list(ME, 30);
    expect(w.follows.mutualCandidates).toHaveBeenCalledTimes(1);
    w.advance(FRIENDS_LIMITS.suggestionCacheMs);
    await w.service.list(ME, 5);
    expect(w.follows.mutualCandidates).toHaveBeenCalledTimes(2);
  });

  it('is per viewer, and invalidate / invalidateAll drop entries', async () => {
    await w.service.list(ME, 5);
    await w.service.list(BOB, 5);
    expect(w.follows.mutualCandidates).toHaveBeenCalledTimes(2);
    w.service.invalidate(ME);
    await w.service.list(ME, 5);
    await w.service.list(BOB, 5);
    expect(w.follows.mutualCandidates).toHaveBeenCalledTimes(3);
    w.service.invalidateAll();
    expect(w.cache.size).toBe(0);
  });

  it('the LRU evicts the least recently used viewer past its bound', () => {
    let now = 0;
    const cache = new SuggestionCache(1000, 2);
    cache.set('a', [], now);
    cache.set('b', [], now);
    expect(cache.get('a', now)).toEqual([]); // a is now most recent
    cache.set('c', [], now);
    expect(cache.get('b', now)).toBeNull();
    expect(cache.get('a', now)).toEqual([]);
    now = 1000;
    expect(cache.get('c', now)).toBeNull(); // TTL
  });
});

describe('dismiss', () => {
  it('records the dismissal (idempotent upsert) and invalidates my cache', async () => {
    await w.service.list(ME, 5);
    await expect(w.service.dismiss(ME, MUT)).resolves.toEqual({ ok: true });
    expect(w.dismissals.upsert).toHaveBeenCalledWith(ME, MUT);
    await w.service.list(ME, 5);
    expect(w.follows.mutualCandidates).toHaveBeenCalledTimes(2);
  });

  it('dismissing yourself writes nothing; an unknown id (FK) is the same ok', async () => {
    await expect(w.service.dismiss(ME, ME)).resolves.toEqual({ ok: true });
    expect(w.dismissals.upsert).not.toHaveBeenCalled();
    w.dismissals.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 't' }),
    );
    await expect(w.service.dismiss(ME, 'cunknown0000000000000001')).resolves.toEqual({ ok: true });
    w.dismissals.upsert.mockRejectedValueOnce(new Error('db down'));
    await expect(w.service.dismiss(ME, MUT)).rejects.toThrow('db down');
  });
});
