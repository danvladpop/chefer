import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import {
  extractBearerToken,
  extractSessionToken,
  isMobileClient,
  resolveRequestAuth,
} from './session-auth.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      session: { findUnique: vi.fn() },
    },
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const dbUser = {
  id: 'u1',
  email: 'alice@test.dev',
  name: 'Alice',
  firstName: 'Alice',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

const DAY = 24 * 60 * 60 * 1000;

const liveSession = (token: string, user = dbUser) => ({
  sessionToken: token,
  expires: new Date(Date.now() + DAY),
  user,
});

const req = (headers: Record<string, string>): Request => ({ headers }) as unknown as Request;

beforeEach(() => {
  vi.mocked(prisma.session.findUnique).mockReset();
});

// ─── Header extraction ────────────────────────────────────────────────────────

describe('extractBearerToken', () => {
  it('extracts the token after "Bearer "', () => {
    expect(extractBearerToken('Bearer abc-123')).toBe('abc-123');
  });

  it('returns null for missing or non-Bearer headers', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('bearer abc')).toBeNull();
  });
});

describe('extractSessionToken', () => {
  it('extracts chefer_session among other cookies', () => {
    expect(extractSessionToken('theme=dark; chefer_session=tok-1; foo=bar')).toBe('tok-1');
  });

  it('returns null when the cookie is absent', () => {
    expect(extractSessionToken(undefined)).toBeNull();
    expect(extractSessionToken('theme=dark')).toBeNull();
  });
});

// ─── resolveRequestAuth ───────────────────────────────────────────────────────

describe('resolveRequestAuth', () => {
  it('resolves a user from a Bearer token holding a live session token', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(liveSession('tok-b') as never);

    const auth = await resolveRequestAuth(req({ authorization: 'Bearer tok-b' }));

    expect(auth.user?.id).toBe('u1');
    expect(auth.sessionToken).toBe('tok-b');
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionToken: 'tok-b' } }),
    );
  });

  it('returns null user for an expired session via Bearer', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...liveSession('tok-old'),
      expires: new Date(Date.now() - DAY),
    } as never);

    const auth = await resolveRequestAuth(req({ authorization: 'Bearer tok-old' }));

    expect(auth.user).toBeNull();
    expect(auth.sessionToken).toBeNull();
  });

  it('prefers a valid cookie session over the Bearer header', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(liveSession('tok-cookie') as never);

    const auth = await resolveRequestAuth(
      req({ cookie: 'chefer_session=tok-cookie', authorization: 'Bearer tok-b' }),
    );

    expect(auth.sessionToken).toBe('tok-cookie');
    expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
  });

  it('falls back to Bearer when the cookie session is dead', async () => {
    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce(null) // cookie lookup
      .mockResolvedValueOnce(liveSession('tok-b') as never); // bearer lookup

    const auth = await resolveRequestAuth(
      req({ cookie: 'chefer_session=tok-dead', authorization: 'Bearer tok-b' }),
    );

    expect(auth.user?.id).toBe('u1');
    expect(auth.sessionToken).toBe('tok-b');
  });

  it('returns nulls when no credential is present', async () => {
    const auth = await resolveRequestAuth(req({}));

    expect(auth).toEqual({ user: null, sessionToken: null });
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('returns null user when the session lookup throws', async () => {
    vi.mocked(prisma.session.findUnique).mockRejectedValue(new Error('db down'));

    const auth = await resolveRequestAuth(req({ authorization: 'Bearer tok-b' }));

    expect(auth.user).toBeNull();
  });
});

// ─── isMobileClient ───────────────────────────────────────────────────────────

describe('isMobileClient', () => {
  it('is true only for x-chefer-client: mobile', () => {
    expect(isMobileClient(req({ 'x-chefer-client': 'mobile' }))).toBe(true);
    expect(isMobileClient(req({ 'x-chefer-client': 'web' }))).toBe(false);
    expect(isMobileClient(req({}))).toBe(false);
  });
});
