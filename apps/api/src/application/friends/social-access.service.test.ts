import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import type { Follow, FollowStatus, SocialProfile } from '@chefer/database';
import type { SectionAccess } from '@chefer/types';
import { FriendsLockedCause, PROFILE_NOT_AVAILABLE_MESSAGE } from '../../lib/friends-errors.js';
import {
  SocialAccessMemo,
  SocialAccessService,
  type SocialAccess,
  type SocialScope,
} from './social-access.service.js';

// ─── THE AUTHORIZATION ORACLE (implementation-plan.md §9 "Access matrix") ─────
// SocialAccessService against PRD §7.1, row by row, for every owner state
// {public, private, forced private} × every combination of the four sharing
// switches (plan, recipes, workouts, targets) — 16 — plus blocks in both
// directions, a viewer or owner who hasn't turned Following on, and self.
//
// `expectedFor` below is written from the PRD table, NOT from the service's
// code, so a change to either one that breaks the other fails here. Each case
// also runs `assert` for every scope and checks the exact error (INV-3: one
// NOT_FOUND for every kind of "not visible"; FORBIDDEN + friendsLocked only
// when the header is visible).

const VIEWER = 'cviewer00000000000000001';
const OWNER = 'cowner000000000000000001';
const STRANGER = 'cstranger000000000000001';

// ─── An in-memory world behind the three repository interfaces ───────────────

type OwnerState = 'public' | 'private' | 'forced private';
const OWNER_STATES: readonly OwnerState[] = ['public', 'private', 'forced private'];

interface Sharing {
  plan: boolean;
  recipes: boolean;
  workouts: boolean;
  targets: boolean;
}

/** All 16 combinations of the four sharing switches. */
const SHARING: readonly Sharing[] = Array.from({ length: 16 }, (_, bits) => ({
  plan: (bits & 1) !== 0,
  recipes: (bits & 2) !== 0,
  workouts: (bits & 4) !== 0,
  targets: (bits & 8) !== 0,
}));

