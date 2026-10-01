import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ingredientPriceRepository,
  prisma,
  type IngredientPrice,
  type IRecipeLineRepository,
} from '@chefer/database';
import { catalogRow, fakeCatalog, type FakeCatalog } from '../../test-support/fake-catalog.js';
import { IngredientResolver } from './ingredient-resolver.js';
import { IngredientsService } from './ingredients.service.js';
import { RecipeNutritionService } from './recipe-nutrition.service.js';

// Catalog-backed ingredients.* (plan-ingredient-catalog §9). The catalog is an
// in-memory fake that honours ownership; the legacy price table is mocked.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  ingredientPriceRepository: {
    searchCatalog: vi.fn(),
    findUnlinkedPrivate: vi.fn(),
    linkIngredient: vi.fn(),
    findLinkedPrices: vi.fn(),
  },
  prisma: {
    ingredientPrice: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('../../lib/ingredient-images/index.js', () => ({
  resolveIngredientImage: vi.fn().mockResolvedValue('https://cdn/fallback.png'),
}));
// estimateNutrition imports aiService (env-dependent); unused here.
vi.mock('../../lib/ai/index.js', () => ({ aiService: { estimateIngredientPrices: vi.fn() } }));

const GARLIC = catalogRow('garlic', 'garlic-raw', ['garlic', 'usturoi'], {
  name: 'Garlic, raw',
  category: 'VEGETABLE',
  kcalPer100g: 149,
  proteinPer100g: 6.4,
  carbsPer100g: 31,
  fatPer100g: 0.5,
  fiberPer100g: 2.1,
  portions: [{ unit: 'clove', grams: 3, source: 'fdc-portion:1' }],
});
const OIL = catalogRow('oil', 'olive-oil', ['olive oil', 'ulei de masline'], {
  name: 'Olive oil',
  category: 'OIL_FAT',
  kcalPer100g: 884,
  fatPer100g: 100,
  proteinPer100g: 0,
  carbsPer100g: 0,
  densityGPerMl: 0.913,
});
const OLIVES = catalogRow('olives', 'olives-green', ['green olives', 'olives'], {
  name: 'Olives, green',
  category: 'CANNED_JARRED',
});
const TAHINI = catalogRow('tahini', 'tahini', ['tahini'], { name: 'Tahini', category: 'NUT_SEED' });
const ALICE_SKYR = catalogRow('askyr', 'lidl-skyr', ['lidl skyr'], {
  name: 'Lidl Skyr',
  ownerId: 'alice',
  nutritionSource: 'USER',
  sourceRef: null,
});
const BOB_SAUCE = catalogRow('bsauce', 'olive-sauce', ['olive sauce'], {
  ownerId: 'bob',
  nutritionSource: 'USER',
});

let catalog: FakeCatalog;
let lines: IRecipeLineRepository;
let nutrition: RecipeNutritionService;
let service: IngredientsService;

beforeEach(() => {
  vi.clearAllMocks();
  catalog = fakeCatalog(
    [GARLIC, OIL, OLIVES, TAHINI, ALICE_SKYR, BOB_SAUCE].map((r) => ({
      ...r,
      aliases: [...r.aliases],
    })),
  );
  lines = {
    writeLines: vi.fn(),
    findByRecipeIds: vi.fn().mockResolvedValue([]),
    findRecipesUsingIngredient: vi.fn().mockResolvedValue([]),
    findNutritionStates: vi.fn().mockResolvedValue([]),
    relinkIngredient: vi.fn().mockResolvedValue(0),
  };
  nutrition = new RecipeNutritionService(catalog, lines);
  service = new IngredientsService(catalog, new IngredientResolver(catalog), nutrition);
  vi.mocked(ingredientPriceRepository.findUnlinkedPrivate).mockResolvedValue([]);
  vi.mocked(prisma.ingredientPrice.findUnique).mockResolvedValue(null);
});

describe('search', () => {
  it('ranks exact → prefix → substring and keeps the legacy fields meaningful', async () => {
    const results = await service.search('alice', 'olive');
    expect(results.map((r) => r.id)).toEqual(['olives', 'oil']);
    expect(results[0]).toMatchObject({
      // the alias the query matched: an old client writes it into the line,
      // and it resolves back to this row
      name: 'olives',
      displayName: 'Olives, green',
      hasMacros: true,
      isCustom: false,
      slug: 'olives-green',
      category: 'CANNED_JARRED',
      owner: 'global',
      hasDensity: false,
    });
  });

  it('includes the caller’s private rows, never another user’s (I4)', async () => {
    expect((await service.search('alice', 'skyr')).map((r) => r.id)).toEqual(['askyr']);
    expect((await service.search('bob', 'skyr')).map((r) => r.id)).toEqual([]);
    expect((await service.search('alice', 'olive sauce')).map((r) => r.id)).toEqual([]);
  });

  it('filters by category and matches Romanian names without diacritics', async () => {
    const oils = await service.search('alice', 'olive', 12, { category: 'OIL_FAT' });
    expect(oils.map((r) => r.id)).toEqual(['oil']);
    expect((await service.search('alice', 'Ulei de măsline'))[0]?.id).toBe('oil');
  });

  it('returns nothing under 2 characters', async () => {
    expect(await service.search('alice', 'o')).toEqual([]);
  });

  it('gives a pre-catalog custom ingredient a private twin and finds it', async () => {
    vi.mocked(ingredientPriceRepository.findUnlinkedPrivate).mockResolvedValueOnce([
      {
        ingredientName: 'protein bar',
        creatorId: 'alice',
        caloriesPer100g: 380,
        proteinPer100g: 30,
        carbsPer100g: 35,
        fatPer100g: 12,
        fiberPer100g: 5,
        gramsPerPiece: 45,
        imageUrl: null,
        ingredientId: null,
      } as IngredientPrice,
    ]);
    const [bar] = await service.search('alice', 'protein bar');
    expect(bar).toMatchObject({ name: 'protein bar', owner: 'mine', isCustom: true });
    expect(bar?.portions).toEqual([{ unit: 'piece', grams: 45 }]);
    expect(vi.mocked(ingredientPriceRepository.linkIngredient)).toHaveBeenCalledWith(
      'protein bar',
      bar?.id,
    );
  });
});

describe('resolve and getMany', () => {
  it('resolve returns refs with owner, and never applies fuzzy matches', async () => {
    const [garlic, skyr, miss] = await service.resolve('alice', [
      { rawName: 'Garlic cloves, minced', unit: 'cloves' },
      { rawName: 'Lidl skyr', unit: 'g' },
      { rawName: 'dragonfruit', unit: 'piece' },
    ]);
    expect(garlic).toMatchObject({
      confidence: 'ALIAS',
      unit: 'clove',
      match: { id: 'garlic', owner: 'global' },
    });
    expect(skyr).toMatchObject({ match: { id: 'askyr', owner: 'mine' } });
    expect(miss).toMatchObject({ confidence: 'NONE', match: null, candidates: [] });
  });

  it('getMany returns full nutrition for visible rows only', async () => {
    const rows = await service.getMany('alice', ['oil', 'bsauce', 'askyr']);
    expect(rows.map((r) => r.id).sort()).toEqual(['askyr', 'oil']);
    expect(rows.find((r) => r.id === 'oil')).toMatchObject({
      per100g: { calories: 884, fat: 100, fiber: 0 },
      densityGPerMl: 0.913,
      hasDensity: true,
      status: 'ACTIVE',
    });
  });
});

describe('createCustom', () => {
  const input = {
    name: 'Tahini',
    caloriesPer100g: 600,
    proteinPer100g: 18,
    carbsPer100g: 20,
    fatPer100g: 54,
    fiberPer100g: 9,
  };

  it('refuses a duplicate of a global row unless the user confirms it is different', async () => {
    await expect(service.createCustom('alice', input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Chefer already has "Tahini" — search for it instead.',
    });
    const created = await service.createCustom('alice', { ...input, confirmDifferent: true });
    expect(created).toMatchObject({
      owner: 'mine',
      isCustom: true,
      name: 'tahini',
      nutritionSource: 'USER',
    });
  });

  it('writes the private row and, while the name is free, a linked legacy price row', async () => {
    const created = await service.createCustom('alice', {
      ...input,
      name: 'Grandma pesto',
      gramsPerPiece: 20,
    });
    expect(catalog.rows.find((r) => r.id === created.id)).toMatchObject({
      ownerId: 'alice',
      slug: 'grandma-pesto',
      kcalPer100g: 600,
      portions: [{ unit: 'piece', grams: 20, source: 'user' }],
    });
    expect(vi.mocked(prisma.ingredientPrice.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ingredientName: 'grandma pesto' },
        create: expect.objectContaining({
          creatorId: 'alice',
          ingredientId: created.id,
        }) as unknown,
      }),
    );
  });

  it('a legacy name held by another row no longer blocks creation (F7)', async () => {
    vi.mocked(prisma.ingredientPrice.findUnique).mockResolvedValue({
      ingredientName: 'grandma pesto',
      creatorId: 'bob',
    } as IngredientPrice);
    const created = await service.createCustom('alice', { ...input, name: 'Grandma pesto' });
    expect(created.owner).toBe('mine');
    expect(vi.mocked(prisma.ingredientPrice.upsert)).not.toHaveBeenCalled();
  });
});

