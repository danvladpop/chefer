import { describe, expect, it } from 'vitest';
import { catalogBySlug, computeFixtureNutrition } from './computed-nutrition.js';
import { CURATED_POOL_BY_TYPE } from './index.js';

// plan-ingredient-catalog §6.2 / §7 exit criteria: every curated recipe is
// built from catalog rows by slug, computes fully (COMPUTED), and the pool
// serves the computed numbers — never hand-written ones (F5).

const ALL = Object.values(CURATED_POOL_BY_TYPE).flat();

describe('curated pool nutrition is computed from the catalog', () => {
  it('has the whole pool (64 recipes)', () => {
    expect(ALL).toHaveLength(64);
  });

  it('every line names an existing catalog row by slug', () => {
    const catalog = catalogBySlug();
    const bad = ALL.flatMap((r) =>
      r.ingredients
        .filter((i) => !i.slug || !catalog.has(i.slug))
        .map((i) => `${r.id}: ${i.name} → ${i.slug ?? '(no slug)'}`),
    );
    expect(bad).toEqual([]);
  });

  it.each(ALL.map((r) => [r.id, r] as const))('%s computes fully', (_id, recipe) => {
    const result = computeFixtureNutrition(recipe);
    const problems = result.lines
      .filter((l) => l.problem && !l.optional)
      .map(
        (l) =>
          `${recipe.ingredients[l.position]?.name} (${recipe.ingredients[l.position]?.unit}): ${l.problem}`,
      );
    expect(problems).toEqual([]);
    expect(result.status).toBe('COMPUTED');
    // the pool serves exactly the computed numbers (I1-style)
    expect(recipe.nutritionInfo).toEqual(result.perServing);
  });

  it('computed per-serving numbers are plausible for a single meal', () => {
    for (const r of ALL) {
      const { calories, protein } = r.nutritionInfo;
      expect(calories, r.id).toBeGreaterThan(40);
      expect(calories, r.id).toBeLessThan(1400);
      expect(protein, r.id).toBeLessThan(150);
    }
  });
});
