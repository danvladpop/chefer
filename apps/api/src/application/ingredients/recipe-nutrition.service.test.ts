import { describe, expect, it, vi } from 'vitest';
import type { IRecipeLineRepository, RecipeForRecompute } from '@chefer/database';
import { catalogRow, fakeCatalog } from '../../test-support/fake-catalog.js';
import { RecipeNutritionService } from './recipe-nutrition.service.js';

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  prisma: {},
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
  };
  return { service: new RecipeNutritionService(catalog, lines), writeLines, lines };
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
