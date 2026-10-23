import { describe, expect, it, vi } from 'vitest';
import type {
  IRecipeTranslationRepository,
  RecipeTranslation,
  TranslatableRecipe,
} from '@chefer/database';
import type { RecipeTranslationInput } from '../../lib/ai/types.js';
import {
  recipeSourceHash,
  RecipeTranslationService,
  sourceTextOf,
} from './recipe-translation.service.js';

// ADR 0004: curated recipes read in Romanian when a current translation exists,
// in English otherwise; the pipeline drafts translations and refuses bad ones.

const CURRY: TranslatableRecipe = {
  id: 'curated-1',
  name: 'Red Lentil Curry',
  description: 'A warming curry.',
  instructions: ['Rinse the lentils.', 'Simmer for 20 minutes.'],
  ingredients: [
    { name: 'Red lentils', quantity: 200, unit: 'g' },
    { name: 'Onion', quantity: 1, unit: 'piece' },
  ],
};

function translationOf(
  recipe: TranslatableRecipe,
  over: Partial<RecipeTranslation> = {},
): RecipeTranslation {
  return {
    id: `t-${recipe.id}`,
    recipeId: recipe.id,
    locale: 'ro',
    name: 'Curry de linte roșie',
    description: 'Un curry care te încălzește.',
    instructions: ['Clătește lintea.', 'Fierbe la foc mic 20 de minute.'],
    ingredientNames: ['Linte roșie', 'Ceapă'],
    status: 'MACHINE_DRAFT',
    source: 'ai:translateRecipe',
    sourceHash: recipeSourceHash(sourceTextOf(recipe)),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function makeRepo(
  recipes: TranslatableRecipe[],
  translations: RecipeTranslation[],
): { [K in keyof IRecipeTranslationRepository]: ReturnType<typeof vi.fn> } {
  return {
    findForRecipes: vi
      .fn()
      .mockImplementation(async (ids: readonly string[]) =>
        translations.filter((t) => ids.includes(t.recipeId)),
      ),
    findCuratedRecipes: vi
      .fn()
      .mockImplementation(async (ids?: readonly string[]) =>
        ids ? recipes.filter((r) => ids.includes(r.id)) : recipes,
      ),
    upsert: vi.fn().mockImplementation(async (data: object) => data),
    setStatus: vi.fn().mockImplementation(async (ids: readonly string[]) => ids.length),
    findByStatus: vi.fn().mockImplementation(async () => translations),
  };
}

const service = (
  repo: ReturnType<typeof makeRepo>,
  translate: (input: RecipeTranslationInput) => unknown = vi.fn(),
) =>
  new RecipeTranslationService(repo as unknown as IRecipeTranslationRepository, {
    translateRecipe: translate as never,
  });

const dto = () => ({
  id: CURRY.id,
  name: CURRY.name,
  description: CURRY.description,
  instructions: [...CURRY.instructions],
  ingredients: [
    { name: 'Red lentils', quantity: 200, unit: 'g' },
    { name: 'Onion', quantity: 1, unit: 'piece' },
  ],
  servings: 2,
});

describe('RecipeTranslationService.localize', () => {
  it('swaps the display text for a current translation, keeping everything else', async () => {
    const [recipe] = await service(makeRepo([CURRY], [translationOf(CURRY)])).localize(
      [dto()],
      'ro',
    );
    expect(recipe).toMatchObject({
      name: 'Curry de linte roșie',
      description: 'Un curry care te încălzește.',
      instructions: ['Clătește lintea.', 'Fierbe la foc mic 20 de minute.'],
      ingredients: [
        { name: 'Linte roșie', quantity: 200, unit: 'g' },
        { name: 'Ceapă', quantity: 1, unit: 'piece' },
      ],
      servings: 2,
    });
  });

  it('leaves English readers alone without a lookup', async () => {
    const repo = makeRepo([CURRY], [translationOf(CURRY)]);
    const [recipe] = await service(repo).localize([dto()], 'en');
    expect(recipe?.name).toBe('Red Lentil Curry');
    expect(repo.findForRecipes).not.toHaveBeenCalled();
  });

  it('falls back to English once the English recipe changed', async () => {
    const stale = translationOf(CURRY, { sourceHash: 'old' });
    const [recipe] = await service(makeRepo([CURRY], [stale])).localize([dto()], 'ro');
    expect(recipe?.name).toBe('Red Lentil Curry');
  });

  it('localizes summary shapes (no steps) by name and description only', async () => {
    const summary = { id: CURRY.id, name: CURRY.name, description: CURRY.description };
    const [recipe] = await service(makeRepo([CURRY], [translationOf(CURRY)])).localize(
      [summary],
      'ro',
    );
    expect(recipe).toEqual({
      id: CURRY.id,
      name: 'Curry de linte roșie',
      description: 'Un curry care te încălzește.',
    });
  });

  it('serves English when the lookup fails', async () => {
    const repo = makeRepo([CURRY], []);
    repo.findForRecipes.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [recipe] = await service(repo).localize([dto()], 'ro');
    expect(recipe?.name).toBe('Red Lentil Curry');
  });

  it('localizes every recipe in a week plan', async () => {
    const plan = {
      planId: 'p1',
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipe: dto() }] }],
    };
    const localized = await service(makeRepo([CURRY], [translationOf(CURRY)])).localizeWeekPlan(
      plan,
      'ro',
    );
    expect(localized?.planId).toBe('p1');
    expect(localized?.days[0]?.meals[0]?.recipe.name).toBe('Curry de linte roșie');
  });
});

