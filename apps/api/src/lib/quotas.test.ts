import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import {
  reserveAiSwap,
  reserveMealScan,
  reservePlanGeneration,
  reserveRecipeImport,
} from './quotas.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────
// $transaction runs the callback against the same mock, like a real
// interactive transaction would against its tx client.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  const aiCallLog = {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: 'log1' }),
    delete: vi.fn().mockResolvedValue({}),
  };
  return {
    ...mod,
    prisma: {
      aiCallLog,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ aiCallLog })),
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
const createMock = vi.mocked(prisma.aiCallLog.create);
const txMock = vi.mocked(prisma.$transaction);

beforeEach(() => {
  vi.clearAllMocks();
  countMock.mockResolvedValue(0);
  createMock.mockResolvedValue({ id: 'log1' } as never);
});

describe('reserveMealScan (F4)', () => {
  it('rejects free users with FORBIDDEN — photo scans are premium', async () => {
    await expect(reserveMealScan(free)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(countMock).not.toHaveBeenCalled();
  });

  it('reserves inside a serializable transaction under the daily limit', async () => {
    countMock.mockResolvedValue(9); // matrix limit is 10/day
    await reserveMealScan(premium);
    expect(txMock).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'SCAN' } });
  });

  it('rejects a premium user at the daily limit with TOO_MANY_REQUESTS and writes nothing', async () => {
    countMock.mockResolvedValue(10);
    const err = await reserveMealScan(premium).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('counts only SCAN calls since midnight UTC', async () => {
    await reserveMealScan(premium);
    const where = (countMock.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ userId: 'u1', callType: 'SCAN' });
    const gte = (where['createdAt'] as { gte: Date }).gte;
    expect(gte.getUTCHours()).toBe(0);
    expect(gte.getUTCMinutes()).toBe(0);
  });
});

describe('reservation mechanics (audit F-PLAN-2-3, F-TRK-2-2)', () => {
  it('answers FORBIDDEN, writing nothing, when the tier has no access (per-user AI is premium-only)', async () => {
    await expect(reserveRecipeImport(free)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(txMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('retries on a serialization conflict, so a concurrent winner is counted', async () => {
    txMock.mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2034' }));
    await reserveMealScan(premium);
    expect(txMock).toHaveBeenCalledTimes(2);
  });

  it('release() refunds by deleting the reserved row', async () => {
    const reservation = await reserveRecipeImport(premium);
    await reservation.release();
    expect(prisma.aiCallLog.delete).toHaveBeenCalledWith({ where: { id: 'log1' } });
  });

  it('plan generations count MEAL_PLAN reservations, not plan rows (F-PLAN-5-1)', async () => {
    countMock.mockResolvedValue(3); // free limit is 3/day
    await expect(reservePlanGeneration(free)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(countMock.mock.calls[0]?.[0]).toMatchObject({ where: { callType: 'MEAL_PLAN' } });
  });

  it('free AI swaps need no reservation (curated pool, no AI)', async () => {
    const reservation = await reserveAiSwap(free);
    await reservation.release();
    expect(txMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
