import { describe, expect, it } from 'vitest';
import { CURATED_POOL_BY_TYPE, safeCuratedPools } from '../../lib/curated-recipes/index.js';
import { selectDiscoverRecipes } from './discover.js';

describe('selectDiscoverRecipes (Cookbook → Discover, F-REC-1-4)', () => {
  it('lists the whole curated pool by default, once per recipe', () => {
    const all = selectDiscoverRecipes(CURATED_POOL_BY_TYPE, { limit: 100 });
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    expect(all.every((r) => r.id.startsWith('curated-'))).toBe(true);
    expect(all.every((r) => r.imageStatus === 'DONE')).toBe(true);
  });

  it('filters by meal type', () => {
    const dinners = selectDiscoverRecipes(CURATED_POOL_BY_TYPE, { mealType: 'dinner' });
    expect(dinners.length).toBeGreaterThan(0);
    expect(dinners.every((r) => r.mealType === 'dinner')).toBe(true);
  });

  it('filters by total time (prep + cook)', () => {
    const quick = selectDiscoverRecipes(CURATED_POOL_BY_TYPE, { maxTotalMins: 20, limit: 100 });
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.every((r) => r.prepTimeMins + r.cookTimeMins <= 20)).toBe(true);
  });

  it('searches names and ingredients, every word must match', () => {
    const salmon = selectDiscoverRecipes(CURATED_POOL_BY_TYPE, { search: 'salmon' });
    expect(salmon.length).toBeGreaterThan(0);
    for (const r of salmon) {
      const source = Object.values(CURATED_POOL_BY_TYPE)
        .flat()
        .find((c) => c.id === r.id)!;
      const text = [source.name, ...source.ingredients.map((i) => i.name)].join(' ').toLowerCase();
      expect(text).toContain('salmon');
    }
    expect(selectDiscoverRecipes(CURATED_POOL_BY_TYPE, { search: 'salmon zzzz' })).toEqual([]);
  });

  it('respects safety: a peanut allergy never sees peanut recipes', () => {
    const pools = safeCuratedPools({
      allergies: ['peanuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const safe = selectDiscoverRecipes(pools, { limit: 100 });
    const all = selectDiscoverRecipes(CURATED_POOL_BY_TYPE, { limit: 100 });
    expect(safe.length).toBeLessThanOrEqual(all.length);
    expect(safe.some((r) => /peanut/i.test(r.name))).toBe(false);
  });

  it('marks saved recipes and caps the result size', () => {
    const first = selectDiscoverRecipes(CURATED_POOL_BY_TYPE, {})[0]!;
    const withSaved = selectDiscoverRecipes(
      CURATED_POOL_BY_TYPE,
      { limit: 3 },
      new Set([first.id]),
    );
    expect(withSaved).toHaveLength(3);
    expect(withSaved[0]?.isFavourite).toBe(true);
    expect(withSaved[1]?.isFavourite).toBe(false);
  });
});
