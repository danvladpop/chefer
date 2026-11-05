import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { curatedAdminRouter } from './curated-admin.router.js';

// Market review F1/F2: the curated ingest queue publishes into the pool every
// free user eats from, so the whole namespace is admin-only. The service is
// mocked; this pins the gate.
const svc = vi.hoisted(() => ({
  ingest: vi.fn(),
  budget: vi.fn(),
  list: vi.fn(),
  counts: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  rewriteProse: vi.fn(),
  retry: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  unpublish: vi.fn(),
}));
vi.mock('../application/curated-ingest/curated-ingest.instance.js', () => ({
  curatedIngestService: svc,
}));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function callerAs(role: UserProfile['role'] | null) {
  const user: UserProfile | null = role
    ? {
        id: 'u1',
        email: 'u@x.dev',
        name: null,
        firstName: null,
        role,
        planTier: 'PREMIUM',
        image: null,
      }
    : null;
  return curatedAdminRouter.createCaller({
    user,
    requestId: 'test',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: false,
    clientApiLevel: 0,
    res: {} as Response,
  });
}

const URL = 'https://www.youtube.com/shorts/abc123';

/** Every procedure, called with valid input. */
function everyProcedure(caller: ReturnType<typeof callerAs>) {
  return [
    () => caller.ingest({ url: URL }),
    () => caller.budget(),
    () => caller.list({ statuses: [] }),
    () => caller.get({ id: 'd1' }),
    () => caller.update({ id: 'd1', mealTypes: ['dinner'] }),
    () => caller.rewriteProse({ id: 'd1' }),
    () => caller.retry({ id: 'd1' }),
    () => caller.approve({ id: 'd1' }),
    () => caller.reject({ id: 'd1' }),
    () => caller.unpublish({ id: 'd1' }),
    () => caller.coverage(),
  ];
}

describe('curatedAdmin gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['USER', 'MODERATOR'] as const)('rejects a %s on every procedure', async (role) => {
    for (const call of everyProcedure(callerAs(role))) {
      await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller', async () => {
    for (const call of everyProcedure(callerAs(null))) {
      await expect(call()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
  });

  it('lets an admin ingest a link', async () => {
    svc.ingest.mockResolvedValue({ id: 'd1', status: 'EXTRACTING' });
    await expect(callerAs('ADMIN').ingest({ url: URL })).resolves.toMatchObject({ id: 'd1' });
    expect(svc.ingest).toHaveBeenCalledWith('u1', URL);
  });

  it('refuses a non-URL before reaching the service', async () => {
    await expect(callerAs('ADMIN').ingest({ url: 'not a link' })).rejects.toThrow();
    expect(svc.ingest).not.toHaveBeenCalled();
  });
});
