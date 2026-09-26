import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, WeeklyEmailRepository } from '@chefer/database';

// Recipient selection lives in the repository's WHERE clause — this pins it:
// opted-in, confirmed addresses only, never someone already sent this week.
// (Deleted accounts are hard-deleted with a cascade, so no row can match.)

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    emailSend: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('../../../../../packages/database/src/client', () => ({ prisma: mocks.prisma }));

const WEEK = new Date('2026-09-21T00:00:00Z');

describe('WeeklyEmailRepository', () => {
  const repo = new WeeklyEmailRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findMany.mockResolvedValue([]);
  });

  it('Monday recipients: confirmed, opted in to the Monday email, not yet sent', async () => {
    await repo.findRecipients('WEEK_READY', WEEK);
    const where = mocks.prisma.user.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({
      emailVerified: { not: null },
      weeklyEmailReady: true,
      emailSends: { none: { kind: 'WEEK_READY', weekStart: WEEK } },
    });
  });

  it('recap recipients use the recap switch, and a user filter narrows it', async () => {
    await repo.findRecipients('WEEKLY_RECAP', WEEK, 'u1');
    const where = mocks.prisma.user.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({
      id: 'u1',
      emailVerified: { not: null },
      weeklyEmailRecap: true,
      emailSends: { none: { kind: 'WEEKLY_RECAP', weekStart: WEEK } },
    });
  });

  it('claimSend: the unique constraint turns a second claim into false', async () => {
    mocks.prisma.emailSend.create.mockResolvedValueOnce({});
    expect(await repo.claimSend('u1', 'WEEK_READY', WEEK)).toBe(true);

    mocks.prisma.emailSend.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    expect(await repo.claimSend('u1', 'WEEK_READY', WEEK)).toBe(false);
  });

  it('claimSend rethrows anything that is not a duplicate', async () => {
    mocks.prisma.emailSend.create.mockRejectedValueOnce(new Error('db down'));
    await expect(repo.claimSend('u1', 'WEEK_READY', WEEK)).rejects.toThrow('db down');
  });

  it('markEmailVerified refuses an address that no longer matches', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ email: 'new@x.y', emailVerified: null });
    expect(await repo.markEmailVerified('u1', 'old@x.y')).toBe(false);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
