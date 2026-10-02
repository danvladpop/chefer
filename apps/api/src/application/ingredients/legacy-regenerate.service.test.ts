import { describe, expect, it, vi } from 'vitest';
import type { StoredRecipeLineRow } from '@chefer/database';
import { catalogRow, fakeCatalog } from '../../test-support/fake-catalog.js';
import { IngredientResolver } from './ingredient-resolver.js';
import { LegacyRecipeRegenerator, type LegacyRecipe } from './legacy-regenerate.service.js';
import { RecipeNutritionService } from './recipe-nutrition.service.js';

vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  prisma: {},
  ingredientPriceRepository: {
    findUnlinkedPrivate: vi.fn().mockResolvedValue([]),
    linkIngredient: vi.fn(),
  },
}));

const TOFU = catalogRow('tofu', 'tofu-firm', ['firm tofu'], { kcalPer100g: 144 });
const RICE = catalogRow('rice', 'rice-white-dry', ['rice'], { kcalPer100g: 360 });

function line(
  position: number,
  ingredientId: string | null,
  quantity: number,
  unit: string,
  rawName: string,
): StoredRecipeLineRow {
  return {
    id: `l${position}`,
    recipeId: 'r1',
    position,
    ingredientId,
    rawName,
    quantity,
    unit,
    grams: null,
    note: null,
    optional: false,
  };
}

const RECIPE: LegacyRecipe = {
  id: 'r1',
  name: 'Tofu rice bowl',
  creatorId: null,
  servings: 1,
  ingredients: [
    { name: 'firm tofu', quantity: 1, unit: 'block' },
    { name: 'Rice', quantity: 80, unit: 'g' },
  ],
  nutritionInfo: { calories: 288 },
  lines: [line(0, 'tofu', 1, 'block', 'firm tofu'), line(1, 'rice', 80, 'g', 'Rice')],
};

function setup(fix: { slug: string; quantity: number; unit: string } | null) {
  const catalog = fakeCatalog([TOFU, RICE]);
  const writeLines = vi.fn().mockResolvedValue(undefined);
  const lines = {
    writeLines,
    findByRecipeIds: vi.fn(),
    findRecipesUsingIngredient: vi.fn(),
    findNutritionStates: vi.fn(),
    relinkIngredient: vi.fn(),
  };
  const repairRecipeLines = vi.fn((req: { lines: { id: string }[] }) =>
    Promise.resolve(fix ? req.lines.map((l) => ({ id: l.id, ...fix })) : []),
  );
  const regen = new LegacyRecipeRegenerator(
    { repairRecipeLines },
    new IngredientResolver(catalog),
    catalog,
    new RecipeNutritionService(catalog, lines, new IngredientResolver(catalog)),
    { writeLines },
  );
  return { regen, writeLines, repairRecipeLines };
}

describe('LegacyRecipeRegenerator', () => {
  it('regenerates only the bad line, recomputes, and writes the new amount to the mirror', async () => {
    const { regen, writeLines, repairRecipeLines } = setup({
      slug: 'tofu-firm',
      quantity: 350,
      unit: 'g',
    });
    const [o] = await regen.regenerate([RECIPE], { dryRun: false, catalogSlugs: 'x' });
    expect(repairRecipeLines).toHaveBeenCalledTimes(1);
    expect(o).toMatchObject({ status: 'COMPUTED', newKcal: 792, remaining: [] });
    expect(o?.changes).toEqual(['firm tofu (1 block) → tofu-firm 350 g']);
    const [, written] = writeLines.mock.calls[0] ?? [];
    expect(written[0]).toMatchObject({
      ingredientId: 'tofu',
      quantity: 350,
      unit: 'g',
      mirrorName: 'firm tofu',
    });
    expect(written[0].mirrorUnit).toBeUndefined();
    expect(written[0].note).toMatch(/regenerated 2026-10-02 \(was firm tofu \(1 block\)\)/);
    expect(written[1]).toMatchObject({ mirrorUnit: 'g', quantity: 80 });
  });

  it('dry run writes nothing; an absurd amount or no answer leaves the recipe PARTIAL', async () => {
    const dry = setup({ slug: 'tofu-firm', quantity: 350, unit: 'g' });
    await dry.regen.regenerate([RECIPE], { dryRun: true, catalogSlugs: 'x' });
    expect(dry.writeLines).not.toHaveBeenCalled();

    const absurd = setup({ slug: 'tofu-firm', quantity: 5000, unit: 'g' });
    const [a] = await absurd.regen.regenerate([RECIPE], { dryRun: false, catalogSlugs: 'x' });
    expect(a?.status).toBe('PARTIAL');
    expect(absurd.repairRecipeLines).toHaveBeenCalledTimes(2);
    expect(absurd.writeLines).not.toHaveBeenCalled();

    const none = setup(null);
    const [n] = await none.regen.regenerate([RECIPE], { dryRun: false, catalogSlugs: 'x' });
    expect(n?.remaining).toEqual(['firm tofu: BAD_UNIT']);
  });
});
