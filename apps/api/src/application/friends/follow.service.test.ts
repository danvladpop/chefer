import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Prisma,
  type Follow,
  type FollowStatus,
  type SocialDbClient,
  type SocialProfile,
  type SocialUserRow,
} from '@chefer/database';
import { PROFILE_NOT_AVAILABLE_MESSAGE } from '../../lib/friends-errors.js';
import { FriendSummaryHydrator, type SocialTx } from './activity.service.js';
import {
  FollowService,
  KeyedWindowLimiter,
  REQUEST_CAP,
  type FollowServiceRepository,
} from './follow.service.js';
import { SocialAccessMemo, SocialAccessService } from './social-access.service.js';

// The follow lifecycle (PRD §6.2, FR-07, FR-12; plan §9 "Services": lifecycle
// and idempotency, the request cap). An in-memory world behind the follow
// repository, with the REAL SocialAccessService over it, so "blocked / not
// activated / unknown → NOT_FOUND" is the production rule, not a stub.

const ME = 'cme000000000000000000001';
const PUB = 'cpub00000000000000000001';
const PRIV = 'cpriv0000000000000000001';
const FORCED = 'cforced00000000000000001';
const OFF = 'coff00000000000000000001';
const BLOCKER = 'cblocker0000000000000001';

const T0 = new Date('2026-09-30T10:00:00.000Z');

function profile(userId: string, over: Partial<SocialProfile> = {}): SocialProfile {
  return {
    userId,
    visibility: 'PRIVATE',
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
  };
}

interface Notice {
  op: 'notify' | 'withdraw';
  recipient: string;
  kind: string;
  actor: string;
  tx: SocialDbClient | undefined;
}