function profileRow(userId: string, state: OwnerState = 'private', share?: Sharing): SocialProfile {
  const sharing = share ?? { plan: true, recipes: true, workouts: true, targets: false };
  return {
    userId,
    visibility: state === 'public' ? 'PUBLIC' : 'PRIVATE',
    searchName: userId,
    sharePlan: sharing.plan,
    shareRecipes: sharing.recipes,
    shareWorkouts: sharing.workouts,
    shareTargets: sharing.targets,
    forcedPrivateAt: state === 'forced private' ? new Date('2026-09-01T00:00:00Z') : null,
    featured: false,
    activatedAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

interface World {
  profiles: SocialProfile[];
  follows: { followerId: string; followeeId: string; status: FollowStatus }[];
  blocks: { blockerId: string; blockedId: string }[];
}

function followRow(f: World['follows'][number]): Follow {
  return {
    id: `${f.followerId}>${f.followeeId}`,
    ...f,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    acceptedAt: f.status === 'ACCEPTED' ? new Date('2026-09-02T00:00:00Z') : null,
  };
}

function serviceFor(world: World) {
  const profiles = {
    find: vi.fn((userId: string) =>
      Promise.resolve(world.profiles.find((p) => p.userId === userId) ?? null),
    ),
  };
  const follows = {
    findPair: vi.fn((a: string, b: string) => {
      const edge = (x: string, y: string) => {
        const f = world.follows.find((r) => r.followerId === x && r.followeeId === y);
        return f ? followRow(f) : null;
      };
      return Promise.resolve({ outgoing: edge(a, b), incoming: edge(b, a) });
    }),
  };
  const blocks = {
    existsEither: vi.fn((a: string, b: string) =>
      Promise.resolve(
        world.blocks.some(
          (r) =>
            (r.blockerId === a && r.blockedId === b) || (r.blockerId === b && r.blockedId === a),
        ),
      ),
    ),
  };
  return { service: new SocialAccessService(profiles, follows, blocks), profiles, follows, blocks };
}

// ─── PRD §7.1 rows ────────────────────────────────────────────────────────────

/**
 * One viewer row of the PRD table, expressed as how the world looks between
 * the viewer and the owner. `owner` is false when the owner hasn't turned on
 * Following. `viewerId` is OWNER for the self rows.
 */
interface Row {
  name: string;
  viewerId: string;
  viewerActivated: boolean;
  ownerActivated: boolean;
  follows: World['follows'];
  blocks: World['blocks'];
  expect: 'self' | 'follower' | 'header only' | 'not visible';
  outgoing?: FollowStatus | null;
  incoming?: FollowStatus | null;
}

const accepted = (followerId: string, followeeId: string) => ({
  followerId,
  followeeId,
  status: 'ACCEPTED' as const,
});
const pending = (followerId: string, followeeId: string) => ({
  followerId,
  followeeId,
  status: 'PENDING' as const,
});

const ROWS: readonly Row[] = [
  // Owner (self, preview): everything, whatever the switches or visibility.
  {
    name: 'self (preview)',
    viewerId: OWNER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [],
    blocks: [],
    expect: 'self',
  },
  // Accepted follower (public or private profile): sections per switch.
  {
    name: 'accepted follower',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [accepted(VIEWER, OWNER)],
    blocks: [],
    expect: 'follower',
    outgoing: 'ACCEPTED',
    incoming: null,
  },
  {
    name: 'mutual follower (follows back)',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [accepted(VIEWER, OWNER), accepted(OWNER, VIEWER)],
    blocks: [],
    expect: 'follower',
    outgoing: 'ACCEPTED',
    incoming: 'ACCEPTED',
  },
  // Non-follower, public profile (and, same columns, private): header only.
  {
    name: 'non-follower',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [],
    blocks: [],
    expect: 'header only',
    outgoing: null,
    incoming: null,
  },
  // Pending requester, private profile: header (`Requested`), nothing else.
  // Also run against a public owner: a request left over from a race with
  // Private → Public (which accepts them all) must still grant nothing.
  {
    name: 'pending requester',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [pending(VIEWER, OWNER)],
    blocks: [],
    expect: 'header only',
    outgoing: 'PENDING',
    incoming: null,
  },
  // The owner follows the viewer ("Follows you") — grants the viewer nothing.
  {
    name: 'non-follower whom the owner follows',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [accepted(OWNER, VIEWER)],
    blocks: [],
    expect: 'header only',
    outgoing: null,
    incoming: 'ACCEPTED',
  },
  {
    name: 'non-follower whom the owner requested',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [pending(OWNER, VIEWER)],
    blocks: [],
    expect: 'header only',
    outgoing: null,
    incoming: 'PENDING',
  },
  // Blocked, either direction (incl. after a report): "Profile not available".
  {
    name: 'viewer blocked the owner',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [],
    blocks: [{ blockerId: VIEWER, blockedId: OWNER }],
    expect: 'not visible',
  },
  {
    name: 'owner blocked the viewer',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [],
    blocks: [{ blockerId: OWNER, blockedId: VIEWER }],
    expect: 'not visible',
  },
  {
    name: 'blocked both ways',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [],
    blocks: [
      { blockerId: VIEWER, blockedId: OWNER },
      { blockerId: OWNER, blockedId: VIEWER },
    ],
    expect: 'not visible',
  },
  // Defensive: a block always deletes the follows, but even a leftover
  // accepted follow must not leak through one.
  {
    name: 'owner blocked an accepted follower (stale follow row)',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [accepted(VIEWER, OWNER), accepted(OWNER, VIEWER)],
    blocks: [{ blockerId: OWNER, blockedId: VIEWER }],
    expect: 'not visible',
  },
  {
    name: 'follower blocked the owner (stale follow row)',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: true,
    follows: [accepted(VIEWER, OWNER)],
    blocks: [{ blockerId: VIEWER, blockedId: OWNER }],
    expect: 'not visible',
  },
  // Owner hasn't turned on Following: not found.
  {
    name: 'owner not activated',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: false,
    follows: [],
    blocks: [],
    expect: 'not visible',
  },
  {
    name: 'owner not activated (stale follow row)',
    viewerId: VIEWER,
    viewerActivated: true,
    ownerActivated: false,
    follows: [accepted(VIEWER, OWNER)],
    blocks: [],
    expect: 'not visible',
  },
  // "A viewer must have turned on Following themselves to see any profile."
  {
    name: 'viewer not activated',
    viewerId: VIEWER,
    viewerActivated: false,
    ownerActivated: true,
    follows: [],
    blocks: [],
    expect: 'not visible',
  },
  {
    name: 'viewer not activated (stale accepted follow)',
    viewerId: VIEWER,
    viewerActivated: false,
    ownerActivated: true,
    follows: [accepted(VIEWER, OWNER)],
    blocks: [],
    expect: 'not visible',
  },
  {
    name: 'neither activated',
    viewerId: VIEWER,
    viewerActivated: false,
    ownerActivated: false,
    follows: [],
    blocks: [],
    expect: 'not visible',
  },
  // Self, but Following is off: the caller must be activated (§4.3 rule 1).
  {
    name: 'self, not activated',
    viewerId: OWNER,
    viewerActivated: false,
    ownerActivated: false,
    follows: [],
    blocks: [],
    expect: 'not visible',
  },
];

const NOT_VISIBLE: SocialAccess = {
  visible: false,
  isSelf: false,
  ownerVisibility: null,
  outgoing: null,
  incoming: null,
  can: { plan: 'locked', recipes: 'locked', workouts: 'locked', targets: false },
};

/** PRD §7.1, transcribed. */
function expectedFor(row: Row, state: OwnerState, share: Sharing): SocialAccess {
  const visibility = state === 'public' ? 'PUBLIC' : 'PRIVATE';
  switch (row.expect) {
    case 'not visible':
      return NOT_VISIBLE;
    case 'self':
      return {
        visible: true,
        isSelf: true,
        ownerVisibility: visibility,
        outgoing: null,
        incoming: null,
        can: { plan: 'visible', recipes: 'visible', workouts: 'visible', targets: true },
      };
    case 'header only':
      return {
        visible: true,
        isSelf: false,
        ownerVisibility: visibility,
        outgoing: row.outgoing ?? null,
        incoming: row.incoming ?? null,
        can: { plan: 'locked', recipes: 'locked', workouts: 'locked', targets: false },
      };
    case 'follower': {
      const section = (on: boolean): SectionAccess => (on ? 'visible' : 'not_shared');
      return {
        visible: true,
        isSelf: false,
        ownerVisibility: visibility,
        outgoing: row.outgoing ?? null,
        incoming: row.incoming ?? null,
        can: {
          plan: section(share.plan),
          recipes: section(share.recipes),
          workouts: section(share.workouts),
          // "only if `Show my daily targets` on" — and targets ride on the plan.
          targets: share.plan && share.targets,
        },
      };
    }
  }
}

function worldFor(row: Row, state: OwnerState, share: Sharing): World {
  const profiles: SocialProfile[] = [];
  if (row.ownerActivated) profiles.push(profileRow(OWNER, state, share));
  if (row.viewerActivated && row.viewerId !== OWNER) profiles.push(profileRow(row.viewerId));
  return { profiles, follows: row.follows, blocks: row.blocks };
}

const shareLabel = (s: Sharing) =>
  `plan ${s.plan ? 'on' : 'off'}, recipes ${s.recipes ? 'on' : 'off'}, ` +
  `workouts ${s.workouts ? 'on' : 'off'}, targets ${s.targets ? 'on' : 'off'}`;

const CASES = ROWS.flatMap((row) =>
  OWNER_STATES.flatMap((state) =>
    SHARING.map((share) => ({ row, state, share, label: `${state} · ${shareLabel(share)}` })),
  ),
);

const SCOPES: readonly SocialScope[] = ['header', 'plan', 'recipes', 'workouts'];

/** What `assert(scope)` must do for a given expected access. */
async function expectAssertOutcome(
  service: SocialAccessService,
  viewerId: string,
  scope: SocialScope,
  expected: SocialAccess,
): Promise<void> {
  const call = service.assert(viewerId, OWNER, scope);
  if (!expected.visible) {
    await expectProfileNotAvailable(call);
    return;
  }
  const section = scope === 'header' ? 'visible' : expected.can[scope];
  if (section === 'visible') {
    await expect(call).resolves.toEqual(expected);
    return;
  }
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TRPCError);
  expect((err as TRPCError).code).toBe('FORBIDDEN');
  expect((err as TRPCError).cause).toBeInstanceOf(FriendsLockedCause);
  expect(((err as TRPCError).cause as FriendsLockedCause).reason).toBe(section);
}

/** INV-3: the one and only "not visible" error — NOT_FOUND, fixed message, no cause. */
async function expectProfileNotAvailable(call: Promise<unknown>): Promise<void> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  expectProfileNotAvailableError(err);
}

