import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import { aiService } from '../lib/ai/index.js';
import { catalogRow } from '../test-support/fake-catalog.js';
import { capacityRetryDelayMs, IngredientPriceWorker } from './ingredient-price.worker.js';

vi.mock('../lib/ai/index.js', () => ({ aiService: { estimateIngredientPrices: vi.fn() } }));
vi.mock('@chefer/database', () => ({
  // the default resolver's repository; every test injects its own resolver
  ingredientRepository: {},
  prisma: {
    recipe: { findMany: vi.fn() },
    ingredientPrice: { findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  },
}));

describe('capacityRetryDelayMs', () => {
  it('starts at 90 s, doubles per consecutive capacity failure, and caps at an hour', () => {
    expect(capacityRetryDelayMs(1)).toBe(90_000);
    expect(capacityRetryDelayMs(2)).toBe(180_000);
    expect(capacityRetryDelayMs(3)).toBe(360_000);
    expect(capacityRetryDelayMs(6)).toBe(2_880_000);
    expect(capacityRetryDelayMs(7)).toBe(3_600_000);
    expect(capacityRetryDelayMs(50)).toBe(3_600_000);
  });
});

// plan-ingredient-catalog §6.4 / F1: the worker prices catalog rows only. It
// never creates a row for an unknown name and never asks for or writes macros.
describe('IngredientPriceWorker — catalog-only pricing (F1)', () => {
  const ONION = catalogRow('onion-id', 'onion-raw', ['onion'], {
    portions: [
      { unit: 'large', grams: 150, source: 'fdc-portion:1' },
      { unit: 'medium', grams: 110, source: 'fdc-portion:2' },
    ],
  });
  const resolver = {
    resolveMany: vi.fn((inputs: { rawName: string }[]) =>
      Promise.resolve(
        inputs.map((i) => ({
          rawName: i.rawName,
          unit: 'piece',
          note: null,
          confidence: i.rawName === 'onion' ? ('ALIAS' as const) : ('NONE' as const),
          match: i.rawName === 'onion' ? ONION : null,
          matchedKey: null,
          candidates: [],
        })),
      ),
    ),
  };
  const tick = (w: IngredientPriceWorker) => (w as unknown as { tick(): Promise<void> }).tick();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      { ingredients: [{ name: 'Onion' }, { name: 'Unicorn dust' }] },
    ] as never);
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue([]);
    vi.mocked(aiService.estimateIngredientPrices).mockImplementation((names: string[]) =>
      Promise.resolve(
        names.map((ingredientName) => ({
          ingredientName,
          pricePer100gEur: 0.2,
          pricePer100mlEur: null,
          pricePerPieceEur: 0.25,
          caloriesPer100g: 999, // must never be stored
          proteinPer100g: 99,
          carbsPer100g: 99,
          fatPer100g: 99,
          fiberPer100g: 9,
          gramsPerPiece: 1,
        })),
      ),
    );
  });

  it('prices only names that resolve to the catalog, price-only, linked to the row', async () => {
    await tick(new IngredientPriceWorker(resolver));
    expect(aiService.estimateIngredientPrices).toHaveBeenCalledWith(['onion']);
    expect(prisma.ingredientPrice.upsert).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(prisma.ingredientPrice.upsert).mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ ingredientName: 'onion' });
    expect(arg?.create).toEqual({
      ingredientName: 'onion',
      pricePer100gEur: 0.2,
      pricePer100mlEur: null,
      pricePerPieceEur: 0.25,
      gramsPerPiece: 110, // the catalog's FDC "medium", not the model's guess
      ingredientId: 'onion-id',
    });
    expect(JSON.stringify(arg)).not.toMatch(/caloriesPer100g|proteinPer100g/);
  });

  it('links an existing unlinked price row to its catalog row', async () => {
    vi.mocked(prisma.ingredientPrice.findMany)
      .mockResolvedValueOnce([{ ingredientName: 'onion' }] as never) // unlinked rows
      .mockResolvedValueOnce([{ ingredientName: 'onion' }] as never); // fresh rows
    await tick(new IngredientPriceWorker(resolver));
    expect(prisma.ingredientPrice.update).toHaveBeenCalledWith({
      where: { ingredientName: 'onion' },
      data: { ingredientId: 'onion-id', gramsPerPiece: 110 },
    });
    expect(aiService.estimateIngredientPrices).not.toHaveBeenCalled();
  });
});
