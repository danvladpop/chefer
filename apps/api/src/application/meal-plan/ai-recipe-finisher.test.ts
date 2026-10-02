import { describe, expect, it, vi } from 'vitest';
import type { DayPlan, MealType, RecipeData } from '../../lib/ai/types.js';
import { AiRecipeFinisher, type FinishContext } from './ai-recipe-finisher.js';

vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  prisma: {},
}));

// plan-ingredient-catalog §6.3, over the committed catalog.json: compute →
// one repair round → regenerate once → curated fallback → drop; then fit.

function recipe(id: string, lines: RecipeData['ingredients']): RecipeData {
  return {
    id,
    name: id,
    description: '',
    ingredients: lines,
    instructions: ['Cook.'],
    nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    cuisineType: 'x',
    dietaryTags: [],
    prepTimeMins: 5,
    cookTimeMins: 5,
    servings: 1,
    imageUrl: null,
  };
}
const GOOD = (id: string) =>
  recipe(id, [
    { name: 'Rice', quantity: 100, unit: 'g', slug: 'rice-white-dry' },
    { name: 'Chicken', quantity: 150, unit: 'g', slug: 'chicken-breast-raw' },
  ]);
const BROKEN = (id: string) =>
  recipe(id, [
    { name: 'Rice', quantity: 100, unit: 'g', slug: 'rice-white-dry' },
    { name: 'Moon dust', quantity: 20, unit: 'g', slug: 'moon-dust' },
  ]);
const CURATED = {
  ...GOOD('curated-fallback'),
  nutritionInfo: { calories: 1, protein: 0, carbs: 0, fat: 0, fiber: 0 },
};

function day(types: MealType[], recipes: RecipeData[]): DayPlan {
  return { dayOfWeek: 0, meals: types.map((type, i) => ({ type, recipe: recipes[i]! })) };
}

function setup(ai: {
  repair?: (ids: string[]) => { id: string; slug: string; quantity: number; unit: string }[];
  swap?: () => RecipeData;
}) {
  const repairRecipeLines = vi.fn((req: { lines: { id: string }[] }) =>
    ai.repair
      ? Promise.resolve(ai.repair(req.lines.map((l) => l.id)))
      : Promise.reject(new Error('down')),
  );
  const generateRecipeSwap = vi.fn(() =>
    ai.swap ? Promise.resolve(ai.swap()) : Promise.reject(new Error('down')),
  );
  const resolver = {
    resolveMany: vi.fn((inputs: readonly unknown[]) =>
      Promise.resolve(
        inputs.map(() => ({
          rawName: 'x',
          unit: 'g',
          note: null,
          confidence: 'NONE' as const,
          match: null,
          matchedKey: null,
          candidates: [],
        })),
      ),
    ),
  };
  const writeLines = vi.fn(() => Promise.resolve());
  const findGlobalIdsBySlugs = vi.fn((slugs: string[]) =>
    Promise.resolve(new Map(slugs.map((s) => [s, `id-${s}`]))),
  );
  const finisher = new AiRecipeFinisher(
    { repairRecipeLines, generateRecipeSwap },
    resolver,
    { findGlobalIdsBySlugs },
    { writeLines },
  );
  const ctx: FinishContext = {
    catalogSlugs: 'GRAIN_CEREAL: rice-white-dry',
    dayTarget: () => 2000,
    swapInput: (mealType, originalRecipeName) => ({
      userId: 'u',
      mealType,
      originalRecipeName,
      preferences: { dietaryRestrictions: [], allergies: [], cuisinePreferences: [] },
    }),
    fallback: () => CURATED,
  };
  return { finisher, ctx, repairRecipeLines, generateRecipeSwap, writeLines, findGlobalIdsBySlugs };
}

