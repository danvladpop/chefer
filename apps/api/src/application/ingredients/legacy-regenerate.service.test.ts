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

const TOFU = catalogRow('tofu', 'tofu-firm', ['firm tofu'], {
  name: 'Tofu, firm',
  kcalPer100g: 144,
});
const RICE = catalogRow('rice', 'rice-white-dry', ['rice'], {
  name: 'Rice, white, dry',
  kcalPer100g: 360,
});
const PASTA = catalogRow('pasta', 'pasta-dry', ['pasta'], { name: 'Pasta, dry', kcalPer100g: 371 });
const ROWS = new Map(
  [TOFU, RICE, PASTA].map((r) => [
    r.slug,
    { slug: r.slug, name: r.name, aliases: r.aliases.map((a) => a.alias) },
  ]),
);

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
    { name: 'tamarind paste', quantity: 2, unit: 'tbsp' },
    { name: 'leftover kofta', quantity: 1, unit: 'portion' },
  ],
  nutritionInfo: { calories: 288 },
  lines: [
    line(0, 'tofu', 1, 'block', 'firm tofu'),
    line(1, 'rice', 80, 'g', 'Rice'),
    line(2, null, 2, 'tbsp', 'tamarind paste'),
    line(3, null, 1, 'portion', 'leftover kofta'),
  ],
};

function setup(answer: (id: string) => { slug: string; quantity: number; unit: string } | null) {
  const catalog = fakeCatalog([TOFU, RICE, PASTA]);
  const writeLines = vi.fn().mockResolvedValue(undefined);
  const repo = {
    writeLines,
    findByRecipeIds: vi.fn(),
    findRecipesUsingIngredient: vi.fn(),
    findNutritionStates: vi.fn(),
    relinkIngredient: vi.fn(),
  };
  const repairRecipeLines = vi.fn((req: { lines: { id: string; rawName: string }[] }) =>
    Promise.resolve(
      req.lines.flatMap((l) => {
        const a = answer(l.rawName);
        return a ? [{ id: l.id, ...a }] : [];
      }),
    ),
  );
  const regen = new LegacyRecipeRegenerator(
    { repairRecipeLines },
    new IngredientResolver(catalog),
    catalog,
    new RecipeNutritionService(catalog, repo, new IngredientResolver(catalog)),
    { writeLines },
    ROWS,
  );
  return { regen, writeLines, repairRecipeLines };
}

describe('LegacyRecipeRegenerator.propose', () => {
  it('proposes guarded fixes, skips dishes/leftovers, and writes nothing', async () => {
    const { regen, writeLines, repairRecipeLines } = setup((name) =>
      name === 'firm tofu'
        ? { slug: 'tofu-firm', quantity: 400, unit: 'g' }
        : name === 'tamarind paste'
          ? { slug: 'pasta-dry', quantity: 30, unit: 'g' } // look-alike food
          : null,
    );
    const [o] = await regen.propose([RECIPE], { catalogSlugs: 'x', rounds: 1 });
    expect(writeLines).not.toHaveBeenCalled();
    const asked = repairRecipeLines.mock.calls[0]?.[0].lines.map(
      (l: { rawName: string }) => l.rawName,
    );
    expect(asked).toEqual(['firm tofu', 'tamarind paste']); // the leftover is never offered
    expect(o?.fixes.map((f) => f.change)).toEqual(['firm tofu (1 block) → tofu-firm 400 g']);
    expect(o?.rejected[0]).toMatch(/pasta-dry.*does not match "tamarind paste"/);
    expect(o?.skipped[0]).toMatch(/leftover kofta.*leftover of another dish/);
    expect(o?.status).toBe('PARTIAL');
  });

  it('refuses a copied count ("1 block" → 1 g) and a changed known food', async () => {
    const { regen } = setup((name) =>
      name === 'firm tofu' ? { slug: 'tofu-firm', quantity: 1, unit: 'g' } : null,
    );
    const [o] = await regen.propose([RECIPE], { catalogSlugs: 'x', rounds: 1 });
    expect(o?.fixes).toEqual([]);
    expect(o?.rejected[0]).toMatch(/copied the count/);

    const swapped = setup((name) =>
      name === 'firm tofu' ? { slug: 'rice-white-dry', quantity: 400, unit: 'g' } : null,
    );
    const [s] = await swapped.regen.propose([RECIPE], { catalogSlugs: 'x', rounds: 1 });
    expect(s?.rejected[0]).toMatch(/changed a known food/);
  });
});

describe('LegacyRecipeRegenerator.applyFixes', () => {
  const TOFU_FIX = {
    recipeId: 'r1',
    position: 0,
    slug: 'tofu-firm',
    quantity: 400,
    unit: 'g',
    change: 'firm tofu (1 block) → tofu-firm 400 g',
  };

  it('writes exactly the reviewed fixes, with the new amount in the mirror', async () => {
    const { regen, writeLines, repairRecipeLines } = setup(() => null);
    const [o] = await regen.applyFixes([RECIPE], [TOFU_FIX], { dryRun: false });
    expect(repairRecipeLines).not.toHaveBeenCalled();
    expect(o?.fixes).toHaveLength(1);
    const [, written] = writeLines.mock.calls[0] ?? [];
    expect(written[0]).toMatchObject({
      ingredientId: 'tofu',
      quantity: 400,
      unit: 'g',
      mirrorName: 'firm tofu',
    });
    expect(written[0].mirrorUnit).toBeUndefined();
    expect(written[0].note).toMatch(/regenerated 2026-10-02 \(was firm tofu \(1 block\)\)/);
    expect(written[1]).toMatchObject({ mirrorUnit: 'g', quantity: 80 });
  });

  it('re-checks amounts at apply time and skips recipes without fixes; dry run writes nothing', async () => {
    const { regen, writeLines } = setup(() => null);
    const [bad] = await regen.applyFixes([RECIPE], [{ ...TOFU_FIX, quantity: 1 }], {
      dryRun: false,
    });
    expect(bad?.rejected[0]).toMatch(/copied the count/);
    expect(writeLines).not.toHaveBeenCalled();
    expect(await regen.applyFixes([RECIPE], [], { dryRun: false })).toEqual([]);
    await regen.applyFixes([RECIPE], [TOFU_FIX], { dryRun: true });
    expect(writeLines).not.toHaveBeenCalled();
  });
});
