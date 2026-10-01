import { describe, expect, it, vi } from 'vitest';
import type { IRecipeLineRepository, RecipeForRecompute } from '@chefer/database';
import { catalogRow, fakeCatalog } from '../../test-support/fake-catalog.js';
import { IngredientResolver } from './ingredient-resolver.js';
import { RecipeNutritionService } from './recipe-nutrition.service.js';

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  prisma: {},
  ingredientPriceRepository: {
    findUnlinkedPrivate: vi.fn().mockResolvedValue([]),
    linkIngredient: vi.fn(),
  },
}));

const OIL = catalogRow('oil', 'olive-oil', ['olive oil'], {
  kcalPer100g: 900,
  fatPer100g: 100,
  proteinPer100g: 0,
  carbsPer100g: 0,
  densityGPerMl: 0.9,
});
const SKYR = catalogRow('skyr', 'my-skyr', ['my skyr'], {
  ownerId: 'alice',
  kcalPer100g: 60,
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0,
});
const BOB_ROW = catalogRow('bob', 'bob-thing', ['bob thing'], { ownerId: 'bob' });

function line(position: number, ingredientId: string | null, quantity: number, unit: string) {
  return {
    id: `l${position}`,
    recipeId: 'r1',
    position,
    ingredientId,
    rawName: `raw ${position}`,
    quantity,
    unit,
    grams: null,
    note: position === 0 ? 'drizzled' : null,
    optional: false,
  };
}

function setup() {
  const catalog = fakeCatalog([OIL, SKYR, BOB_ROW]);
  const writeLines = vi.fn().mockResolvedValue(undefined);
  const lines: IRecipeLineRepository = {
    writeLines,
    findByRecipeIds: vi.fn(),
    findRecipesUsingIngredient: vi.fn(),
    findNutritionStates: vi.fn(),
  };
  return {
    service: new RecipeNutritionService(catalog, lines, new IngredientResolver(catalog)),
    writeLines,
    lines,
  };
}

