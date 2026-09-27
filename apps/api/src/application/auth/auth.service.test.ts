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

vi.mock('../privacy/consent.service.js', () => ({
  consentService: { record: vi.fn().mockResolvedValue({}) },
}));

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

beforeEach(async () => {
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.user.create).mockReset();
  vi.mocked(prisma.session.create)
    .mockReset()
    .mockResolvedValue({} as never);
  const { consentService } = await import('../privacy/consent.service.js');
  vi.mocked(consentService.record).mockClear();
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

  it('seeds units + currency from the device region (P2-6)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(dbUser as never);

    await service.register({ email: dbUser.email, password: PASSWORD, region: 'US' }, mockRes());
    const us = vi.mocked(prisma.user.create).mock.calls.at(-1)![0];
    expect(us.data.chefProfile).toEqual({
      create: { preferredUnits: 'IMPERIAL', deliveryCurrency: 'USD' },
    });

    await service.register({ email: dbUser.email, password: PASSWORD, region: 'RO' }, mockRes());
    const ro = vi.mocked(prisma.user.create).mock.calls.at(-1)![0];
    expect(ro.data.chefProfile).toEqual({
      create: { preferredUnits: 'METRIC', deliveryCurrency: 'RON' },
    });
  });

  it('creates no profile row when the client sends no region (older apps)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(dbUser as never);

    await service.register({ email: dbUser.email, password: PASSWORD }, mockRes());
    const call = vi.mocked(prisma.user.create).mock.calls.at(-1)![0];
    expect(call.data.chefProfile).toBeUndefined();
  });

  // ─── T-39.1 / T-26.5 / T-39.3 explicit consent ────────────────────────────────
  // Gating on clientApiLevel >= 2, not >= 1: both web and a wave-0 mobile
  // build already OUT ON OTA send level 1 (§2.8, T-00.8's health-consent
  // header) — level 1 has no consent checkboxes. Gating on 1 here would have
  // locked every wave-0 phone out of registration the moment this API
  // deployed, since their JS runtime cannot take this wave's OTA on a
  // changed native runtime. Level 2 is the first level whose UI renders the
  // boxes (trpc-links.ts / trpc-provider.tsx / trpc-server.ts).

  it.each([0, 1])(
    'a level %i client (no consent UI yet) registers unchanged and logs only the email/auto-plan defaults',
    async (clientApiLevel) => {
      const { consentService } = await import('../privacy/consent.service.js');
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(dbUser as never);

      const result = await service.register(
        { email: dbUser.email, password: PASSWORD },
        mockRes(),
        { clientApiLevel },
      );

      expect(result.id).toBe('u1');
      const kinds = vi.mocked(consentService.record).mock.calls.map((c) => c[0].kind);
      // No TERMS/PRIVACY/AGE row — this account never actually agreed to
      // anything; the re-accept sheet catches it once it's on a level >= 2 client.
      expect(kinds).not.toContain('TERMS');
      expect(kinds).not.toContain('PRIVACY');
      expect(kinds).not.toContain('AGE');
      expect(kinds.sort()).toEqual(['AUTO_PLAN', 'EMAIL_RECAP', 'EMAIL_WEEK_READY']);
      for (const call of vi.mocked(consentService.record).mock.calls) {
        expect(call[0].granted).toBe(false);
      }
    },
  );

  it('a level 2 client is rejected without acceptedTerms + acceptedTermsVersion', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      service.register({ email: dbUser.email, password: PASSWORD }, mockRes(), {
        clientApiLevel: 2,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('a level 2 client is rejected without ageConfirmed even with terms accepted', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      service.register(
        {
          email: dbUser.email,
          password: PASSWORD,
          acceptedTerms: true,
          acceptedTermsVersion: '2026-09-26',
        },
        mockRes(),
        { clientApiLevel: 2 },
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('records TERMS + PRIVACY + AGE and the email/auto-plan defaults for a fully-consented level 2 signup (AC1, AC2, AC3)', async () => {
    const { consentService } = await import('../privacy/consent.service.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(dbUser as never);

    await service.register(
      {
        email: dbUser.email,
        password: PASSWORD,
        acceptedTerms: true,
        ageConfirmed: true,
        acceptedTermsVersion: '2026-09-26',
      },
      mockRes(),
      { clientApiLevel: 2, consentSource: 'mobile' },
    );

    // New accounts: digests + auto-plan off, written explicitly (T-39.3).
    const createCall = vi.mocked(prisma.user.create).mock.calls.at(-1)![0];
    expect(createCall.data.weeklyEmailReady).toBe(false);
    expect(createCall.data.weeklyEmailRecap).toBe(false);
    expect(createCall.data.termsAcceptedVersion).toBe('2026-09-26');

    const kinds = vi.mocked(consentService.record).mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'TERMS',
        'PRIVACY',
        'AGE',
        'EMAIL_WEEK_READY',
        'EMAIL_RECAP',
        'AUTO_PLAN',
      ]),
    );
    for (const call of vi.mocked(consentService.record).mock.calls) {
      expect(call[0].source).toBe('mobile');
    }
    const emailDefaults = vi
      .mocked(consentService.record)
      .mock.calls.filter((c) =>
        ['EMAIL_WEEK_READY', 'EMAIL_RECAP', 'AUTO_PLAN'].includes(c[0].kind),
      );
    expect(emailDefaults).toHaveLength(3);
    for (const call of emailDefaults) {
      expect(call[0].granted).toBe(false);
    }
  });

  it('a registration failure never happens because consent logging failed', async () => {
    const { consentService } = await import('../privacy/consent.service.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(dbUser as never);
    vi.mocked(consentService.record).mockRejectedValueOnce(new Error('db hiccup'));

    const result = await service.register(
      {
        email: dbUser.email,
        password: PASSWORD,
        acceptedTerms: true,
        ageConfirmed: true,
        acceptedTermsVersion: '2026-09-26',
      },
      mockRes(),
      { clientApiLevel: 2 },
    );

    expect(result.id).toBe('u1');
  });
});
