import { TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Response as ExpressResponse } from 'express';
import superjson, { type SuperJSONResult } from 'superjson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialProfile } from '@chefer/database';
import { targetUserInputSchema, type UserProfile } from '@chefer/types';
import {
  FriendsLockedCause,
  FriendsNotActivatedCause,
  FriendsUnavailableCause,
  textRejectedError,
  unsafeForTableError,
} from './friends-errors.js';
import {
  activeFriendsProcedure,
  friendsProcedure,
  isFriendsEnabledFor,
  requireSocialAccess,
} from './friends-middleware.js';
import { protectedProcedure, router, type Context } from './trpc.js';

// Following middleware (implementation-plan.md §4.1) end to end through the
// real SocialAccessService, over an in-memory world (the three repository
// singletons are replaced; no DB). Test-only procedures exercise each base.

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('./flags.js', () => ({ isFlagEnabled: (key: string) => key === 'friends' && flag.on }));
const envMock = vi.hoisted((): { FRIENDS_ALLOWLIST: Set<string> | undefined } => ({
  FRIENDS_ALLOWLIST: new Set<string>(),
}));
vi.mock('./env.js', () => ({ env: envMock }));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Edge = { followerId: string; followeeId: string; status: 'PENDING' | 'ACCEPTED' };
const world = vi.hoisted(() => ({
  profiles: new Map<string, unknown>(),
  follows: [] as { followerId: string; followeeId: string; status: 'PENDING' | 'ACCEPTED' }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
}));
vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  const edge = (a: string, b: string) => {
    const f = world.follows.find((r) => r.followerId === a && r.followeeId === b);
    return f ? { id: `${a}>${b}`, ...f, createdAt: new Date(), acceptedAt: null } : null;
  };
  return {
    ...mod,
    socialProfileRepository: {
      find: vi.fn((id: string) => Promise.resolve(world.profiles.get(id) ?? null)),
    },
    followRepository: {
      findPair: vi.fn((a: string, b: string) =>
        Promise.resolve({ outgoing: edge(a, b), incoming: edge(b, a) }),
      ),
    },
    blockRepository: {
      existsEither: vi.fn((a: string, b: string) =>
        Promise.resolve(
          world.blocks.some(
            (r) =>
              (r.blockerId === a && r.blockedId === b) || (r.blockerId === b && r.blockedId === a),
          ),
        ),
      ),
    },
  };
});

const ME = 'cme000000000000000000001';
const FRIEND = 'cfriend00000000000000001'; // public, I follow them, shares all but recipes
const STRANGER = 'cstranger000000000000001'; // private, I don't follow
const BLOCKED = 'cblocked0000000000000001'; // I blocked them
const BLOCKER = 'cblocker0000000000000001'; // they blocked me
const DORMANT = 'cdormant0000000000000001'; // exists, never turned Following on
const NOBODY = 'cnobody00000000000000001'; // no such user
const RANDOM = 'clr9x2k3m0000qwerty12345'; // a random, well-formed cuid

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
    activatedAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...over,
  };
}

function seed(): void {
  world.profiles = new Map<string, unknown>([
    [ME, profile(ME)],
    [FRIEND, profile(FRIEND, { visibility: 'PUBLIC', shareRecipes: false })],
    [STRANGER, profile(STRANGER)],
    [BLOCKED, profile(BLOCKED, { visibility: 'PUBLIC' })],
    [BLOCKER, profile(BLOCKER, { visibility: 'PUBLIC' })],
  ]);
  world.follows = [{ followerId: ME, followeeId: FRIEND, status: 'ACCEPTED' } satisfies Edge];
  world.blocks = [
    { blockerId: ME, blockedId: BLOCKED },
    { blockerId: BLOCKER, blockedId: ME },
  ];
}

const userFor = (id: string): UserProfile => ({
  id,
  email: `${id}@x.dev`,
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
});
const ctxFor = (id: string | null): Context => ({
  user: id ? userFor(id) : null,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel: 0,
  res: {} as ExpressResponse,
});

// ─── Test-only procedures on each base ───────────────────────────────────────