function expectProfileNotAvailableError(err: unknown): void {
  expect(err).toBeInstanceOf(TRPCError);
  expect((err as TRPCError).code).toBe('NOT_FOUND');
  expect((err as TRPCError).message).toBe(PROFILE_NOT_AVAILABLE_MESSAGE);
  expect((err as TRPCError).message).toBe('Profile not available');
  expect((err as TRPCError).cause).toBeUndefined();
}

// ─── The matrix ───────────────────────────────────────────────────────────────

describe('SocialAccessService — PRD §7.1 access matrix', () => {
  for (const row of ROWS) {
    describe(row.name, () => {
      it.each(CASES.filter((c) => c.row === row))('$label', async ({ state, share }) => {
        const expected = expectedFor(row, state, share);
        const { service } = serviceFor(worldFor(row, state, share));

        expect(await service.resolve(row.viewerId, OWNER)).toEqual(expected);
        for (const scope of SCOPES) {
          await expectAssertOutcome(service, row.viewerId, scope, expected);
        }
      });
    });
  }

  it('covers every PRD §7.1 row, every owner state and all 16 sharing combinations', () => {
    const expectations = new Set(ROWS.map((r) => r.expect));
    expect(expectations).toEqual(new Set(['self', 'follower', 'header only', 'not visible']));
    for (const state of OWNER_STATES) {
      expect(CASES.filter((c) => c.state === state && c.row.expect === 'follower')).toHaveLength(
        16 * ROWS.filter((r) => r.expect === 'follower').length,
      );
    }
    expect(new Set(SHARING.map(shareLabel)).size).toBe(16);
  });
});

