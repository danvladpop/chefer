import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import { estimatePlanCostEur } from './plan-cost.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: { ingredientPrice: { findMany: vi.fn() } },
  };
});

const day = (ingredients: { name: string; quantity: number; unit: string }[]) => ({
  meals: [{ recipe: { ingredients } }],
});

describe('estimatePlanCostEur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue([
      {
        ingredientName: 'chicken breast',
        pricePer100gEur: 1.0,
        pricePer100mlEur: null,
        pricePerPieceEur: null,
      },
      {
        ingredientName: 'olive oil',
        pricePer100gEur: null,
        pricePer100mlEur: 0.9,
        pricePerPieceEur: null,
      },
    ] as never);
  });

  it('sums every slot (per occurrence), merged into shopping-list lines', async () => {
    const result = await estimatePlanCostEur([
      day([{ name: 'Chicken Breast', quantity: 200, unit: 'g' }]), // 2 × €1.00
      day([{ name: 'chicken breast', quantity: 100, unit: 'g' }]), // 1 × €1.00
      day([{ name: 'Olive Oil', quantity: 100, unit: 'ml' }]), // 1 × €0.90
    ]);
    expect(result.totalEur).toBe(3.9);
    // Same lines the list shows: 300 g chicken breast + 100 ml olive oil.
    expect(result.pricedLines).toBe(2);
    expect(result.totalLines).toBe(2);
  });

  it('prices a portioned slot at its portion, like the list (P1-1)', async () => {
    const result = await estimatePlanCostEur([
      {
        meals: [
          {
            recipe: { ingredients: [{ name: 'chicken breast', quantity: 200, unit: 'g' }] },
            portion: 1.5,
          },
        ],
      },
    ]);
    expect(result.totalEur).toBe(3); // 300 g × €1.00 / 100 g
  });

  it('skips water and to-taste lines like the list does (F-SHOP-1-3)', async () => {
    const result = await estimatePlanCostEur([
      day([
        { name: 'chicken breast', quantity: 100, unit: 'g' },
        { name: 'Water', quantity: 3, unit: 'cups' },
        { name: 'Salt and pepper', quantity: 1, unit: 'to taste' },
      ]),
    ]);
    expect(result.totalLines).toBe(1);
    expect(result.totalEur).toBe(1.0);
  });

  it('counts unmatched ingredients as unpriced, not zero-cost failures', async () => {
    const result = await estimatePlanCostEur([
      day([
        { name: 'chicken breast', quantity: 100, unit: 'g' },
        { name: 'dragon fruit', quantity: 1, unit: 'piece' },
      ]),
    ]);
    expect(result.totalEur).toBe(1.0);
    expect(result.pricedLines).toBe(1);
    expect(result.totalLines).toBe(2);
  });

  it('returns null total when nothing could be priced', async () => {
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue([] as never);
    const result = await estimatePlanCostEur([day([{ name: 'mystery', quantity: 1, unit: 'g' }])]);
    expect(result.totalEur).toBeNull();
  });

  it('handles an empty plan without querying', async () => {
    const result = await estimatePlanCostEur([]);
    expect(result).toEqual({ totalEur: null, pricedLines: 0, totalLines: 0 });
    expect(prisma.ingredientPrice.findMany).not.toHaveBeenCalled();
  });
});
