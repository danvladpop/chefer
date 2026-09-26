import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { trackerRouter } from './tracker.router.js';

// Router-level input bounds (audit F-DASH-3-1, F-TRK-1-5): the service is
// mocked, so these tests exercise only the zod input schemas.
const svc = vi.hoisted(() => ({
  logWeight: vi.fn(),
  updateWeight: vi.fn(),
  deleteWeight: vi.fn(),
  getDay: vi.fn(),
  logCustomMeal: vi.fn(),
}));
vi.mock('../application/tracker/tracker.service.js', () => ({ trackerService: svc }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const user: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = trackerRouter.createCaller({
  user,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  res: {} as Response,
});

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('tracker input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logWeight rejects the audit values: 1000 kg, 0.001 kg, a 2099 date', async () => {
    await expect(caller.logWeight({ weightKg: 1000 })).rejects.toThrow();
    await expect(caller.logWeight({ weightKg: 0.001 })).rejects.toThrow();
    await expect(caller.logWeight({ weightKg: 80, date: '2099-01-01' })).rejects.toThrow(/future/);
    expect(svc.logWeight).not.toHaveBeenCalled();
  });

  it('logWeight accepts a plausible weight for today and yesterday', async () => {
    await caller.logWeight({ weightKg: 80.4, date: isoDaysFromNow(0) });
    await caller.logWeight({ weightKg: 80.4, date: isoDaysFromNow(-1) });
    expect(svc.logWeight).toHaveBeenCalledTimes(2);
  });

  it('updateWeight applies the same bounds and passes the owner through', async () => {
    await expect(caller.updateWeight({ id: 'w1', weightKg: 5 })).rejects.toThrow();
    await caller.updateWeight({ id: 'w1', weightKg: 79 });
    expect(svc.updateWeight).toHaveBeenCalledWith('u1', 'w1', 79, undefined);
  });

  it('deleteWeight is scoped to the caller', async () => {
    await caller.deleteWeight({ id: 'w1' });
    expect(svc.deleteWeight).toHaveBeenCalledWith('u1', 'w1');
  });

  it('tracker dates must be real calendar days (F-TRK-1-5)', async () => {
    await expect(caller.getDay({ date: '2026-13-45' })).rejects.toThrow(/calendar/);
    await expect(caller.getDay({ date: '2026-02-31' })).rejects.toThrow(/calendar/);
    await caller.getDay({ date: '2024-02-29' });
    expect(svc.getDay).toHaveBeenCalledTimes(1);
  });

  it('refuses to log a future day', async () => {
    const entry = {
      name: 'Toast',
      estimatedBy: 'manual' as const,
      mealType: 'breakfast' as const,
      kcal: 200,
    };
    await expect(caller.logCustomMeal({ date: '2099-01-01', ...entry })).rejects.toThrow(/future/);
    await caller.logCustomMeal({ date: isoDaysFromNow(0), ...entry });
    expect(svc.logCustomMeal).toHaveBeenCalledTimes(1);
  });
});
