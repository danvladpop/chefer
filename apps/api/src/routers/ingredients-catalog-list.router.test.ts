import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { ingredientsRouter } from './ingredients.router.js';

// ingredients.catalogList (plan-ingredient-catalog §10): the router maps the
// infinite-query `cursor` onto the offset and passes the caller's role; the
// service is mocked (ingredients.service.test.ts covers the listing itself).
const svc = vi.hoisted(() => ({ catalogList: vi.fn() }));
vi.mock('../application/ingredients/ingredients.service.js', () => ({ ingredientsService: svc }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const user: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'ADMIN',
  planTier: 'FREE',
  image: null,
};
const caller = ingredientsRouter.createCaller({
  user,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  clientApiLevel: 0,
  res: {} as Response,
});

describe('ingredients.catalogList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.catalogList.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });

  it('defaults to the first page of 60', async () => {
    await caller.catalogList({});
    expect(svc.catalogList).toHaveBeenCalledWith('u1', 'ADMIN', { limit: 60, offset: 0 });
  });

  it('uses the infinite-query cursor as the offset', async () => {
    await caller.catalogList({ search: 'oil', category: 'OIL_FAT', cursor: 120, offset: 0 });
    expect(svc.catalogList).toHaveBeenCalledWith('u1', 'ADMIN', {
      search: 'oil',
      category: 'OIL_FAT',
      limit: 60,
      offset: 120,
    });
  });

  it('rejects an unknown category and an oversized page', async () => {
    await expect(caller.catalogList({ category: 'NOPE' as never })).rejects.toThrow();
    await expect(caller.catalogList({ limit: 500 })).rejects.toThrow();
    expect(svc.catalogList).not.toHaveBeenCalled();
  });
});