function makeWorld() {
  let clock = 0;
  const follows: Follow[] = [];
  const profiles = new Map<string, SocialProfile>([
    [ME, profile(ME)],
    [PUB, profile(PUB, { visibility: 'PUBLIC' })],
    [PRIV, profile(PRIV)],
    [FORCED, profile(FORCED, { visibility: 'PRIVATE', forcedPrivateAt: T0 })],
    [BLOCKER, profile(BLOCKER, { visibility: 'PUBLIC' })],
  ]);
  const blocks = [{ blockerId: BLOCKER, blockedId: ME }];
  const users: SocialUserRow[] = [ME, PUB, PRIV, FORCED, OFF, BLOCKER].map((id) => ({
    id,
    firstName: id.slice(1, 4),
    lastName: 'X',
    name: null,
    image: null,
  }));
  const notices: Notice[] = [];
  const txs: SocialDbClient[] = [];

  const find = (a: string, b: string) =>
    follows.find((f) => f.followerId === a && f.followeeId === b) ?? null;
  const page = (rows: Follow[], cursor: { createdAt: Date; id: string } | null, take: number) =>
    rows
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? 1 : -1))
      .filter(
        (f) =>
          !cursor ||
          f.createdAt < cursor.createdAt ||
          (f.createdAt.getTime() === cursor.createdAt.getTime() && f.id < cursor.id),
      )
      .slice(0, take);

  const repo = {
    find: vi.fn((a: string, b: string) => Promise.resolve(find(a, b))),
    create: vi.fn((data: { followerId: string; followeeId: string; status: FollowStatus }) => {
      if (find(data.followerId, data.followeeId)) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' }),
        );
      }
      const row: Follow = {
        id: `f${String(++clock).padStart(3, '0')}`,
        ...data,
        createdAt: new Date(T0.getTime() + clock * 1000),
        acceptedAt: data.status === 'ACCEPTED' ? T0 : null,
      };
      follows.push(row);
      return Promise.resolve(row);
    }),
    accept: vi.fn((a: string, b: string) => {
      const row = find(a, b);
      if (row?.status !== 'PENDING') return Promise.resolve(null);
      row.status = 'ACCEPTED';
      return Promise.resolve(row);
    }),
    delete: vi.fn((a: string, b: string) => {
      const i = follows.findIndex((f) => f.followerId === a && f.followeeId === b);
      if (i >= 0) follows.splice(i, 1);
      return Promise.resolve(i >= 0);
    }),
    deletePending: vi.fn((a: string, b: string) => {
      const i = follows.findIndex(
        (f) => f.followerId === a && f.followeeId === b && f.status === 'PENDING',
      );
      if (i >= 0) follows.splice(i, 1);
      return Promise.resolve(i >= 0);
    }),
    listFollowing: vi.fn((u: string, c: { createdAt: Date; id: string } | null, n: number) =>
      Promise.resolve(
        page(
          follows.filter((f) => f.followerId === u && f.status === 'ACCEPTED'),
          c,
          n,
        ),
      ),
    ),
    listFollowers: vi.fn((u: string, c: { createdAt: Date; id: string } | null, n: number) =>
      Promise.resolve(
        page(
          follows.filter((f) => f.followeeId === u && f.status === 'ACCEPTED'),
          c,
          n,
        ),
      ),
    ),
    listPendingTo: vi.fn((u: string, c: { createdAt: Date; id: string } | null, n: number) =>
      Promise.resolve(
        page(
          follows.filter((f) => f.followeeId === u && f.status === 'PENDING'),
          c,
          n,
        ),
      ),
    ),
    counts: vi.fn((u: string) =>
      Promise.resolve({
        followers: follows.filter((f) => f.followeeId === u && f.status === 'ACCEPTED').length,
        following: follows.filter((f) => f.followerId === u && f.status === 'ACCEPTED').length,
        pendingRequests: follows.filter((f) => f.followeeId === u && f.status === 'PENDING').length,
      }),
    ),
  } satisfies FollowServiceRepository;

  const access = new SocialAccessService(
    { find: (id: string) => Promise.resolve(profiles.get(id) ?? null) },
    {
      findPair: (a: string, b: string) =>
        Promise.resolve({ outgoing: find(a, b), incoming: find(b, a) }),
    },
    {
      existsEither: (a: string, b: string) =>
        Promise.resolve(
          blocks.some(
            (x) =>
              (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a),
          ),
        ),
    },
  );
  const activity = {
    notify: vi.fn((recipient: string, kind: string, actor: string, tx?: SocialDbClient) => {
      notices.push({ op: 'notify', recipient, kind, actor, tx });
      return Promise.resolve();
    }),
    withdraw: vi.fn((recipient: string, kind: string, actor: string, tx?: SocialDbClient) => {
      notices.push({ op: 'withdraw', recipient, kind, actor, tx });
      return Promise.resolve();
    }),
  };
  const suggestions = { invalidate: vi.fn(), invalidateAll: vi.fn() };
  const hydrator = new FriendSummaryHydrator(
    { findUsers: (ids: string[]) => Promise.resolve(users.filter((u) => ids.includes(u.id))) },
    {
      findEdgesWith: (v: string, ids: string[]) =>
        Promise.resolve(
          follows.filter(
            (f) =>
              (f.followerId === v && ids.includes(f.followeeId)) ||
              (f.followeeId === v && ids.includes(f.followerId)),
          ),
        ),
    },
  );
  const tx: SocialTx = (fn) => {
    const t = { id: txs.length } as unknown as SocialDbClient;
    txs.push(t);
    return fn(t);
  };
  let now = T0.getTime();
  const cap = new KeyedWindowLimiter(REQUEST_CAP.max, REQUEST_CAP.windowMs, () => now);
  const service = new FollowService(repo, access, activity, suggestions, hydrator, tx, cap);
  return {
    service,
    repo,
    follows,
    profiles,
    notices,
    txs,
    suggestions,
    find,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

async function expectTrpc(promise: Promise<unknown>, code: TRPCError['code'], message?: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TRPCError);
  expect((err as TRPCError).code).toBe(code);
  if (message) expect((err as TRPCError).message).toBe(message);
}