describe('AiRecipeFinisher.finishPlan', () => {
  it('computes every AI recipe and fits it to its slot share; no AI call when all lines resolve', async () => {
    const { finisher, ctx, repairRecipeLines } = setup({});
    const { plan, stats } = await finisher.finishPlan(
      { days: [day(['lunch', 'dinner'], [GOOD('a'), GOOD('b')])] },
      ctx,
    );
    expect(repairRecipeLines).not.toHaveBeenCalled();
    const [lunch, dinner] = plan.days[0]!.meals.map((m) => m.recipe.nutritionInfo.calories);
    // lunch target 2000×0.325/0.7 ≈ 929, dinner ≈ 1071. Scaled quantities are
    // rounded to what a cook measures (5 g steps), so allow a little past ±10%.
    expect(Math.abs(lunch! - 929) / 929).toBeLessThan(0.15);
    expect(Math.abs(dinner! - 1071) / 1071).toBeLessThan(0.15);
    expect(stats).toMatchObject({ recipes: 2, resolvedFirstPass: 4, fitted: 2 });
  });

  it('repairs problem lines in ONE AI call', async () => {
    const OILY = (id: string) =>
      recipe(id, [
        { name: 'Rice', quantity: 100, unit: 'g', slug: 'rice-white-dry' },
        { name: 'Golden drizzle oil', quantity: 10, unit: 'g', slug: 'gold-oil' },
      ]);
    const { finisher, ctx, repairRecipeLines } = setup({
      repair: (ids) => ids.map((id) => ({ id, slug: 'olive-oil', quantity: 10, unit: 'g' })),
    });
    const { plan, stats } = await finisher.finishPlan(
      { days: [day(['lunch', 'dinner'], [OILY('a'), OILY('b')])] },
      ctx,
    );
    expect(repairRecipeLines).toHaveBeenCalledTimes(1);
    expect(plan.days[0]!.meals[0]!.recipe.ingredients[1]?.slug).toBe('olive-oil');
    expect(stats.repairedLines).toBe(2);
  });

  it('refuses a look-alike food from the repair round (repair guard) and regenerates instead', async () => {
    const { finisher, ctx } = setup({
      repair: (ids) => ids.map((id) => ({ id, slug: 'olive-oil', quantity: 20, unit: 'g' })),
      swap: () => GOOD('regenerated'),
    });
    const { plan, stats } = await finisher.finishPlan(
      { days: [day(['dinner'], [BROKEN('a')])] },
      ctx,
    );
    expect(stats.repairedLines).toBe(0);
    expect(plan.days[0]!.meals[0]!.recipe.id).toBe('regenerated');
  });

  it('regenerates a recipe the repair could not fix, then falls back to curated, then drops', async () => {
    const regen = setup({ repair: () => [], swap: () => GOOD('regenerated') });
    const r1 = await regen.finisher.finishPlan(
      { days: [day(['dinner'], [BROKEN('a')])] },
      regen.ctx,
    );
    expect(r1.plan.days[0]!.meals[0]!.recipe.id).toBe('regenerated');
    expect(r1.stats.regenerated).toBe(1);

    const fallback = setup({ repair: () => [], swap: () => BROKEN('still-broken') });
    const r2 = await fallback.finisher.finishPlan(
      { days: [day(['dinner'], [BROKEN('a')])] },
      fallback.ctx,
    );
    expect(r2.plan.days[0]!.meals[0]!.recipe.id).toBe('curated-fallback');
    // curated recipes pass through untouched (never re-fitted)
    expect(r2.plan.days[0]!.meals[0]!.recipe.nutritionInfo.calories).toBe(1);

    const drop = setup({});
    const r3 = await drop.finisher.finishPlan(
      { days: [day(['lunch', 'dinner'], [GOOD('a'), BROKEN('b')])] },
      { ...drop.ctx, fallback: () => null },
    );
    expect(r3.plan.days[0]!.meals.map((m) => m.recipe.id)).toEqual(['a']);
    expect(r3.stats.dropped).toBe(1);
  });

  it('without time for more AI calls (tailoring deadline) it goes straight to the fallback', async () => {
    const { finisher, ctx, repairRecipeLines, generateRecipeSwap } = setup({});
    const { plan } = await finisher.finishPlan(
      { days: [day(['dinner'], [BROKEN('a')])] },
      { ...ctx, canCallAi: () => false },
    );
    expect(repairRecipeLines).not.toHaveBeenCalled();
    expect(generateRecipeSwap).not.toHaveBeenCalled();
    expect(plan.days[0]!.meals[0]!.recipe.id).toBe('curated-fallback');
  });

  it('leaves curated slots alone', async () => {
    const { finisher, ctx } = setup({});
    const { plan, stats } = await finisher.finishPlan({ days: [day(['dinner'], [CURATED])] }, ctx);
    expect(plan.days[0]!.meals[0]!.recipe).toBe(CURATED);
    expect(stats.recipes).toBe(0);
  });
});

describe('AiRecipeFinisher.finishRecipe (swap)', () => {
  it('returns a computed recipe sized like its target, or null when nothing computes', async () => {
    const ok = setup({});
    const fitted = await ok.finisher.finishRecipe(GOOD('s'), 'dinner', 800, ok.ctx);
    expect(Math.abs(fitted!.nutritionInfo.calories - 800) / 800).toBeLessThan(0.1);
    const none = setup({ repair: () => [], swap: () => BROKEN('again') });
    expect(await none.finisher.finishRecipe(BROKEN('s'), 'dinner', 800, none.ctx)).toBeNull();
  });
});

describe('AiRecipeFinisher.persistLines', () => {
  it('writes COMPUTED catalog lines for AI recipes, linked to global rows; skips curated', async () => {
    const { finisher, writeLines } = setup({});
    await finisher.persistLines([GOOD('ai-1'), CURATED]);
    expect(writeLines).toHaveBeenCalledTimes(1);
    const [id, lines, nutrition] = writeLines.mock.calls[0] as unknown as [
      string,
      { ingredientId: string }[],
      { status: string },
    ];
    expect(id).toBe('ai-1');
    expect(lines.map((l) => l.ingredientId)).toEqual([
      'id-rice-white-dry',
      'id-chicken-breast-raw',
    ]);
    expect(nutrition.status).toBe('COMPUTED');
  });

  it('skips a recipe whose rows are not in this database (catalog not synced)', async () => {
    const { finisher, writeLines, findGlobalIdsBySlugs } = setup({});
    findGlobalIdsBySlugs.mockResolvedValueOnce(new Map());
    await finisher.persistLines([GOOD('ai-1')]);
    expect(writeLines).not.toHaveBeenCalled();
  });
});
