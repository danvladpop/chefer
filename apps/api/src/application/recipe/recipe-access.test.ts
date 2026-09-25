import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import { findRecipeVisibleTo, isRecipeOpenTo } from './recipe-access.js';

vi.mock('@chefer/database', () => ({ mealPlanRepository: {} }));

const row = (source: Recipe['source'], creatorId: string | null): Recipe =>
  ({ id: 'r1', source, creatorId }) as Recipe;

const repoWith = (recipe: Recipe | null, inPlans = false) => ({
  findRecipeById: vi.fn().mockResolvedValue(recipe),
  isRecipeInUserPlans: vi.fn().mockResolvedValue(inPlans),
});

describe('isRecipeOpenTo', () => {
  it('opens curated and AI recipes to everyone', () => {
    expect(isRecipeOpenTo(row('CURATED', null), 'u2')).toBe(true);
    expect(isRecipeOpenTo(row('AI', 'u1'), 'u2')).toBe(true);
  });

  it('keeps a MANUAL recipe private to its creator', () => {
    expect(isRecipeOpenTo(row('MANUAL', 'u1'), 'u1')).toBe(true);
    expect(isRecipeOpenTo(row('MANUAL', 'u1'), 'u2')).toBe(false);
  });
});

describe('findRecipeVisibleTo', () => {
  it("hides another user's private recipe (F-REC-2-1)", async () => {
    const repo = repoWith(row('MANUAL', 'victim'));
    expect(await findRecipeVisibleTo('attacker', 'r1', repo)).toBeNull();
  });

  it("shows another user's recipe when it is already in the caller's own plan", async () => {
    const recipe = row('MANUAL', 'someone');
    const repo = repoWith(recipe, true);
    expect(await findRecipeVisibleTo('u2', 'r1', repo)).toBe(recipe);
    expect(repo.isRecipeInUserPlans).toHaveBeenCalledWith('u2', 'r1');
  });

  it('skips the plan lookup for open recipes and returns null for missing ones', async () => {
    const open = repoWith(row('CURATED', null));
    expect(await findRecipeVisibleTo('u2', 'r1', open)).not.toBeNull();
    expect(open.isRecipeInUserPlans).not.toHaveBeenCalled();
    expect(await findRecipeVisibleTo('u2', 'r1', repoWith(null))).toBeNull();
  });
});