// ─── Spot checks, readable one by one (the same rules, named) ────────────────

describe('SocialAccessService — named rules', () => {
  const allOn: Sharing = { plan: true, recipes: true, workouts: true, targets: true };

  it('a follower of a FORCED-PRIVATE profile keeps full access (forced private changes nothing here)', async () => {
    const { service } = serviceFor({
      profiles: [profileRow(OWNER, 'forced private', allOn), profileRow(VIEWER)],
      follows: [accepted(VIEWER, OWNER)],
      blocks: [],
    });
    const access = await service.resolve(VIEWER, OWNER);
    expect(access.can).toEqual({
      plan: 'visible',
      recipes: 'visible',
      workouts: 'visible',
      targets: true,
    });
    expect(access.ownerVisibility).toBe('PRIVATE');
  });

  it('targets need BOTH the plan and the targets switch (targets on, plan off → false)', async () => {
    const { service } = serviceFor({
      profiles: [
        profileRow(OWNER, 'public', { plan: false, recipes: true, workouts: true, targets: true }),
        profileRow(VIEWER),
      ],
      follows: [accepted(VIEWER, OWNER)],
      blocks: [],
    });
    const access = await service.resolve(VIEWER, OWNER);
    expect(access.can.plan).toBe('not_shared');
    expect(access.can.targets).toBe(false);
  });

  it('a public profile shows a non-follower the header only (Q-F-4)', async () => {
    const { service } = serviceFor({
      profiles: [profileRow(OWNER, 'public', allOn), profileRow(VIEWER)],
      follows: [],
      blocks: [],
    });
    await expect(service.assert(VIEWER, OWNER, 'header')).resolves.toMatchObject({
      visible: true,
      ownerVisibility: 'PUBLIC',
    });
    await expect(service.assert(VIEWER, OWNER, 'plan')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      cause: { reason: 'locked' },
    });
  });

  it('a follower sees `not_shared`, never `locked`, for a switched-off section', async () => {
    const { service } = serviceFor({
      profiles: [
        profileRow(OWNER, 'private', {
          plan: true,
          recipes: false,
          workouts: true,
          targets: false,
        }),
        profileRow(VIEWER),
      ],
      follows: [accepted(VIEWER, OWNER)],
      blocks: [],
    });
    await expect(service.assert(VIEWER, OWNER, 'recipes')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      cause: { reason: 'not_shared' },
    });
    await expect(service.assert(VIEWER, OWNER, 'plan')).resolves.toBeDefined();
  });
});

// ─── INV-3: no existence oracle ───────────────────────────────────────────────