const testRouter = router({
  enabled: friendsProcedure.query(() => 'ok'),
  active: activeFriendsProcedure.query(({ ctx }) => ctx.socialProfile.userId),
  // `.use()` before `.input()` …
  header: activeFriendsProcedure
    .use(requireSocialAccess('header'))
    .input(targetUserInputSchema)
    .query(({ ctx }) => ctx.socialAccess),
  // … and after: requireSocialAccess reads the raw input, so both work.
  plan: activeFriendsProcedure
    .input(targetUserInputSchema)
    .use(requireSocialAccess('plan'))
    .query(({ ctx }) => ctx.socialAccess.can),
  recipes: activeFriendsProcedure
    .use(requireSocialAccess('recipes'))
    .input(targetUserInputSchema)
    .mutation(({ ctx }) => ctx.socialAccess.can.recipes),
  workouts: activeFriendsProcedure
    .use(requireSocialAccess('workouts'))
    .input(targetUserInputSchema)
    .query(({ ctx }) => ctx.socialAccess.can.workouts),
  textName: protectedProcedure.mutation(() => {
    throw textRejectedError('name');
  }),
  textRecipe: protectedProcedure.mutation(() => {
    throw textRejectedError('recipe');
  }),
  unsafe: protectedProcedure.mutation(() => {
    throw unsafeForTableError(['Peanuts']);
  }),
  plain: protectedProcedure.mutation(() => {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Something else.' });
  }),
});

const caller = (id: string | null = ME) => testRouter.createCaller(ctxFor(id));

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof TRPCError)) throw new Error(`expected a TRPCError, got ${String(err)}`);
  return err;
}

/** The wire shape (errorFormatter applied), as the mobile client sees it. */
async function wireError(path: string, input?: unknown, method: 'GET' | 'POST' = 'GET') {
  const encoded = input === undefined ? undefined : JSON.stringify(superjson.serialize(input));
  const url =
    method === 'GET' && encoded
      ? `http://localhost/trpc/${path}?input=${encodeURIComponent(encoded)}`
      : `http://localhost/trpc/${path}`;
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req: new Request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'POST' && { body: encoded ?? '{}' }),
    }),
    router: testRouter,
    createContext: () => ctxFor(ME),
  });
  const body = (await res.json()) as { error: SuperJSONResult };
  return superjson.deserialize<{
    message: string;
    code: number;
    data: Record<string, unknown> & { path?: string; stack?: string };
  }>(body.error);
}

beforeEach(() => {
  flag.on = true;
  envMock.FRIENDS_ALLOWLIST = new Set();
  seed();
});

// ─── isFriendsEnabledFor ─────────────────────────────────────────────────────

describe('isFriendsEnabledFor', () => {
  it('is on for everyone when the flag is on', () => {
    expect(isFriendsEnabledFor(ME)).toBe(true);
    expect(isFriendsEnabledFor(NOBODY)).toBe(true);
  });

  it('is off when the flag is off and the user is not allowlisted', () => {
    flag.on = false;
    expect(isFriendsEnabledFor(ME)).toBe(false);
  });

  it('is on for allowlisted users while the flag is off (dark launch)', () => {
    flag.on = false;
    envMock.FRIENDS_ALLOWLIST = new Set([ME]);
    expect(isFriendsEnabledFor(ME)).toBe(true);
    expect(isFriendsEnabledFor(FRIEND)).toBe(false);
  });

  it('treats a missing allowlist (a partial env mock) as empty', () => {
    flag.on = false;
    envMock.FRIENDS_ALLOWLIST = undefined;
    expect(isFriendsEnabledFor(ME)).toBe(false);
  });
});

// ─── requireFriendsEnabled ───────────────────────────────────────────────────

