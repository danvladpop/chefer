import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncHandler } from './async-handler.js';
import { resetRateLimits } from './rate-limit.js';
import { resolveRequestAuth } from './session-auth.js';

// Phase 1 guardrails: per-user limits (per-IP fallback) on the plain-Express
// routes, end to end through a real Express app.

vi.mock('./session-auth.js', () => ({
  resolveRequestAuth: vi.fn(async (req: express.Request) => {
    const token = req.headers.authorization?.slice('Bearer '.length);
    return token
      ? { user: { id: token }, sessionToken: token }
      : { user: null, sessionToken: null };
  }),
}));

const { authOnce, ROUTE_LIMITS, routeRateLimit } = await import('./route-rate-limit.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.get(
    '/limited',
    routeRateLimit({ name: 'test.limited', max: 2, windowMs: 60_000 }),
    asyncHandler(async (req, res) => {
      const { user } = await authOnce(req, res);
      res.json({ user: user?.id ?? null });
    }),
  );
  app.get('/health', routeRateLimit({ ...ROUTE_LIMITS.health, max: 1 }), (_req, res) => {
    res.json({ ok: true });
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  resetRateLimits();
  vi.mocked(resolveRequestAuth).mockClear();
});

const get = (route: string, token?: string) =>
  fetch(`${baseUrl}${route}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

describe('routeRateLimit', () => {
  it('limits per user: one user hitting the cap does not affect another', async () => {
    expect((await get('/limited', 'alice')).status).toBe(200);
    expect((await get('/limited', 'alice')).status).toBe(200);
    const third = await get('/limited', 'alice');
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBe('60');
    expect(await third.json()).toEqual({
      error: 'Too many requests. Wait a minute and try again.',
    });
    expect((await get('/limited', 'bob')).status).toBe(200);
  });

  it('falls back to the client IP when signed out', async () => {
    await get('/limited');
    await get('/limited');
    expect((await get('/limited')).status).toBe(429);
    // A signed-in user on the same IP has their own bucket.
    expect((await get('/limited', 'carol')).status).toBe(200);
  });

  it('resolves the session once per request — the handler reuses it', async () => {
    const res = await get('/limited', 'dave');
    expect(await res.json()).toEqual({ user: 'dave' });
    expect(resolveRequestAuth).toHaveBeenCalledTimes(1);
  });

  it('a perUser: false limit never looks up the session', async () => {
    expect((await get('/health', 'erin')).status).toBe(200);
    expect((await get('/health', 'frank')).status).toBe(429); // same IP
    expect(resolveRequestAuth).not.toHaveBeenCalled();
  });

  it('chat is 10 a minute per user', () => {
    expect(ROUTE_LIMITS.chat).toMatchObject({ max: 10, windowMs: 60_000 });
  });
});