describe('update and delete', () => {
  const macros = {
    caloriesPer100g: 999,
    proteinPer100g: 50,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: 0,
  };

  it('an admin edit of a global price row changes price and image, never nutrition (D7)', async () => {
    vi.mocked(prisma.ingredientPrice.findUnique).mockResolvedValue({
      ingredientName: 'olive oil',
      creatorId: null,
      ingredientId: 'oil',
      imageUrl: null,
      pricePer100gEur: 1,
      pricePer100mlEur: null,
      pricePerPieceEur: null,
    } as IngredientPrice);
    vi.mocked(prisma.ingredientPrice.update).mockResolvedValue({
      ingredientName: 'olive oil',
      creatorId: null,
    } as IngredientPrice);
    await service.update('admin', 'ADMIN', { name: 'olive oil', ...macros, pricePer100gEur: 2 });
    const data = vi.mocked(prisma.ingredientPrice.update).mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ pricePer100gEur: 2, source: 'ADMIN' });
    expect(data).not.toHaveProperty('caloriesPer100g');
    expect(catalog.rows.find((r) => r.id === 'oil')?.kcalPer100g).toBe(884);
  });

  it('a private edit updates the catalog twin and recomputes the owner’s recipes', async () => {
    const recompute = vi.spyOn(nutrition, 'recomputeRecipesUsing');
    vi.mocked(prisma.ingredientPrice.findFirst).mockResolvedValue(null);
    await service.update('alice', 'USER', { id: 'askyr', name: 'Lidl skyr', ...macros });
    expect(catalog.rows.find((r) => r.id === 'askyr')).toMatchObject({
      kcalPer100g: 999,
      proteinPer100g: 50,
    });
    expect(recompute).toHaveBeenCalledWith('askyr');
  });

  it('a private edit by id can change the category and density (P9)', async () => {
    vi.mocked(prisma.ingredientPrice.findFirst).mockResolvedValue(null);
    await service.update('alice', 'USER', {
      id: 'askyr',
      name: 'Lidl skyr',
      ...macros,
      category: 'DAIRY_YOGURT_CREAM',
      densityGPerMl: 1.05,
    });
    expect(catalog.rows.find((r) => r.id === 'askyr')).toMatchObject({
      category: 'DAIRY_YOGURT_CREAM',
      densityGPerMl: 1.05,
    });
  });

  it("another user's private id is NOT_FOUND for update and delete", async () => {
    await expect(
      service.update('alice', 'USER', { id: 'bsauce', name: 'x sauce', ...macros }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.delete('alice', 'USER', 'x', 'bsauce')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deleting a private ingredient deprecates its catalog row (lines keep their numbers)', async () => {
    await service.delete('alice', 'USER', 'lidl skyr', 'askyr');
    expect(catalog.rows.find((r) => r.id === 'askyr')?.status).toBe('DEPRECATED');
    expect(await service.search('alice', 'skyr')).toEqual([]);
  });
});

