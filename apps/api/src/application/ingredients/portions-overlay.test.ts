import { describe, expect, it } from 'vitest';
import { readCatalogFile, readGeneratedCatalogFile } from '@chefer/database';
import { computeRecipeNutrition, type NutritionIngredient } from '@chefer/utils';

// UX-REC-14: an imported "3 piece garlic" used to come back PARTIAL
// ("No weight for 'piece'") because FDC publishes only "clove" for garlic.
// The curated portions overlay (packages/database/data/ingredients/portions-overlay.json)
// supplies the sourced `piece` weight.

function lookup(entries: ReturnType<typeof readCatalogFile>): Map<string, NutritionIngredient> {
  return new Map(
    entries.map((e) => [
      e.slug,
      {
        id: e.slug,
        kcalPer100g: e.kcalPer100g ?? 0,
        proteinPer100g: e.proteinPer100g ?? 0,
        carbsPer100g: e.carbsPer100g ?? 0,
        fatPer100g: e.fatPer100g ?? 0,
        fiberPer100g: e.fiberPer100g ?? 0,
        densityGPerMl: e.densityGPerMl ?? null,
        portions: e.portions,
      },
    ]),
  );
}

const line = (ingredientId: string, quantity: number, unit: string) => ({
  ingredientId,
  quantity,
  unit,
});

describe('portions overlay in the nutrition engine', () => {
  it('"3 piece garlic" was PARTIAL on the generated catalog and now computes', () => {
    const before = computeRecipeNutrition(
      [line('garlic-raw', 3, 'piece')],
      lookup(readGeneratedCatalogFile()),
      1,
    );
    expect(before.status).toBe('PARTIAL');
    expect(before.lines[0]?.problem).toBe('NO_PORTION');

    const after = computeRecipeNutrition(
      [line('garlic-raw', 3, 'piece')],
      lookup(readCatalogFile()),
      1,
    );
    expect(after.status).toBe('COMPUTED');
    expect(after.lines[0]?.grams).toBe(9);
    expect(after.total.calories).toBeGreaterThan(0);
  });

  it('computes the other common count lines, and still honours the existing clove unit', () => {
    const catalog = lookup(readCatalogFile());
    const r = computeRecipeNutrition(
      [
        line('garlic-raw', 1, 'clove'),
        line('onion-raw', 1, 'piece'),
        line('tomato-raw', 2, 'piece'),
        line('egg-boiled', 2, 'piece'),
        line('chicken-breast-raw', 1, 'piece'),
      ],
      catalog,
      2,
    );
    expect(r.status).toBe('COMPUTED');
    expect(r.lines.map((l) => l.grams)).toEqual([3, 110, 246, 100, 118]);
  });
});