describe('RecipeNutritionService', () => {
  it('computes only against rows the recipe owner may see', async () => {
    const { service } = setup();
    const { result } = await service.compute(
      [
        { ingredientId: 'skyr', rawName: 'skyr', quantity: 200, unit: 'g' },
        { ingredientId: 'bob', rawName: 'x', quantity: 100, unit: 'g' },
      ],
      'alice',
      1,
    );
    expect(result.status).toBe('PARTIAL');
    expect(result.perServing.calories).toBe(120);
    expect(result.lines[1]?.problem).toBe('NO_INGREDIENT');
  });

  it('recompute rewrites lines with fresh grams, keeps the mirror names and prep notes', async () => {
    const { service, writeLines } = setup();
    const recipe: RecipeForRecompute = {
      id: 'r1',
      creatorId: 'alice',
      servings: 2,
      nutritionStatus: 'COMPUTED',
      ingredients: [
        { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
        { name: 'My skyr', quantity: 150, unit: 'g' },
      ],
      lines: [line(0, 'oil', 1, 'tbsp'), line(1, 'skyr', 150, 'g')],
    };
    expect(await service.recompute(recipe)).toBe('written');
    const [recipeId, writes, nutrition] = writeLines.mock.calls[0] as [string, unknown[], unknown];
    expect(recipeId).toBe('r1');
    expect(writes).toEqual([
      expect.objectContaining({ ingredientId: 'oil', mirrorName: 'Olive oil', note: 'drizzled' }),
      expect.objectContaining({ ingredientId: 'skyr', mirrorName: 'My skyr', grams: 150 }),
    ]);
    // 1 tbsp oil = 14.79 ml × 0.9 = 13.311 g → 119.8 kcal; 150 g skyr → 90 kcal; ÷ 2
    expect(nutrition).toMatchObject({ status: 'COMPUTED', perServing: { calories: 105 } });
  });

  it('keeps a USER_ENTERED recipe whose lines still do not all resolve (D4)', async () => {
    const { service, writeLines } = setup();
    const recipe: RecipeForRecompute = {
      id: 'r1',
      creatorId: 'alice',
      servings: 1,
      nutritionStatus: 'USER_ENTERED',
      ingredients: [],
      lines: [line(0, 'skyr', 100, 'g'), line(1, null, 1, 'g')],
    };
    expect(await service.recompute(recipe)).toBe('kept-user-entered');
    expect(writeLines).not.toHaveBeenCalled();
  });

  it('recomputeRecipesUsing walks every recipe that uses the ingredient', async () => {
    const { service, lines } = setup();
    const base: RecipeForRecompute = {
      id: 'r1',
      creatorId: 'alice',
      servings: 1,
      nutritionStatus: 'COMPUTED',
      ingredients: [],
      lines: [line(0, 'skyr', 100, 'g')],
    };
    vi.mocked(lines.findRecipesUsingIngredient).mockResolvedValue([
      base,
      { ...base, id: 'r2', nutritionStatus: 'USER_ENTERED', lines: [line(0, null, 1, 'g')] },
    ]);
    expect(await service.recomputeRecipesUsing('skyr')).toEqual({ written: 1, kept: 1 });
  });
});

describe('RecipeNutritionService.prepareSave (manual saves, plan §6.2 / D4)', () => {
  const typedByHand = {
    calories: 999,
    protein: 9,
    carbs: 9,
    fat: 9,
    fiber: 0,
    source: 'manual' as const,
  };

  it('every line resolves → COMPUTED, and the client’s numbers are ignored', async () => {
    const { service } = setup();
    const r = await service.prepareSave(
      'alice',
      [
        { name: 'Olive oil', quantity: 10, unit: 'g' },
        { name: 'whatever I called it', quantity: 100, unit: 'g', ingredientId: 'skyr' },
      ],
      1,
      typedByHand,
    );
    expect(r.nutrition).toMatchObject({ status: 'COMPUTED', perServing: { calories: 150 } });
    expect(r.lines.map((l) => l.ingredientId)).toEqual(['oil', 'skyr']);
  });

  it('an old client with an unresolved line keeps its hand-typed numbers as USER_ENTERED', async () => {
    const { service } = setup();
    const r = await service.prepareSave(
      'alice',
      [
        { name: 'Olive oil', quantity: 10, unit: 'g' },
        { name: 'mystery spice', quantity: 1, unit: 'g' },
      ],
      1,
      typedByHand,
    );
    expect(r.nutrition).toEqual({
      status: 'USER_ENTERED',
      perServing: { calories: 999, protein: 9, carbs: 9, fat: 9, fiber: 0 },
      total: null,
    });
    expect(r.report[1]).toMatchObject({ ingredientId: null, problem: 'NO_INGREDIENT' });
  });

  it('client-computed numbers, or a new client, never become USER_ENTERED (PARTIAL instead)', async () => {
    const { service } = setup();
    const lines = [
      { name: 'Olive oil', quantity: 10, unit: 'g' },
      { name: 'mystery spice', quantity: 1, unit: 'g' },
    ];
    const computed = await service.prepareSave('alice', lines, 1, {
      ...typedByHand,
      source: 'computed',
    });
    expect(computed.nutrition).toMatchObject({ status: 'PARTIAL', perServing: { calories: 90 } });
    const newClient = await service.prepareSave(
      'alice',
      [{ ...lines[0]!, ingredientId: 'oil' }, lines[1]!],
      1,
      typedByHand,
    );
    expect(newClient.nutrition.status).toBe('PARTIAL');
  });

  it("another user's private ingredient id is not used (I3/I4)", async () => {
    const { service } = setup();
    const r = await service.prepareSave(
      'alice',
      [{ name: 'x', quantity: 100, unit: 'g', ingredientId: 'bob' }],
      1,
    );
    expect(r.nutrition.status).toBe('PARTIAL');
    expect(r.report[0]?.problem).toBe('NO_INGREDIENT');
  });

  it('stores canonical units with prep text in note; the Json mirror keeps what was typed', async () => {
    const { service } = setup();
    const r = await service.prepareSave(
      'alice',
      [{ name: 'Olive oil', quantity: 2, unit: 'Tablespoons, warmed' }],
      1,
    );
    expect(r.lines[0]).toMatchObject({
      unit: 'tbsp',
      note: 'warmed',
      mirrorName: 'Olive oil',
      mirrorUnit: 'Tablespoons, warmed',
    });
    expect(r.lines[0]?.grams).toBeCloseTo(2 * 14.79 * 0.9, 6);
  });
});

describe('RecipeNutritionService.copyLinesForViewer (I3/I4)', () => {
  it("drops links to the source author's private rows and recomputes for the viewer", async () => {
    const { service, writeLines, lines } = setup();
    vi.mocked(lines.findByRecipeIds).mockResolvedValue([
      { ...line(0, 'oil', 10, 'g'), recipeId: 'src' },
      { ...line(1, 'skyr', 100, 'g'), recipeId: 'src' }, // alice's private row
    ]);
    await service.copyLinesForViewer(
      { id: 'src', nutritionStatus: 'COMPUTED', nutritionInfo: {} },
      {
        id: 'copy',
        servings: 1,
        ingredients: [
          { name: 'Oil', unit: 'g' },
          { name: 'Skyr', unit: 'g' },
        ],
      },
      'bob',
    );
    const [copyId, writes, nutrition] = writeLines.mock.calls[0] as [
      string,
      { ingredientId: string | null }[],
      unknown,
    ];
    expect(copyId).toBe('copy');
    expect(writes.map((w) => w.ingredientId)).toEqual(['oil', null]);
    expect(nutrition).toMatchObject({ status: 'PARTIAL', perServing: { calories: 90 } });
  });

  it('keeps a USER_ENTERED source’s typed numbers when the copy cannot compute fully', async () => {
    const { service, writeLines, lines } = setup();
    vi.mocked(lines.findByRecipeIds).mockResolvedValue([
      { ...line(0, null, 1, 'g'), recipeId: 'src' },
    ]);
    const typed = { calories: 500, protein: 20, carbs: 50, fat: 20, fiber: 5 };
    await service.copyLinesForViewer(
      { id: 'src', nutritionStatus: 'USER_ENTERED', nutritionInfo: typed },
      { id: 'copy', servings: 1, ingredients: [] },
      'bob',
    );
    expect(writeLines.mock.calls[0]?.[2]).toEqual({
      status: 'USER_ENTERED',
      perServing: typed,
      total: null,
    });
  });

  it('is a no-op for a source without lines', async () => {
    const { service, writeLines, lines } = setup();
    vi.mocked(lines.findByRecipeIds).mockResolvedValue([]);
    await service.copyLinesForViewer(
      { id: 'src', nutritionStatus: 'PARTIAL', nutritionInfo: {} },
      { id: 'copy', servings: 1, ingredients: [] },
      'bob',
    );
    expect(writeLines).not.toHaveBeenCalled();
  });
});

describe('RecipeNutritionService.breakdown (recipe detail, plan §10)', () => {
  it('per-line facts from rows the viewer may see; another user’s private row shows grams only', async () => {
    const { service, lines } = setup();
    vi.mocked(lines.findByRecipeIds).mockResolvedValue([
      { ...line(0, 'oil', 10, 'g'), grams: 10 },
      { ...line(1, 'skyr', 100, 'g'), grams: 100 }, // alice's private row
      { ...line(2, null, 1, 'g'), grams: null },
    ]);
    const asBob = await service.breakdown('r1', 'bob');
    expect(asBob.map((l) => [l.ingredientName, l.grams, l.facts?.calories ?? null])).toEqual([
      ['olive-oil', 10, 90],
      [null, 100, null],
      [null, null, null],
    ]);
    const asAlice = await service.breakdown('r1', 'alice');
    expect(asAlice[1]).toMatchObject({
      ingredientId: 'skyr',
      facts: { calories: 60, protein: 11 },
    });
  });

  it('is empty for a recipe without lines', async () => {
    const { service, lines } = setup();
    vi.mocked(lines.findByRecipeIds).mockResolvedValue([]);
    expect(await service.breakdown('r1', 'bob')).toEqual([]);
  });
});
