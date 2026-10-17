import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { setAiBudgetGates, type AiBudgetBlock } from './ai/budget-gate.js';
import {
  assertAiBudget,
  reserveAiSwap,
  reserveChatMessage,
  reserveMealScan,
  reserveNutritionEstimate,
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

  it('plan generations count reservations, not plan rows (F-PLAN-5-1)', async () => {
    countMock.mockResolvedValue(3); // free limit is 3/day
    await expect(reservePlanGeneration(free)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    // T-10.8 (bug B-49): a FREE (curated, zero-AI) generation is counted
    // against its own call type, not MEAL_PLAN — the daily cap still works
    // (same limit, same mechanics) but it no longer inflates "AI usage".
    expect(countMock.mock.calls[0]?.[0]).toMatchObject({ where: { callType: 'CURATED_PLAN' } });
  });

  it('T-10.8: a PREMIUM generation still counts as MEAL_PLAN (real AI usage)', async () => {
    countMock.mockResolvedValue(0);
    await reservePlanGeneration(premium);
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'MEAL_PLAN' } });
  });

  it('T-10.8: a FREE generation counts as CURATED_PLAN, not MEAL_PLAN', async () => {
    countMock.mockResolvedValue(0);
    await reservePlanGeneration(free);
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'CURATED_PLAN' } });
  });

  it('T-10.8: an explicit `premium` argument overrides the tier-derived default', async () => {
    countMock.mockResolvedValue(0);
    // A free user going through the premium (AI) code path, e.g. a beta flag.
    await reservePlanGeneration(free, true);
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'MEAL_PLAN' } });
  });

  it('free AI swaps need no reservation (curated pool, no AI)', async () => {
    const reservation = await reserveAiSwap(free);
    await reservation.release();
    expect(txMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

// ─── Phase 2 AI budgets: the reservation is also the budget check ────────────

describe('AI budget enforcement in the reservations', () => {
  const monthly: AiBudgetBlock = {
    reason: 'user_monthly',
    message: "You've used this month's AI allowance.",
  };
  const userGate = vi.fn<[string], Promise<AiBudgetBlock | null>>();

  beforeEach(() => {
    userGate.mockReset().mockResolvedValue(monthly);
    setAiBudgetGates({ user: userGate, background: () => Promise.resolve(true) });
  });
  afterEach(() => setAiBudgetGates(null));

  it.each([
    ['chat', () => reserveChatMessage(premium)],
    ['scan', () => reserveMealScan(premium)],
    ['import (link/text/photo/video)', () => reserveRecipeImport(premium)],
    ['AI swap', () => reserveAiSwap(premium)],
    ['premium plan generation', () => reservePlanGeneration(premium, true)],
    ['nutrition auto-fill', () => reserveNutritionEstimate(premium)],
  ])(
    '%s: refused with TOO_MANY_REQUESTS + the budget message, nothing written',
    async (_n, run) => {
      const err = await run().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: monthly.message });
      expect(userGate).toHaveBeenCalledWith('u1');
      expect(createMock).not.toHaveBeenCalled();
    },
  );

  it('a curated (zero-AI) plan is never refused by the budget', async () => {
    await reservePlanGeneration(free, false);
    expect(userGate).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'CURATED_PLAN' } });
  });

  it('free curated swaps are not checked either', async () => {
    await reserveAiSwap(free);
    expect(userGate).not.toHaveBeenCalled();
  });

  it('a premium-only feature still answers FORBIDDEN first for free users', async () => {
    await expect(reserveChatMessage(free)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(userGate).not.toHaveBeenCalled();
  });

  it('under budget, the reservation proceeds as before', async () => {
    userGate.mockResolvedValue(null);
    await reserveMealScan(premium);
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'SCAN' } });
  });

  it('a failing budget check allows (fail-open), never blocks AI on its own error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    userGate.mockRejectedValue(new Error('db down'));
    await expect(assertAiBudget('u1')).resolves.toBeUndefined();
  });

  it('no gates installed (tests, scripts) = allowed', async () => {
    setAiBudgetGates(null);
    await expect(assertAiBudget('u1')).resolves.toBeUndefined();
  });
});

describe('Phase 1 guardrails (2026-10-11)', () => {
  it('chat: free has no access (FORBIDDEN) and writes nothing', async () => {
    await expect(reserveChatMessage(free)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('chat: premium reserves under 20 messages a day, in a serializable transaction', async () => {
    countMock.mockResolvedValue(19);
    await reserveChatMessage(premium);
    expect(txMock).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(createMock).toHaveBeenCalledWith({ data: { userId: 'u1', callType: 'CHAT' } });
  });

  it('chat: premium is refused at 100 (it used to be unlimited)', async () => {
    countMock.mockResolvedValue(100);
    const err = await reserveChatMessage(premium).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
    expect((err as TRPCError).message).toContain('20 chat messages');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('plans: premium is refused at 5 generations a day (was 20)', async () => {
    countMock.mockResolvedValue(4);
    await reservePlanGeneration(premium);
    countMock.mockResolvedValue(5);
    const err = await reservePlanGeneration(premium).catch((e: unknown) => e);
    expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
    expect((err as TRPCError).message).toContain('limit of 5 plan generations');
  });

  it('plans: free stays at 3 and the upsell names the premium 5', async () => {
    countMock.mockResolvedValue(3);
    const err = await reservePlanGeneration(free).catch((e: unknown) => e);
    expect((err as TRPCError).message).toBe(
      "You've used today's 3 free plan generations. Upgrade for 5 per day.",
    );
  });
});
