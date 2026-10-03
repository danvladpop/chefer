import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { trackerRouter } from './tracker.router.js';

// UX-FOOD-20: Progress picks its window. `monthlySummary` keeps its 28-day
// default (shipped app builds send no `days`) and accepts 7–90 additively.
const svc = vi.hoisted(() => ({ monthlySummary: vi.fn(), summary: vi.fn() }));
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
  clientApiLevel: 0,
  res: {} as Response,
});

describe('tracker.monthlySummary window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('without `days` it is the 28-day summary, exactly as before', async () => {
    await caller.monthlySummary();
    await caller.monthlySummary({ localDate: '2026-10-03' });
    expect(svc.monthlySummary).toHaveBeenNthCalledWith(1, 'u1', undefined);
    expect(svc.monthlySummary).toHaveBeenNthCalledWith(2, 'u1', '2026-10-03');
    expect(svc.summary).not.toHaveBeenCalled();
  });

  it('`days` picks the window, anchored on the client date', async () => {
    await caller.monthlySummary({ localDate: '2026-10-03', days: 90 });
    expect(svc.summary).toHaveBeenCalledWith('u1', 90, '2026-10-03');
    await caller.monthlySummary({ days: 28 });
    expect(svc.monthlySummary).toHaveBeenCalledWith('u1', undefined);
  });

  it('rejects windows outside 7–90 days', async () => {
    await expect(caller.monthlySummary({ days: 6 })).rejects.toThrow();
    await expect(caller.monthlySummary({ days: 91 })).rejects.toThrow();
    await expect(caller.monthlySummary({ days: 30.5 })).rejects.toThrow();
  });
});
