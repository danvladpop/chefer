import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import { AuthService } from './auth.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      user: { findUnique: vi.fn(), create: vi.fn() },
      session: { create: vi.fn(), deleteMany: vi.fn() },
    },
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PASSWORD = 'User@123!';

const dbUser = {
  id: 'u1',
  email: 'alice@test.dev',
  name: 'Alice',
  firstName: 'Alice',
  lastName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
};

const mockRes = () => ({ setHeader: vi.fn() }) as unknown as Response;

const service = new AuthService();

beforeEach(() => {
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.user.create).mockReset();
  vi.mocked(prisma.session.create)
    .mockReset()
    .mockResolvedValue({} as never);
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  it('omits the session token from the body by default (web)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as never);
    const res = mockRes();

    const result = await service.login({ email: dbUser.email, password: PASSWORD }, res);

    expect(result.id).toBe('u1');
    expect(result.session).toBeUndefined();
    // The cookie is still the web credential
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('chefer_session='),
    );
  });

  it('returns the session token in the body for mobile clients', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as never);
    const res = mockRes();

    const result = await service.login({ email: dbUser.email, password: PASSWORD }, res, {
      includeSession: true,
    });

    expect(result.session?.token).toBeTruthy();
    expect(result.session?.expires).toBeInstanceOf(Date);
    expect(result.session!.expires.getTime()).toBeGreaterThan(Date.now());

    // The returned token is the same one persisted as the DB session row
    const created = vi.mocked(prisma.session.create).mock.calls[0]![0] as {
      data: { sessionToken: string };
    };
    expect(result.session?.token).toBe(created.data.sessionToken);
  });

  it('rejects a wrong password without creating a session', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as never);

    await expect(
      service.login({ email: dbUser.email, password: 'nope' }, mockRes(), {
        includeSession: true,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe('AuthService.register', () => {
  it('returns the session token only when asked (mobile)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(dbUser as never);

    const web = await service.register({ email: dbUser.email, password: PASSWORD }, mockRes());
    expect(web.session).toBeUndefined();

    const mobile = await service.register({ email: dbUser.email, password: PASSWORD }, mockRes(), {
      includeSession: true,
    });
    expect(mobile.session?.token).toBeTruthy();
  });
});
