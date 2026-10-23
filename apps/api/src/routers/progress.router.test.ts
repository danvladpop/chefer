import { TRPCError } from '@trpc/server';
import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import type { Context } from '../lib/trpc.js';
import { progressRouter } from './progress.router.js';

// Kitchen progress is gated by the `gamification` flag or GAMIFICATION_ALLOWLIST
// (`*` = everyone). Only `availability` and `finishCook` answer while it is off:
// the ledger records for everyone (D1), so finishCook must store the cook anyway.

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => key === 'gamification' && flag.on,
}));
const envMock = vi.hoisted((): { GAMIFICATION_ALLOWLIST: Set<string> | undefined } => ({
  GAMIFICATION_ALLOWLIST: new Set<string>(),
}));
vi.mock('../lib/env.js', () => ({ env: envMock }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const service = vi.hoisted(() => ({
  summary: vi.fn(),
  inbox: vi.fn(),
  ack: vi.fn(),
  receiptFor: vi.fn(),
  finishCook: vi.fn(),
  achievements: vi.fn(),
  weeklyRecap: vi.fn(),
  updateSettings: vi.fn(),
  setActiveDayGoal: vi.fn(),
  pauseFlame: vi.fn(),
  resumeFlame: vi.fn(),
  markSeen: vi.fn(),
}));
vi.mock('../application/progress/progress.service.js', () => ({ progressService: service }));

const user = (email: string): UserProfile => ({
  id: 'u1',
  email,
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
});
const caller = (email = 'ana@chefer.dev') =>
  progressRouter.createCaller({
    user: user(email),
    requestId: 't',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: true,
    clientApiLevel: 0,
    res: {} as ExpressResponse,
  } satisfies Context);

const cookInput = {
  id: '11111111-1111-4111-8111-111111111111',
  recipeId: 'r1',
  localDate: '2026-10-22',
  finishedAt: new Date('2026-10-22T09:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  flag.on = false;
  envMock.GAMIFICATION_ALLOWLIST = new Set<string>();
  service.summary.mockResolvedValue({});
  service.finishCook.mockResolvedValue({ receipt: null, unlocks: [], levelUp: null });
});

describe('progress router gating', () => {
  it('answers availability while off, and says it is off', async () => {
    expect(await caller().availability()).toEqual({ enabled: false });
  });

  it.each([
    ['summary', (c: ReturnType<typeof caller>) => c.summary({ localDate: '2026-10-22' })],
    ['inbox', (c: ReturnType<typeof caller>) => c.inbox()],
    ['ack', (c: ReturnType<typeof caller>) => c.ack({})],
    ['achievements', (c: ReturnType<typeof caller>) => c.achievements()],
    ['weeklyRecap', (c: ReturnType<typeof caller>) => c.weeklyRecap({ weekStart: '2026-10-19' })],
    ['updateSettings', (c: ReturnType<typeof caller>) => c.updateSettings({ showXp: false })],
    [
      'setActiveDayGoal',
      (c: ReturnType<typeof caller>) => c.setActiveDayGoal({ goal: 4, localDate: '2026-10-22' }),
    ],
    [
      'pauseFlame',
      (c: ReturnType<typeof caller>) => c.pauseFlame({ startDate: '2026-10-22', weeks: 1 }),
    ],
    ['resumeFlame', (c: ReturnType<typeof caller>) => c.resumeFlame({ localDate: '2026-10-22' })],
    ['markSeen', (c: ReturnType<typeof caller>) => c.markSeen({ intro: true })],
    [
      'receiptFor',
      (c: ReturnType<typeof caller>) => c.receiptFor({ kind: 'COOK', sourceId: 'abc' }),
    ],
  ])('%s is FORBIDDEN while off', async (_name, call) => {
    const err = await call(caller()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('FORBIDDEN');
    expect(Object.values(service).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('finishCook is not gated: it stores the cook while the feature is off', async () => {
    const res = await caller().finishCook(cookInput);
    expect(res.receipt).toBeNull();
    expect(service.finishCook).toHaveBeenCalledTimes(1);
  });

  it('opens for the flag, for an allowlisted email and for `*`', async () => {
    flag.on = true;
    expect(await caller().availability()).toEqual({ enabled: true });
    await caller().summary({ localDate: '2026-10-22' });

    flag.on = false;
    envMock.GAMIFICATION_ALLOWLIST = new Set(['ana@chefer.dev']);
    await caller('Ana@Chefer.dev').summary({ localDate: '2026-10-22' });
    await expect(caller('bob@chefer.dev').summary({ localDate: '2026-10-22' })).rejects.toThrow();

    envMock.GAMIFICATION_ALLOWLIST = new Set(['*']);
    await caller('bob@chefer.dev').summary({ localDate: '2026-10-22' });
    expect(service.summary).toHaveBeenCalledTimes(3);
  });
});