describe('SocialAccessService — INV-3 (no existence oracle)', () => {
  const world: World = {
    profiles: [
      profileRow(VIEWER),
      profileRow(OWNER, 'public'),
      profileRow(STRANGER, 'public'),
      profileRow('cblocker0000000000000001', 'public'),
    ],
    follows: [],
    blocks: [
      { blockerId: VIEWER, blockedId: OWNER },
      { blockerId: 'cblocker0000000000000001', blockedId: VIEWER },
    ],
  };
  const targets = {
    'blocked by the viewer': OWNER,
    'blocking the viewer': 'cblocker0000000000000001',
    'not activated': 'cnotactivated00000000001',
    nonexistent: 'cnobody00000000000000001',
    'random cuid': 'clr9x2k3m0000qwerty12345',
  };

  it('resolves every kind of "not visible" to the identical value', async () => {
    const { service } = serviceFor(world);
    for (const [kind, id] of Object.entries(targets)) {
      expect(await service.resolve(VIEWER, id), kind).toEqual(NOT_VISIBLE);
    }
  });

  it('throws the identical NOT_FOUND for every kind of "not visible", at every scope', async () => {
    const { service } = serviceFor(world);
    const errors: unknown[] = [];
    for (const id of Object.values(targets)) {
      for (const scope of SCOPES) {
        const err = await service.assert(VIEWER, id, scope).then(
          () => null,
          (e: unknown) => e,
        );
        expectProfileNotAvailableError(err);
        errors.push({
          code: (err as TRPCError).code,
          message: (err as TRPCError).message,
          cause: (err as TRPCError).cause,
        });
      }
    }
    expect(new Set(errors.map((e) => JSON.stringify(e))).size).toBe(1);
  });

  it('never reports FORBIDDEN (which would prove existence) for a hidden profile', async () => {
    const { service } = serviceFor(world);
    for (const id of Object.values(targets)) {
      await expect(service.assert(VIEWER, id, 'plan')).rejects.not.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it('the visible stranger is the control: header visible, plan locked', async () => {
    const { service } = serviceFor(world);
    await expect(service.assert(VIEWER, STRANGER, 'header')).resolves.toMatchObject({
      visible: true,
    });
  });
});

// ─── Memo: per request, never across requests ────────────────────────────────

describe('SocialAccessService — per-request memo', () => {
  const world = (): World => ({
    profiles: [profileRow(VIEWER), profileRow(OWNER, 'public')],
    follows: [accepted(VIEWER, OWNER)],
    blocks: [],
  });

  it('with a memo, resolving the same pair twice queries once', async () => {
    const { service, profiles, follows, blocks } = serviceFor(world());
    const memo = new SocialAccessMemo();
    const a = await service.resolve(VIEWER, OWNER, memo);
    const b = await service.assert(VIEWER, OWNER, 'plan', memo);
    expect(b).toBe(a);
    expect(follows.findPair).toHaveBeenCalledTimes(1);
    expect(blocks.existsEither).toHaveBeenCalledTimes(1);
    expect(profiles.find).toHaveBeenCalledTimes(2); // viewer + owner
  });

  it('reuses the viewer profile the middleware already loaded', async () => {
    const { service, profiles } = serviceFor(world());
    const memo = new SocialAccessMemo();
    await service.profile(VIEWER, memo); // requireActivated
    await service.resolve(VIEWER, OWNER, memo);
    expect(profiles.find.mock.calls.map(([id]) => id)).toEqual([VIEWER, OWNER]);
  });

  it('without a memo nothing is cached (no cross-request cache)', async () => {
    const w = world();
    const { service, follows } = serviceFor(w);
    expect((await service.resolve(VIEWER, OWNER)).can.plan).toBe('visible');
    w.follows = []; // unfollowed between two requests
    expect((await service.resolve(VIEWER, OWNER)).can.plan).toBe('locked');
    expect(follows.findPair).toHaveBeenCalledTimes(2);
  });

  it('two memos (two requests) never share results', async () => {
    const w = world();
    const { service } = serviceFor(w);
    const first = new SocialAccessMemo();
    expect((await service.resolve(VIEWER, OWNER, first)).visible).toBe(true);
    w.blocks = [{ blockerId: OWNER, blockedId: VIEWER }];
    expect((await service.resolve(VIEWER, OWNER, new SocialAccessMemo())).visible).toBe(false);
    // …while the first request's memo still answers from its own snapshot.
    expect((await service.resolve(VIEWER, OWNER, first)).visible).toBe(true);
    first.clear();
    expect((await service.resolve(VIEWER, OWNER, first)).visible).toBe(false);
  });

  it('does not cache a failed lookup', async () => {
    const { service, follows } = serviceFor(world());
    follows.findPair.mockRejectedValueOnce(new Error('db down'));
    const memo = new SocialAccessMemo();
    await expect(service.resolve(VIEWER, OWNER, memo)).rejects.toThrow('db down');
    await expect(service.resolve(VIEWER, OWNER, memo)).resolves.toMatchObject({ visible: true });
  });

  it('memo keys are per (viewer, owner) pair', async () => {
    const { service } = serviceFor({
      profiles: [profileRow(VIEWER), profileRow(OWNER, 'public'), profileRow(STRANGER, 'public')],
      follows: [accepted(VIEWER, OWNER)],
      blocks: [],
    });
    const memo = new SocialAccessMemo();
    expect((await service.resolve(VIEWER, OWNER, memo)).can.plan).toBe('visible');
    expect((await service.resolve(VIEWER, STRANGER, memo)).can.plan).toBe('locked');
    expect((await service.resolve(OWNER, VIEWER, memo)).can.plan).toBe('locked');
  });
});
