import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import { hashToken, PasswordResetService } from './password-reset.service.js';

// WP-22: an OAuth-only account (null passwordHash) must be able to SET a
// password through the normal reset flow — that is how a Google/Apple-only
// user adds one (and what the unlink guard tells them to do).

vi.mock('../../lib/env.js', () => ({ env: { APP_URL: 'https://chefer.example' } }));
const email = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../lib/email/index.js', () => ({ emailService: email }));
vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn((a: unknown) => ({ op: 'user.update', a })) },
      verificationToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      session: { deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

const oauthOnly = { id: 'u1', email: 'a@test.dev', passwordHash: null, emailVerified: null };
const service = new PasswordResetService();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

describe('password reset for an OAuth-only account', () => {
  it('sends the reset link even though the account has no password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(oauthOnly as never);
    await service.requestReset('A@Test.dev');
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0]?.[0]).toMatchObject({ to: 'a@test.dev' });
  });

  it('sets the first password, verifies the email and revokes sessions', async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue({
      identifier: 'reset:a@test.dev',
      token: hashToken('tok'),
      expires: new Date(Date.now() + 60_000),
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(oauthOnly as never);

    await service.resetPassword('tok', 'a-new-password-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        passwordHash: expect.stringMatching(/^\$2[aby]\$/) as string,
        emailVerified: expect.any(Date) as Date,
      },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
