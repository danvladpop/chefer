import { describe, expect, it } from 'vitest';
import { computeFixtureNutrition } from './computed-nutrition.js';
import { CURATED_POOL_BY_TYPE, deriveDietTags } from './index.js';
import { VARIETY_BREAKFAST_POOL, VARIETY_DINNER_POOL, VARIETY_LUNCH_POOL } from './variety-pool.js';

// WP-14 lane C: the diet gap-fill recipes. Tags are load-bearing for the free
// planner's safety filter, so each claimed diet tag must be backed by the
// recipe's own ingredients and method — never just asserted.

const SLOTS = [
  ['breakfast', VARIETY_BREAKFAST_POOL, 300, 700],
  ['lunch', VARIETY_LUNCH_POOL, 400, 750],
  ['dinner', VARIETY_DINNER_POOL, 450, 750],
] as const;
const ALL = SLOTS.flatMap(([, pool]) => pool);
const SERVED = new Map(
  Object.values(CURATED_POOL_BY_TYPE)
    .flat()
    .map((r) => [r.id, r] as const),
);
const DERIVABLE = ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'];

describe('variety pool (diet gap-fill)', () => {
  it('has unique cur-v ids and is wired into the served pool', () => {
    expect(new Set(ALL.map((r) => r.id)).size).toBe(ALL.length);
    for (const r of ALL) {
      expect(r.id).toMatch(/^cur-v-\d{3}$/);
      expect(SERVED.has(`curated-${r.id}`), r.id).toBe(true);
    }
  });

  it.each(ALL.map((r) => [r.id, r.name, r] as const))(
    '%s (%s): diet tags are true by ingredients and method',
    (_id, _name, recipe) => {
      const served = SERVED.get(`curated-${recipe.id}`);
      expect(served).toBeDefined();
      if (!served) return;
      const derived = deriveDietTags(served);
      const claimed = recipe.dietaryTags.filter((t) => DERIVABLE.includes(t));
      expect(claimed.filter((t) => !derived.includes(t))).toEqual([]);
      // a vegan recipe is also served to vegetarians, so a vegetarian-only tag
      // must not sit on a recipe that is actually vegan (and vice versa)
      if (recipe.dietaryTags.includes('vegan')) expect(derived).toContain('vegetarian');
      if (recipe.dietaryTags.includes('pescatarian')) expect(derived).not.toContain('vegetarian');
    },
  );

  it.each(ALL.map((r) => [r.id, r] as const))('%s computes fully from catalog slugs', (_id, r) => {
    const result = computeFixtureNutrition(r);
    expect(result.status).toBe('COMPUTED');
    expect(result.lines.filter((l) => l.problem && !l.optional)).toEqual([]);
  });

  it('keeps per-serving calories suited to the meal slot and prep weeknight-friendly', () => {
    for (const [slot, pool, min, max] of SLOTS) {
      for (const r of pool) {
        const served = SERVED.get(`curated-${r.id}`);
        const calories = served?.nutritionInfo.calories ?? 0;
        expect(calories, `${slot} ${r.id}`).toBeGreaterThanOrEqual(min);
        expect(calories, `${slot} ${r.id}`).toBeLessThanOrEqual(max);
        expect(r.prepTimeMins + r.cookTimeMins, r.id).toBeLessThanOrEqual(45);
      }
    }
  });
});
