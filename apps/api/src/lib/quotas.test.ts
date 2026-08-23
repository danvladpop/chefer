import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { assertMealScanQuota } from './quotas.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      aiCallLog: { count: vi.fn().mockResolvedValue(0) },
      mealPlan: { count: vi.fn().mockResolvedValue(0) },
    },
  };
});

const user = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  email: 'u1@example.com',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
  ...over,
});

const free = user();
const premium = user({ planTier: 'PREMIUM' });

const countMock = vi.mocked(prisma.aiCallLog.count);

beforeEach(() => {
  countMock.mockReset().mockResolvedValue(0);
});

describe('assertMealScanQuota (F4)', () => {
  it('rejects free users with FORBIDDEN — photo scans are premium', async () => {
    await expect(assertMealScanQuota(free)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(countMock).not.toHaveBeenCalled();
  });

  it('allows a premium user under the daily limit', async () => {
    countMock.mockResolvedValue(9); // matrix limit is 10/day
    await expect(assertMealScanQuota(premium)).resolves.toBeUndefined();
  });

  it('rejects a premium user at the daily limit with TOO_MANY_REQUESTS', async () => {
    countMock.mockResolvedValue(10);
    const err = await assertMealScanQuota(premium).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
    expect((err as TRPCError).message).toContain('10');
  });

  it('counts only SCAN calls since midnight UTC', async () => {
    await assertMealScanQuota(premium);
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: premium.id,
          callType: 'SCAN',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
    const gte = (countMock.mock.calls[0]?.[0] as { where: { createdAt: { gte: Date } } }).where
      .createdAt.gte;
    expect(gte.getUTCHours()).toBe(0);
    expect(gte.getUTCMinutes()).toBe(0);
  });
});
