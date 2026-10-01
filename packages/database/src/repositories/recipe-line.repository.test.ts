import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RecipeLineRepository,
  toIngredientsMirror,
  toLineRows,
  toNutritionColumns,
  type RecipeLineWrite,
  type RecipeNutritionWrite,
} from './recipe-line.repository';

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../client', () => ({ prisma: { $transaction: transaction } }));

const LINES: RecipeLineWrite[] = [
  {
    ingredientId: 'ing-chicken',
    rawName: 'Chicken breast',
    quantity: 200,
    unit: 'g',
    grams: 200,
    mirrorName: 'Chicken breast, raw',
  },
  {
    ingredientId: 'ing-garlic',
    rawName: 'garlic',
    quantity: 2,
    unit: 'clove',
    grams: 6,
    note: 'minced',
  },
  { ingredientId: null, rawName: 'mystery spice', quantity: 1, unit: 'pinch', grams: null },
  {
    ingredientId: 'ing-parsley',
    rawName: 'parsley',
    quantity: 5,
    unit: 'g',
    grams: 5,
    optional: true,
  },
];

const FACTS = { calories: 260, protein: 46.2, carbs: 1.4, fat: 5.4, fiber: 0.3 };
const COMPUTED: RecipeNutritionWrite = {
  status: 'COMPUTED',
  perServing: FACTS,
  total: { ...FACTS, calories: 520 },
};

/** A transaction client that records each call (name + argument) in order. */
function fakeTx() {
  const calls: { op: string; arg: unknown }[] = [];
  const record = (op: string, result: unknown) => (arg: unknown) => {
    calls.push({ op, arg });
    return Promise.resolve(result);
  };
  const tx = {
    recipeIngredient: {
      deleteMany: record('deleteMany', { count: 3 }),
      createMany: record('createMany', { count: LINES.length }),
    },
    recipe: { update: record('update', {}) },
  };
  return { tx, calls, ops: () => calls.map((c) => c.op) };
}

describe('recipe line mirror + rows', () => {
  it('mirrors lines in order as {name, quantity, unit}, preferring mirrorName', () => {
    expect(toIngredientsMirror(LINES)).toEqual([
      { name: 'Chicken breast, raw', quantity: 200, unit: 'g' },
      { name: 'garlic', quantity: 2, unit: 'clove' },
      { name: 'mystery spice', quantity: 1, unit: 'pinch' },
      { name: 'parsley', quantity: 5, unit: 'g' },
    ]);
  });

  it('mirrors the unit the author typed when given (mirrorUnit)', () => {
    expect(
      toIngredientsMirror([
        {
          ingredientId: 'g',
          rawName: 'Garlic',
          quantity: 3,
          unit: 'clove',
          grams: 9,
          mirrorUnit: 'cloves, minced',
        },
      ]),
    ).toEqual([{ name: 'Garlic', quantity: 3, unit: 'cloves, minced' }]);
  });

  it('numbers positions by index and defaults note/optional', () => {
    const rows = toLineRows('r1', LINES);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(rows[0]).toEqual({
      recipeId: 'r1',
      position: 0,
      ingredientId: 'ing-chicken',
      rawName: 'Chicken breast',
      quantity: 200,
      unit: 'g',
      grams: 200,
      note: null,
      optional: false,
    });
    expect(rows[1]?.note).toBe('minced');
    expect(rows[2]).toMatchObject({ ingredientId: null, grams: null });
    expect(rows[3]?.optional).toBe(true);
  });

  it('sets nutrition, totals, status and computation time together', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(toNutritionColumns(LINES, COMPUTED, now)).toEqual({
      ingredients: toIngredientsMirror(LINES),
      nutritionInfo: FACTS,
      nutritionTotal: { ...FACTS, calories: 520 },
      nutritionStatus: 'COMPUTED',
      nutritionComputedAt: now,
    });
  });

  it('USER_ENTERED keeps the typed numbers with no totals and no computation time', () => {
    const cols = toNutritionColumns(
      LINES,
      { status: 'USER_ENTERED', perServing: FACTS, total: null },
      new Date(),
    );
    expect(cols.nutritionTotal).toBe(Prisma.DbNull);
    expect(cols.nutritionComputedAt).toBeNull();
    expect(cols.nutritionStatus).toBe('USER_ENTERED');
  });
});

describe('RecipeLineRepository.writeLines', () => {
  const repo = new RecipeLineRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces lines then rewrites mirror + nutrition, inside one transaction', async () => {
    const { tx, calls, ops } = fakeTx();
    transaction.mockImplementation(((fn: (t: typeof tx) => unknown) =>
      Promise.resolve(fn(tx))) as never);

    await repo.writeLines('r1', LINES, COMPUTED);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(ops()).toEqual(['deleteMany', 'createMany', 'update']);
    expect(calls[0]?.arg).toEqual({ where: { recipeId: 'r1' } });
    expect(calls[1]?.arg).toEqual({ data: toLineRows('r1', LINES) });
    expect(calls[2]?.arg).toEqual({
      where: { id: 'r1' },
      data: expect.objectContaining({
        ingredients: toIngredientsMirror(LINES),
        nutritionInfo: FACTS,
        nutritionStatus: 'COMPUTED',
      }) as unknown,
    });
  });

  it("joins the caller's transaction instead of opening one", async () => {
    const { tx, ops } = fakeTx();
    await repo.writeLines('r1', LINES, COMPUTED, tx as never);
    expect(transaction).not.toHaveBeenCalled();
    expect(ops()).toEqual(['deleteMany', 'createMany', 'update']);
  });

  it('an empty recipe clears its lines and mirror without a createMany', async () => {
    const { tx, calls, ops } = fakeTx();
    await repo.writeLines(
      'r1',
      [],
      {
        status: 'COMPUTED',
        perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        total: null,
      },
      tx as never,
    );
    expect(ops()).toEqual(['deleteMany', 'update']);
    expect(calls[1]?.arg).toMatchObject({ data: { ingredients: [] } });
  });
});