describe('follow', () => {
  it('public → following at once, NEW_FOLLOWER to the owner, in the same transaction', async () => {
    await expect(w.service.follow(ME, PUB)).resolves.toEqual({ relation: 'following' });
    expect(w.find(ME, PUB)?.status).toBe('ACCEPTED');
    const notify = w.notices.find((n) => n.op === 'notify');
    expect(notify).toMatchObject({ recipient: PUB, kind: 'NEW_FOLLOWER', actor: ME });
    expect(notify?.tx).toBe(w.txs[0]);
    expect(w.suggestions.invalidate).toHaveBeenCalledWith(ME);
  });

  it('private → requested, FOLLOW_REQUEST to the owner', async () => {
    await expect(w.service.follow(ME, PRIV)).resolves.toEqual({ relation: 'requested' });
    expect(w.find(ME, PRIV)?.status).toBe('PENDING');
    expect(w.notices).toEqual([
      expect.objectContaining({ op: 'notify', recipient: PRIV, kind: 'FOLLOW_REQUEST', actor: ME }),
    ]);
  });

  it('forced private → always a request, even if visibility were PUBLIC', async () => {
    w.profiles.set(FORCED, profile(FORCED, { visibility: 'PUBLIC', forcedPrivateAt: T0 }));
    await expect(w.service.follow(ME, FORCED)).resolves.toEqual({ relation: 'requested' });
    expect(w.find(ME, FORCED)?.status).toBe('PENDING');
  });

  it('is idempotent: following twice returns the same relation and notifies once', async () => {
    await w.service.follow(ME, PUB);
    await expect(w.service.follow(ME, PUB)).resolves.toEqual({ relation: 'following' });
    await w.service.follow(ME, PRIV);
    await expect(w.service.follow(ME, PRIV)).resolves.toEqual({ relation: 'requested' });
    expect(w.repo.create).toHaveBeenCalledTimes(2);
    expect(w.notices.filter((n) => n.op === 'notify')).toHaveLength(2);
  });

  it('a concurrent duplicate insert (P2002) answers with the stored state', async () => {
    // The other request's insert lands between our access check and our insert.
    w.repo.create.mockImplementationOnce(() => {
      w.follows.push({
        id: 'race',
        followerId: ME,
        followeeId: PRIV,
        status: 'PENDING',
        createdAt: T0,
        acceptedAt: null,
      });
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' }),
      );
    });
    await expect(w.service.follow(ME, PRIV)).resolves.toEqual({ relation: 'requested' });
    expect(w.repo.find).toHaveBeenCalledWith(ME, PRIV);
    // Any other failure propagates.
    w.repo.create.mockRejectedValueOnce(new Error('db down'));
    await expect(w.service.follow(ME, PUB)).rejects.toThrow('db down');
  });

  it('self → BAD_REQUEST; blocked, not activated and unknown → the same NOT_FOUND (INV-3)', async () => {
    await expectTrpc(w.service.follow(ME, ME), 'BAD_REQUEST');
    for (const target of [BLOCKER, OFF, 'cunknown0000000000000001']) {
      await expectTrpc(w.service.follow(ME, target), 'NOT_FOUND', PROFILE_NOT_AVAILABLE_MESSAGE);
    }
    expect(w.repo.create).not.toHaveBeenCalled();
  });

  it('caps requests at 3 per target per 7 days (cancel deletes the row, so it is a limiter)', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(w.service.follow(ME, PRIV)).resolves.toEqual({ relation: 'requested' });
      await w.service.unfollow(ME, PRIV); // cancel
    }
    await expectTrpc(w.service.follow(ME, PRIV), 'TOO_MANY_REQUESTS');
    // Another target is unaffected.
    await expect(w.service.follow(ME, FORCED)).resolves.toEqual({ relation: 'requested' });
    // Instant follows never count.
    for (let i = 0; i < 5; i++) {
      await w.service.follow(ME, PUB);
      await w.service.unfollow(ME, PUB);
    }
    // The window slides: 7 days later the first requests have expired.
    w.advance(REQUEST_CAP.windowMs);
    await expect(w.service.follow(ME, PRIV)).resolves.toEqual({ relation: 'requested' });
  });

  it('clears the request memo so a later check in the same request re-reads', async () => {
    const memo = new SocialAccessMemo();
    await w.service.follow(ME, PUB, memo);
    expect(memo.access.size).toBe(0);
  });
});

describe('unfollow / cancel', () => {
  it('cancelling a request deletes it and withdraws the FOLLOW_REQUEST item', async () => {
    await w.service.follow(ME, PRIV);
    await expect(w.service.unfollow(ME, PRIV)).resolves.toEqual({ relation: 'none' });
    expect(w.find(ME, PRIV)).toBeNull();
    expect(w.notices.at(-1)).toMatchObject({
      op: 'withdraw',
      recipient: PRIV,
      kind: 'FOLLOW_REQUEST',
      actor: ME,
    });
  });

  it('unfollowing an accepted follow removes it silently; repeating is a no-op', async () => {
    await w.service.follow(ME, PUB);
    const before = w.notices.length;
    await w.service.unfollow(ME, PUB);
    expect(w.find(ME, PUB)).toBeNull();
    expect(w.notices.length).toBe(before);
    await expect(w.service.unfollow(ME, PUB)).resolves.toEqual({ relation: 'none' });
    await expect(w.service.unfollow(ME, ME)).resolves.toEqual({ relation: 'none' });
    expect(w.suggestions.invalidate).toHaveBeenCalledWith(ME);
  });
});