describe('RecipeTranslationService.translatePending', () => {
  const draft = {
    name: 'Curry de linte roşie',
    description: 'Un curry.',
    instructions: ['Clăteşte lintea.', 'Fierbe.'],
    ingredientNames: ['Linte', 'Ceapă'],
  };

  it('drafts the missing translation, fixing cedilla diacritics', async () => {
    const repo = makeRepo([CURRY], []);
    const translate = vi.fn().mockResolvedValue(draft);
    const result = await service(repo, translate).translatePending({ locale: 'ro' });

    expect(translate).toHaveBeenCalledWith({ locale: 'ro', recipe: sourceTextOf(CURRY) });
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: CURRY.id,
        locale: 'ro',
        name: 'Curry de linte roșie',
        instructions: ['Clătește lintea.', 'Fierbe.'],
        sourceHash: recipeSourceHash(sourceTextOf(CURRY)),
        source: 'ai:translateRecipe',
      }),
    );
    expect(result).toEqual({ translated: [CURRY.id], current: 0, failed: [] });
  });

  it('skips recipes whose translation is current, unless forced', async () => {
    const repo = makeRepo([CURRY], [translationOf(CURRY)]);
    const translate = vi.fn().mockResolvedValue(draft);
    expect(await service(repo, translate).translatePending({ locale: 'ro' })).toEqual({
      translated: [],
      current: 1,
      failed: [],
    });
    await service(repo, translate).translatePending({ locale: 'ro', force: true });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('rejects a draft that dropped a step, and keeps going', async () => {
    const other: TranslatableRecipe = { ...CURRY, id: 'curated-2' };
    const repo = makeRepo([CURRY, other], []);
    const translate = vi
      .fn()
      .mockResolvedValueOnce({ ...draft, instructions: ['Totul deodată.'] })
      .mockResolvedValueOnce(draft);
    const result = await service(repo, translate).translatePending({ locale: 'ro' });

    expect(result.failed).toEqual([{ recipeId: CURRY.id, error: 'expected 2 steps, got 1' }]);
    expect(result.translated).toEqual(['curated-2']);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('dry run and limit only count', async () => {
    const repo = makeRepo([CURRY, { ...CURRY, id: 'curated-2' }], []);
    const translate = vi.fn();
    const result = await service(repo, translate).translatePending({
      locale: 'ro',
      dryRun: true,
      limit: 1,
    });
    expect(result.translated).toEqual([CURRY.id]);
    expect(translate).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('RecipeTranslationService.reviewSheet', () => {
  it('puts the English and the draft side by side', async () => {
    const sheet = await service(makeRepo([CURRY], [translationOf(CURRY)])).reviewSheet('ro');
    expect(sheet).toContain('## Curry de linte roșie — `curated-1`');
    expect(sheet).toContain(
      '| Step 2 | Simmer for 20 minutes. | Fierbe la foc mic 20 de minute. |',
    );
    expect(sheet).toContain('| Ingredient 2 | Onion | Ceapă |');
  });
});