describe('computeNutrition', () => {
  it('computes with the engine: names resolve, ids are honoured, nothing is guessed', async () => {
    const r = await service.computeNutrition(
      'alice',
      [
        { name: 'Garlic', quantity: 2, unit: 'cloves' },
        { name: 'anything', quantity: 1, unit: 'tbsp', ingredientId: 'oil' },
        { name: 'Unicorn dust', quantity: 1, unit: 'g' },
        { name: 'olive sauce', quantity: 50, unit: 'g', ingredientId: 'bsauce' },
      ],
      2,
    );
    expect(r.status).toBe('PARTIAL');
    expect(r.unmatched).toEqual(['Unicorn dust', 'olive sauce']);
    expect(r.matchedCount).toBe(2);
    expect(r.lines[0]).toMatchObject({ ingredientId: 'garlic', grams: 6 });
    expect(r.lines[1]?.grams).toBeCloseTo(13.5, 1);
    expect(r.lines[3]).toMatchObject({ ingredientId: 'bsauce', problem: 'NO_INGREDIENT' });
    // (6 g garlic ≈ 8.9 kcal + 13.5 g oil ≈ 119.4 kcal) ÷ 2 servings
    expect(r.perServing.calories).toBe(64);
  });

  it('COMPUTED when every line resolves', async () => {
    const r = await service.computeNutrition(
      'alice',
      [{ name: 'olive oil', quantity: 10, unit: 'g' }],
      1,
    );
    expect(r).toMatchObject({
      status: 'COMPUTED',
      unmatched: [],
      perServing: { calories: 88, fat: 10 },
    });
  });
});

