import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Response as ExpressResponse } from 'express';
import superjson, { type SuperJSONResult } from 'superjson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import type { Context } from '../../lib/trpc.js';
import { friendsProcedureRecords, friendsRouter } from './index.js';

// friends.* as a whole (implementation-plan.md §4.1, §8): the kill switch
// covers EVERY procedure except `availability`, and the four lane records
// never collide. Iterates the live router, so procedures added by later
// lanes are covered automatically.

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('../../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => key === 'friends' && flag.on,
}));
const allowlist = vi.hoisted(() => ({ ids: new Set<string>() }));
vi.mock('../../lib/env.js', () => ({
  // Standalone (the real env.ts throws without secrets): only the allowlist is read here.
  env: new Proxy(
    {},
    { get: (_t, key) => (key === 'FRIENDS_ALLOWLIST' ? allowlist.ids : undefined) },
  ),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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
const ctxFor = (u: UserProfile | null): Context => ({
  user: u,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel: 0,
  res: {} as ExpressResponse,
});

/** Calls `friends.<path>` over the fetch adapter, so the errorFormatter runs. */
async function call(path: string, type: 'query' | 'mutation', input: unknown) {
  const encoded = JSON.stringify(superjson.serialize(input));
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req:
      type === 'query'
        ? new Request(`http://localhost/trpc/${path}?input=${encodeURIComponent(encoded)}`)
        : new Request(`http://localhost/trpc/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: encoded,
          }),
    router: friendsRouter,
    createContext: () => ctxFor(user),
  });
  const body = (await res.json()) as {
    result?: { data: SuperJSONResult };
    error?: SuperJSONResult;
  };
  return body.error
    ? {
        error: superjson.deserialize<{ message: string; data: Record<string, unknown> }>(
          body.error,
        ),
      }
    : { data: body.result ? superjson.deserialize(body.result.data) : undefined };
}

const procedures = Object.entries(friendsRouter._def.procedures) as [
  string,
  { _def: { type: 'query' | 'mutation' | 'subscription' } },
][];

beforeEach(() => {
  flag.on = false;
  allowlist.ids = new Set();
});

describe('friends router composition', () => {
  it('the four lane records never share a key, and none redefines availability', () => {
    const seen = new Map<string, string>();
    for (const [lane, record] of Object.entries(friendsProcedureRecords)) {
      for (const key of Object.keys(record)) {
        expect(seen.get(key), `friends.${key} defined by ${lane}`).toBeUndefined();
        expect(key).not.toBe('availability');
        seen.set(key, lane);
      }
    }
    // Everything spread in made it into the router.
    expect(procedures.map(([name]) => name).sort()).toEqual(
      ['availability', ...seen.keys()].sort(),
    );
  });
});

describe('friends.* kill switch (flag off, not allowlisted)', () => {
  it('every procedure except availability → FORBIDDEN + data.friendsUnavailable', async () => {
    for (const [name, proc] of procedures) {
      if (name === 'availability' || proc._def.type === 'subscription') continue;
      const result = await call(name, proc._def.type, { userId: ME });
      expect(result.error?.data['code'], `friends.${name}`).toBe('FORBIDDEN');
      expect(result.error?.data['friendsUnavailable'], `friends.${name}`).toBe(true);
    }
  });

  it('availability answers { enabled: false } instead of failing', async () => {
    expect(await call('availability', 'query', undefined)).toEqual({ data: { enabled: false } });
  });
});

describe('friends.availability', () => {
  it('flag on → enabled', async () => {
    flag.on = true;
    await expect(friendsRouter.createCaller(ctxFor(user)).availability()).resolves.toEqual({
      enabled: true,
    });
  });

  it('flag off but allowlisted → enabled; others stay off', async () => {
    allowlist.ids = new Set([ME]);
    await expect(friendsRouter.createCaller(ctxFor(user)).availability()).resolves.toEqual({
      enabled: true,
    });
    const other = { ...user, id: 'cother000000000000000001' };
    await expect(friendsRouter.createCaller(ctxFor(other)).availability()).resolves.toEqual({
      enabled: false,
    });
  });

  it('requires a signed-in user', async () => {
    await expect(friendsRouter.createCaller(ctxFor(null)).availability()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