describe('accept / decline / remove (the owner side)', () => {
  it('accept → following, REQUEST_ACCEPTED to the requester; twice is a no-op', async () => {
    await w.service.follow(ME, PRIV);
    await expect(w.service.accept(PRIV, ME)).resolves.toEqual({ ok: true });
    expect(w.find(ME, PRIV)?.status).toBe('ACCEPTED');
    const accepted = w.notices.filter((n) => n.kind === 'REQUEST_ACCEPTED');
    expect(accepted).toEqual([
      expect.objectContaining({ recipient: ME, actor: PRIV, tx: w.txs.at(-1) }),
    ]);
    await expect(w.service.accept(PRIV, ME)).resolves.toEqual({ ok: true });
    expect(w.notices.filter((n) => n.kind === 'REQUEST_ACCEPTED')).toHaveLength(1);
    // Nothing pending at all → still ok.
    await expect(w.service.accept(PRIV, PUB)).resolves.toEqual({ ok: true });
  });

  it('decline removes only a pending request, silently, and keeps the item (reads "declined")', async () => {
    await w.service.follow(ME, PRIV);
    const before = w.notices.length;
    await expect(w.service.decline(PRIV, ME)).resolves.toEqual({ ok: true });
    expect(w.find(ME, PRIV)).toBeNull();
    expect(w.notices.length).toBe(before);
    await expect(w.service.decline(PRIV, ME)).resolves.toEqual({ ok: true });
  });

  it('a late decline never removes an accepted follower', async () => {
    await w.service.follow(ME, PRIV);
    await w.service.accept(PRIV, ME);
    await w.service.decline(PRIV, ME);
    expect(w.find(ME, PRIV)?.status).toBe('ACCEPTED');
  });

  it('removeFollower deletes the edge silently; idempotent', async () => {
    await w.service.follow(ME, PUB);
    const before = w.notices.length;
    await expect(w.service.removeFollower(PUB, ME)).resolves.toEqual({ ok: true });
    expect(w.find(ME, PUB)).toBeNull();
    expect(w.notices.length).toBe(before);
    await expect(w.service.removeFollower(PUB, ME)).resolves.toEqual({ ok: true });
  });
});

describe('lists', () => {
  it('following / followers / requests: hydrated summaries, totals and keyset paging', async () => {
    await w.service.follow(ME, PUB);
    await w.service.follow(PUB, ME); // ME is private → a request to me
    await w.service.follow(PRIV, ME);
    await w.service.follow(FORCED, ME);

    const following = await w.service.listFollowing(ME, { limit: 20 });
    expect(following.total).toBe(1);
    expect(following.items).toEqual([
      expect.objectContaining({ id: PUB, relation: 'following', requestedYou: true }),
    ]);

    const requests = await w.service.listRequests(ME, { limit: 2 });
    expect(requests.total).toBe(3);
    expect(requests.items.map((s) => s.id)).toEqual([FORCED, PRIV]); // newest first
    expect(requests.nextCursor).not.toBeNull();
    const rest = await w.service.listRequests(ME, {
      limit: 2,
      cursor: requests.nextCursor ?? undefined,
    });
    expect(rest.items.map((s) => s.id)).toEqual([PUB]);
    expect(rest.nextCursor).toBeNull();

    await w.service.accept(ME, PRIV);
    const followers = await w.service.listFollowers(ME, { limit: 20 });
    expect(followers.total).toBe(1);
    expect(followers.items).toEqual([
      expect.objectContaining({ id: PRIV, followsYou: true, relation: 'none' }),
    ]);
    // INV-6: no list row carries anything but the summary fields.
    for (const item of [...following.items, ...requests.items, ...followers.items]) {
      expect(Object.keys(item)).not.toContain('email');
    }
  });
});

describe('KeyedWindowLimiter', () => {
  it('allows max hits per window per key, sliding', () => {
    let now = 0;
    const limiter = new KeyedWindowLimiter(2, 1000, () => now);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    expect(limiter.tryConsume('b')).toBe(true);
    now = 999;
    expect(limiter.tryConsume('a')).toBe(false);
    now = 1000;
    expect(limiter.tryConsume('a')).toBe(true);
  });
});