describe('catalogList', () => {
  const PRICES = [
    {
      ingredientName: 'garlic',
      ingredientId: 'garlic',
      imageUrl: 'https://cdn/garlic.png',
      pricePer100gEur: 0.9,
      pricePer100mlEur: null,
      pricePerPieceEur: 0.3,
      creatorId: null,
    },
    // another user's private price row linked to a global row: never used
    {
      ingredientName: 'olive oil',
      ingredientId: 'oil',
      imageUrl: 'https://cdn/bob-oil.png',
      pricePer100gEur: 99,
      pricePer100mlEur: null,
      pricePerPieceEur: null,
      creatorId: 'bob',
    },
  ];

  beforeEach(() => {
    vi.mocked(ingredientPriceRepository.findLinkedPrices).mockImplementation((ids, userId) =>
      Promise.resolve(
        PRICES.filter(
          (p) => ids.includes(p.ingredientId) && (p.creatorId === null || p.creatorId === userId),
        ),
      ),
    );
  });

  it('lists the caller’s private rows first, then globals, never another user’s (I4)', async () => {
    const r = await service.catalogList('alice', 'USER', { limit: 50, offset: 0 });
    const ids = r.items.map((i) => i.id);
    expect(ids[0]).toBe('askyr');
    expect(ids).not.toContain('bsauce');
    expect(ids).toEqual(expect.arrayContaining(['garlic', 'oil', 'olives', 'tahini']));
    expect(r.hasMore).toBe(false);
    expect(r.nextCursor).toBeNull();
  });

  it('carries source, aliases, portions, nutrition and the linked global price row', async () => {
    const r = await service.catalogList('alice', 'USER', {
      search: 'usturoi',
      limit: 10,
      offset: 0,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      id: 'garlic',
      name: 'Garlic, raw',
      nutritionSource: 'USDA_FDC',
      owner: 'global',
      aliases: expect.arrayContaining([{ alias: 'usturoi', locale: 'en' }]) as unknown,
      portions: [{ unit: 'clove', grams: 3 }],
      per100g: expect.objectContaining({ calories: 149, fiber: 2.1 }) as unknown,
      imageUrl: 'https://cdn/garlic.png',
      prices: { per100gEur: 0.9, per100mlEur: null, perPieceEur: 0.3 },
      priceRowName: 'garlic',
      // global nutrition is read-only, and a non-admin cannot edit prices (D7)
      editable: 'none',
    });
  });

  it('lets an admin edit price/image of a global row only when a price row is linked', async () => {
    const r = await service.catalogList('admin', 'ADMIN', { limit: 50, offset: 0 });
    const byId = new Map(r.items.map((i) => [i.id, i]));
    expect(byId.get('garlic')?.editable).toBe('priceImage');
    expect(byId.get('tahini')?.editable).toBe('none');
    // another user's private price row never surfaces
    expect(byId.get('oil')?.prices).toBeNull();
    expect(byId.get('oil')?.imageUrl).toBe('https://cdn/fallback.png');
  });

  it('marks the owner’s private rows fully editable and filters mineOnly / category', async () => {
    const mine = await service.catalogList('alice', 'USER', {
      mineOnly: true,
      limit: 10,
      offset: 0,
    });
    expect(mine.items.map((i) => [i.id, i.owner, i.editable])).toEqual([['askyr', 'mine', 'full']]);
    const oils = await service.catalogList('alice', 'USER', {
      category: 'OIL_FAT',
      limit: 10,
      offset: 0,
    });
    expect(oils.items.map((i) => i.id)).toEqual(['oil']);
  });

  it('pages with a next cursor', async () => {
    const first = await service.catalogList('alice', 'USER', { limit: 2, offset: 0 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(2);
    const second = await service.catalogList('alice', 'USER', { limit: 2, offset: 2 });
    expect(second.items.map((i) => i.id)).not.toEqual(first.items.map((i) => i.id));
  });
});
