import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { recipeRouter } from './recipe.router.js';

// T-01.6 (bug B-01): installed mobile apps below api-level 2 hard-code
// `dietaryTags: []` on every save; the router keeps the stored tags for
// them instead of wiping them. The service is mocked — this exercises only
// the router's guard.
const svc = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../application/recipe/recipe.service.js', () => ({ recipeService: svc }));
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
const callerFor = (isMobileClient: boolean, clientApiLevel: number) =>
  recipeRouter.createCaller({
    user,
    requestId: 'test',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient,
    clientApiLevel,
    res: {} as Response,
  });

const UPDATE = {
  recipeId: 'r1',
  name: 'Lentil soup',
  ingredients: [{ name: 'Lentils', quantity: 200, unit: 'g' }],
  dietaryTags: [] as string[],
};

describe('recipe.update — bug B-01 empty-tags guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.update.mockResolvedValue({ id: 'r1' });
  });

  it.each([0, 1])('an installed mobile app at level %i keeps the stored tags', async (level) => {
    await callerFor(true, level).update(UPDATE);
    expect(svc.update.mock.calls[0]![2]).not.toHaveProperty('dietaryTags');
  });

  it('a wave-1 mobile build (level 2) clearing its tags is trusted', async () => {
    await callerFor(true, 2).update(UPDATE);
    expect(svc.update.mock.calls[0]![2]).toMatchObject({ dietaryTags: [] });
  });

  it('web clearing its tags is trusted at any level', async () => {
    await callerFor(false, 1).update(UPDATE);
    expect(svc.update.mock.calls[0]![2]).toMatchObject({ dietaryTags: [] });
  });

  it('non-empty tags are always applied', async () => {
    await callerFor(true, 0).update({ ...UPDATE, dietaryTags: ['Vegetarian'] });
    expect(svc.update.mock.calls[0]![2]).toMatchObject({ dietaryTags: ['Vegetarian'] });
  });
});