describe('requireFriendsEnabled (friendsProcedure)', () => {
  it('flag off → FORBIDDEN with FriendsUnavailableCause, on every base', async () => {
    flag.on = false;
    const c = caller();
    for (const call of [
      () => c.enabled(),
      () => c.active(),
      () => c.header({ userId: FRIEND }),
      () => c.plan({ userId: FRIEND }),
      () => c.recipes({ userId: FRIEND }),
      () => c.workouts({ userId: FRIEND }),
    ]) {
      const err = await rejection(call());
      expect(err.code).toBe('FORBIDDEN');
      expect(err.cause).toBeInstanceOf(FriendsUnavailableCause);
    }
  });

  it('flag off → the gate runs before activation and before the target is looked at', async () => {
    flag.on = false;
    // Not activated and asking about a blocked user: still just "unavailable".
    world.profiles.delete(ME);
    const err = await rejection(caller().header({ userId: BLOCKED }));
    expect(err.code).toBe('FORBIDDEN');
    expect(err.cause).toBeInstanceOf(FriendsUnavailableCause);
  });

  it('an allowlisted user passes while the flag is off', async () => {
    flag.on = false;
    envMock.FRIENDS_ALLOWLIST = new Set([ME]);
    await expect(caller().enabled()).resolves.toBe('ok');
    await expect(caller().plan({ userId: FRIEND })).resolves.toMatchObject({ plan: 'visible' });
  });

  it('flag on → passes', async () => {
    await expect(caller().enabled()).resolves.toBe('ok');
  });

  it('still requires a signed-in user', async () => {
    const err = await rejection(caller(null).enabled());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('wire: data.friendsUnavailable is true and the message is the copy deck line', async () => {
    flag.on = false;
    const error = await wireError('enabled');
    expect(error.data['code']).toBe('FORBIDDEN');
    expect(error.data['friendsUnavailable']).toBe(true);
    expect(error.data['friendsNotActivated']).toBe(false);
    expect(error.message).toBe('Following isn’t available right now.');
  });
});

// ─── requireActivated ────────────────────────────────────────────────────────

describe('requireActivated (activeFriendsProcedure)', () => {
  it('not activated → PRECONDITION_FAILED with FriendsNotActivatedCause', async () => {
    world.profiles.delete(ME);
    for (const call of [
      () => caller().active(),
      () => caller().header({ userId: FRIEND }),
      () => caller().plan({ userId: FRIEND }),
    ]) {
      const err = await rejection(call());
      expect(err.code).toBe('PRECONDITION_FAILED');
      expect(err.cause).toBeInstanceOf(FriendsNotActivatedCause);
    }
  });

  it('friendsProcedure alone does not require activation (friends.me, friends.activate)', async () => {
    world.profiles.delete(ME);
    await expect(caller().enabled()).resolves.toBe('ok');
  });

  it('activated → passes and puts the caller’s SocialProfile on ctx', async () => {
    await expect(caller().active()).resolves.toBe(ME);
  });

  it('wire: data.friendsNotActivated is true', async () => {
    world.profiles.delete(ME);
    const error = await wireError('active');
    expect(error.data['code']).toBe('PRECONDITION_FAILED');
    expect(error.data['friendsNotActivated']).toBe(true);
    expect(error.data['friendsUnavailable']).toBe(false);
  });
});

// ─── requireSocialAccess ─────────────────────────────────────────────────────

describe('requireSocialAccess(scope)', () => {
  const HIDDEN = {
    'blocked by me': BLOCKED,
    'blocking me': BLOCKER,
    'not activated': DORMANT,
    nonexistent: NOBODY,
    'random cuid': RANDOM,
  };

  it('not visible → NOT_FOUND "Profile not available", identically for every reason and scope (INV-3)', async () => {
    const seen = new Set<string>();
    for (const [kind, userId] of Object.entries(HIDDEN)) {
      for (const call of [
        () => caller().header({ userId }),
        () => caller().plan({ userId }),
        () => caller().recipes({ userId }),
        () => caller().workouts({ userId }),
      ]) {
        const err = await rejection(call());
        expect(err.code, kind).toBe('NOT_FOUND');
        expect(err.message, kind).toBe('Profile not available');
        expect(err.cause, kind).toBeUndefined();
        seen.add(JSON.stringify({ code: err.code, message: err.message }));
      }
    }
    expect(seen.size).toBe(1);
  });

  it('wire: the not-visible error bodies are byte-identical apart from the path (INV-3)', async () => {
    const bodies = new Set<string>();
    for (const userId of Object.values(HIDDEN)) {
      const error = await wireError('plan', { userId });
      const { path: _path, stack: _stack, ...data } = error.data;
      expect(data['friendsLocked']).toBeNull();
      bodies.add(JSON.stringify({ message: error.message, code: error.code, data }));
    }
    expect(bodies.size).toBe(1);
  });

  it('header scope: a visible non-follower gets the header (private profile)', async () => {
    await expect(caller().header({ userId: STRANGER })).resolves.toMatchObject({
      visible: true,
      ownerVisibility: 'PRIVATE',
      outgoing: null,
    });
  });

  it('locked scope → FORBIDDEN with friendsLocked "locked" (visible header, not a follower)', async () => {
    for (const call of [
      () => caller().plan({ userId: STRANGER }),
      () => caller().recipes({ userId: STRANGER }),
      () => caller().workouts({ userId: STRANGER }),
    ]) {
      const err = await rejection(call());
      expect(err.code).toBe('FORBIDDEN');
      expect(err.cause).toBeInstanceOf(FriendsLockedCause);
      expect((err.cause as FriendsLockedCause).reason).toBe('locked');
    }
  });

  it('a follower: shared scopes pass, a switched-off one → FORBIDDEN "not_shared"', async () => {
    await expect(caller().plan({ userId: FRIEND })).resolves.toMatchObject({ plan: 'visible' });
    await expect(caller().workouts({ userId: FRIEND })).resolves.toBe('visible');
    const err = await rejection(caller().recipes({ userId: FRIEND }));
    expect(err.code).toBe('FORBIDDEN');
    expect((err.cause as FriendsLockedCause).reason).toBe('not_shared');
  });

  it('wire: data.friendsLocked carries the reason', async () => {
    expect((await wireError('plan', { userId: STRANGER })).data['friendsLocked']).toBe('locked');
    expect((await wireError('recipes', { userId: FRIEND }, 'POST')).data['friendsLocked']).toBe(
      'not_shared',
    );
  });

  it('self: every scope is visible', async () => {
    await expect(caller().plan({ userId: ME })).resolves.toEqual({
      plan: 'visible',
      recipes: 'visible',
      workouts: 'visible',
      targets: true,
    });
  });

  it('a malformed user id is BAD_REQUEST (an input error, not an existence answer)', async () => {
    for (const userId of ['', 'not a cuid', 'x'.repeat(500)]) {
      const err = await rejection(caller().header({ userId }));
      expect(err.code).toBe('BAD_REQUEST');
    }
  });
});

// ─── errorFormatter: the other Following fields ──────────────────────────────

describe('errorFormatter — Following data fields (additive)', () => {
  it('textRejected carries the field and the plain-language message', async () => {
    const name = await wireError('textName', undefined, 'POST');
    expect(name.data['code']).toBe('BAD_REQUEST');
    expect(name.data['textRejected']).toBe('name');
    expect(name.message).toMatch(/choose a different name/);
    const recipe = await wireError('textRecipe', undefined, 'POST');
    expect(recipe.data['textRejected']).toBe('recipe');
  });

  it('unsafeForTable carries the issues, and the message keeps the UNSAFE_FOR_TABLE wording', async () => {
    const error = await wireError('unsafe', undefined, 'POST');
    expect(error.data['code']).toBe('FORBIDDEN');
    expect(error.data['unsafeForTable']).toEqual({ issues: ['Peanuts'] });
    expect(error.message).toMatch(/^UNSAFE_FOR_TABLE: this recipe contains Peanuts/);
  });

  it('any other error carries false/null for every Following field, existing fields unchanged', async () => {
    const error = await wireError('plain', undefined, 'POST');
    expect(error.message).toBe('Something else.');
    expect(error.data).toMatchObject({
      code: 'FORBIDDEN',
      zodError: null,
      conflict: null,
      healthConsentRequired: false,
      poolExhausted: null,
      friendsUnavailable: false,
      friendsNotActivated: false,
      friendsLocked: null,
      textRejected: null,
      unsafeForTable: null,
    });
  });
});
