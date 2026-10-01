import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import { RecipeService } from './recipe.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const {
  findAllRecipesForUser,
  findSavedRecipeIds,
  findByUserId,
  findHouseholdByUserId,
  findRecipeIdsByUser,
  findRecipeById,
  isRecipeInUserPlans,
  upsertRecipes,
  findFavourite,
  findManualRecipeById,
  createManualRecipe,
  updateManualRecipe,
  isSaved,
  save,
} = vi.hoisted(() => ({
  findFavourite: vi.fn(),
  findManualRecipeById: vi.fn(),
  createManualRecipe: vi.fn(),
  updateManualRecipe: vi.fn(),
  isSaved: vi.fn(),
  save: vi.fn(),
  findAllRecipesForUser: vi.fn(),
  findSavedRecipeIds: vi.fn().mockResolvedValue([]),
  findByUserId: vi.fn().mockResolvedValue(null),
  findHouseholdByUserId: vi.fn().mockResolvedValue([]),
  // T-01.2: SafetyService.loadContext also reads reported-recipe ids.
  findRecipeIdsByUser: vi.fn().mockResolvedValue([]),
  // T-02.3: getSafetyChecks resolves the recipe via recipe-access's
  // findRecipeVisibleTo, which reads mealPlanRepository. T-02.5's
  // discoverHiddenCount calls ensureCuratedRecipes(), which upserts the
  // curated pool the first time it runs in this process.
  findRecipeById: vi.fn(),
  isRecipeInUserPlans: vi.fn().mockResolvedValue(false),
  upsertRecipes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    favouriteRecipeRepository: {
      findAllRecipesForUser,
      findSavedRecipeIds,
      findFavourite,
      findManualRecipeById,
      createManualRecipe,
      updateManualRecipe,
      isSaved,
      save,
    },
    dietaryPreferencesRepository: { findByUserId },
    householdMemberRepository: { findByUserId: findHouseholdByUserId },
    safetyReportRepository: { findRecipeIdsByUser, create: vi.fn(), findAllByUser: vi.fn() },
    mealPlanRepository: { findRecipeById, isRecipeInUserPlans, upsertRecipes },
  };
});

// `mockResolvedValueOnce` queues are per-mock, not per-test — a value pushed
// but never consumed (e.g. `list()` without `forTable` never calls
// `loadContext`) would otherwise leak into a LATER test and shift every
// queued value after it by one. Reset before each test so every
// `mockResolvedValueOnce` call is consumed by its own test only.
beforeEach(() => {
  findAllRecipesForUser.mockReset();
  findSavedRecipeIds.mockReset().mockResolvedValue([]);
  findByUserId.mockReset().mockResolvedValue(null);
  findHouseholdByUserId.mockReset().mockResolvedValue([]);
  findRecipeIdsByUser.mockReset().mockResolvedValue([]);
  findRecipeById.mockReset();
  findFavourite.mockReset().mockResolvedValue(null);
  findManualRecipeById.mockReset().mockResolvedValue(null);
  isRecipeInUserPlans.mockReset().mockResolvedValue(false);
  createManualRecipe
    .mockReset()
    .mockImplementation((_u: string, d: object) => ({ id: 'new', ...d }));
  updateManualRecipe.mockReset().mockImplementation((_u: string, id: string, d: object) => ({
    id,
    ...d,
  }));
  isSaved.mockReset().mockResolvedValue(false);
  save.mockReset().mockResolvedValue({});
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const recipe = (over: Partial<Recipe> & { id: string; name: string }): Recipe =>
  ({
    description: `${over.name} description`,
    ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
    instructions: ['Cook it'],
    nutritionInfo: { calories: 300, protein: 10, carbs: 20, fat: 10, fiber: 2 },
    cuisineType: 'international',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 10,
    servings: 1,
    imageUrl: null,
    imageStatus: 'DONE',
    imageRetries: 0,
    imagePriority: 100,
    source: 'AI',
    sourceUrl: null,
    creatorId: null,
    createdAt: new Date('2026-09-01'),
    ...over,
  }) as unknown as Recipe;

describe('RecipeService.list({ forTable }) — B-34/B-46, T-00.11', () => {
  it('keeps the unfiltered list when forTable is omitted (old clients)', async () => {
    findAllRecipesForUser.mockResolvedValue([recipe({ id: 'r-egg', name: 'Egg Fried Rice' })]);
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.list('u1', {});
    expect(rows).toHaveLength(1);
  });

  it('drops recipes unsafe for the user/household allergies when forTable is true', async () => {
    findAllRecipesForUser.mockResolvedValue([
      recipe({
        id: 'r-egg',
        name: 'Egg Fried Rice',
        ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
      }),
      recipe({
        id: 'r-safe',
        name: 'Veggie Fried Rice',
        ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
      }),
    ]);
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.list('u1', { forTable: true });
    expect(rows.map((r) => r.id)).toEqual(['r-safe']);
  });

  it('attaches safetyChecks to a visible row instead of throwing (bug fix, T-02.1)', async () => {
    findAllRecipesForUser.mockResolvedValue([
      recipe({
        id: 'r-safe',
        name: 'Veggie Fried Rice',
        ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
      }),
    ]);
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.list('u1', { forTable: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.safetyChecks?.checked).toEqual([{ label: 'Eggs', who: 'you' }]);
  });

  it('unions a household member allergy into the forTable filter', async () => {
    findAllRecipesForUser.mockResolvedValue([
      recipe({
        id: 'r-nut',
        name: 'Peanut Noodles',
        ingredients: [{ name: 'peanut', quantity: 1, unit: 'tbsp' }],
      }),
    ]);
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    findHouseholdByUserId.mockResolvedValueOnce([
      { name: 'Kid', portionFactor: 0.5, allergies: ['peanut'], dietaryRestrictions: [] },
    ]);
    const service = new RecipeService();
    const rows = await service.list('u1', { forTable: true });
    expect(rows).toHaveLength(0);
  });
});

describe('RecipeService.getSafetyChecks (T-02.3)', () => {
  it('returns null when the table has no rules at all', async () => {
    findRecipeById.mockResolvedValue(recipe({ id: 'r1', name: 'Egg Fried Rice' }));
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    expect(await service.getSafetyChecks('u1', 'r1')).toEqual({ safetyChecks: null });
  });

  it('names the checked rule the recipe passes', async () => {
    findRecipeById.mockResolvedValue(
      recipe({
        id: 'r1',
        name: 'Veggie Fried Rice',
        ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
        dietaryTags: ['vegetarian'],
      }),
    );
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: ['Vegetarian'],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.getSafetyChecks('u1', 'r1');
    expect(result.safetyChecks?.checked).toEqual([{ label: 'Vegetarian', who: 'you' }]);
    expect(result.safetyChecks?.conflicts).toEqual([]);
  });

  it('lists a conflict for a recipe that fails an allergy rule', async () => {
    findRecipeById.mockResolvedValue(
      recipe({
        id: 'r-egg',
        name: 'Egg Fried Rice',
        ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
      }),
    );
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.getSafetyChecks('u1', 'r-egg');
    expect(result.safetyChecks?.conflicts).toContain('Eggs');
  });

  it('throws NOT_FOUND for a recipe the user cannot see', async () => {
    findRecipeById.mockResolvedValue(null);
    const service = new RecipeService();
    await expect(service.getSafetyChecks('u1', 'missing')).rejects.toThrow('Recipe not found.');
  });
});

describe('RecipeService.discover (T-01.2/T-02.1) — bug fix: summary rows must never crash safetyChecks', () => {
  it('returns 200-worthy rows with safetyChecks when the table has an allergy, instead of throwing', async () => {
    // `discover` maps the curated pool through `selectDiscoverRecipes`,
    // whose `DiscoverRecipeDto` is a SUMMARY shape (no `ingredients`/
    // `instructions`) — the real regression: `safetyChecks` used to be
    // computed by casting that summary row straight into
    // `SafetyService.check`, whose `ingredients.map` then threw
    // (INTERNAL_SERVER_ERROR) for any signed-in user with a rule. This test
    // exercises the REAL curated pool end to end, so it produces the exact
    // summary-row shape that used to crash.
    findByUserId.mockResolvedValueOnce({
      allergies: ['Tree nuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.discover('u1', {});
    expect(rows.length).toBeGreaterThan(0);
    const withChecks = rows.filter((r) => r.safetyChecks !== undefined);
    expect(withChecks.length).toBeGreaterThan(0);
    expect(withChecks[0]?.safetyChecks?.checked.map((c) => c.label)).toContain('Tree nuts');
    // None of Discover's own results conflict — it already excludes them.
    expect(rows.every((r) => (r.safetyChecks?.conflicts ?? []).length === 0)).toBe(true);
  });
});

describe('RecipeService.discoverHiddenCount (T-02.5/T-01.4)', () => {
  it('reports no hidden recipes and no active filters when the table has no rules', async () => {
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.discoverHiddenCount('u1', {});
    expect(result).toEqual({ hiddenCount: 0, filteredFor: [] });
  });

  it('counts the curated recipes a tree-nut allergy hides and names the active filter (AC3)', async () => {
    findByUserId.mockResolvedValueOnce({
      allergies: ['Tree nuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.discoverHiddenCount('u1', {});
    expect(result.filteredFor).toEqual(['Tree nuts']);
    expect(result.hiddenCount).toBeGreaterThan(0);
  });
});

describe('RecipeService.getFavouriteState — canEdit (owner dogfood 2026-09-30)', () => {
  it("is true only for the user's own manual recipe", async () => {
    findManualRecipeById.mockResolvedValueOnce(
      recipe({ id: 'r1', name: 'Mine', source: 'MANUAL' }),
    );
    await expect(new RecipeService().getFavouriteState('u1', 'r1')).resolves.toEqual({
      isSaved: false,
      useInNextPlan: false,
      canEdit: true,
    });
    expect(findManualRecipeById).toHaveBeenCalledWith('u1', 'r1');
  });

  it("is false for anyone else's recipe, saved or not", async () => {
    findFavourite.mockResolvedValueOnce({ useInNextPlan: true });
    await expect(new RecipeService().getFavouriteState('u1', 'r2')).resolves.toEqual({
      isSaved: true,
      useInNextPlan: true,
      canEdit: false,
    });
  });
});

// ─── Following (L-XRECIPE, implementation-plan §4.2 "Existing procedures") ────

/**
 * The `recipe.list` row keys on master (before Following): every Recipe
 * column at the time + `isFavourite`. Old binaries in the field were built
 * against exactly this shape (INV-8) — a non-Following user's row must keep
 * it, with no new key at all (not even `null`).
 */
const MASTER_LIST_ROW_KEYS = [
  'cookTimeMins',
  'createdAt',
  'creatorId',
  'cuisineType',
  'description',
  'dietaryTags',
  'id',
  'imagePriority',
  'imageRetries',
  'imageStatus',
  'imageUrl',
  'ingredients',
  'instructions',
  'isFavourite',
  'name',
  'nutritionInfo',
  'prepTimeMins',
  'servings',
  'source',
  'sourceUrl',
].sort();

/** A repository row as `findAllRecipesForUser` returns it now (new columns + people). */
const repoRow = (
  over: Partial<Recipe> & { id: string; name: string },
  people: { creator?: object | null; originCreator?: object | null } = {},
) => ({
  ...recipe(over),
  originRecipeId: null,
  originCreatorId: null,
  hiddenAt: null,
  hiddenReason: null,
  creator: null,
  originCreator: null,
  ...over,
  ...people,
});

const MARIA = { id: 'maria', firstName: 'Maria', lastName: 'Pop', name: null };

const listSocial = (o: { enabled?: boolean; activated?: boolean; ids?: string[] } = {}) => ({
  isEnabled: vi.fn().mockResolvedValue(o.enabled ?? true),
  isActivated: vi.fn().mockResolvedValue(o.activated ?? true),
  visibleCreatorIds: vi.fn().mockResolvedValue(o.ids ?? []),
});

const moderation = () => ({ checkRecipeText: vi.fn().mockResolvedValue(undefined) });

describe('RecipeService.list — old clients keep their row shape (INV-8)', () => {
  it("a non-Following user's row has exactly master's key set", async () => {
    findAllRecipesForUser.mockResolvedValue([
      repoRow({ id: 'own', name: 'Mine', source: 'MANUAL', creatorId: 'u1' }),
      repoRow({ id: 'ai', name: 'AI dish' }),
      repoRow({ id: 'cur', name: 'Curated', source: 'CURATED' }),
    ]);
    const rows = await new RecipeService().list('u1', {});
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(MASTER_LIST_ROW_KEYS);
    // Not a single key is null-filled for the new features.
    expect(rows.some((r) => 'creator' in r || 'origin' in r || 'hiddenAt' in r)).toBe(false);
  });

  it('Following off (kill switch): no social lookup and the repo gets no visibleCreatorIds', async () => {
    findAllRecipesForUser.mockResolvedValue([]);
    const social = listSocial({ enabled: false, ids: ['maria'] });
    await new RecipeService(undefined, undefined, moderation(), social).list('u1', {
      savedOnly: true,
    });
    expect(social.isActivated).not.toHaveBeenCalled();
    expect(social.visibleCreatorIds).not.toHaveBeenCalled();
    expect(findAllRecipesForUser.mock.calls[0]![1]).not.toHaveProperty('visibleCreatorIds');
  });

  it('Following on but not turned on by the viewer: no visible creators', async () => {
    findAllRecipesForUser.mockResolvedValue([]);
    const social = listSocial({ activated: false, ids: ['maria'] });
    await new RecipeService(undefined, undefined, moderation(), social).list('u1', {});
    expect(social.visibleCreatorIds).not.toHaveBeenCalled();
    expect(findAllRecipesForUser.mock.calls[0]![1]).not.toHaveProperty('visibleCreatorIds');
  });
});

describe('RecipeService.list — Following rows', () => {
  it('passes the visible creators and attributes their recipes and your copies', async () => {
    findAllRecipesForUser.mockResolvedValue([
      repoRow(
        { id: 'theirs', name: 'Dal', source: 'MANUAL', creatorId: 'maria' },
        { creator: MARIA },
      ),
      repoRow(
        {
          id: 'copy',
          name: 'Dal',
          source: 'MANUAL',
          creatorId: 'u1',
          originRecipeId: 'theirs',
          originCreatorId: 'maria',
        },
        {
          creator: { id: 'u1', firstName: 'Ana', lastName: null, name: null },
          originCreator: MARIA,
        },
      ),
      repoRow({ id: 'own', name: 'Mine', source: 'MANUAL', creatorId: 'u1' }),
    ]);
    findSavedRecipeIds.mockResolvedValue(['theirs']);
    const social = listSocial({ ids: ['maria'] });
    const rows = await new RecipeService(undefined, undefined, moderation(), social).list('u1', {
      savedOnly: true,
    });

    expect(findAllRecipesForUser).toHaveBeenCalledWith('u1', {
      savedOnly: true,
      visibleCreatorIds: ['maria'],
    });
    const [theirs, copy, own] = rows;
    expect(theirs).toMatchObject({
      id: 'theirs',
      isFavourite: true,
      creator: { id: 'maria', displayName: 'Maria Pop', firstName: 'Maria' },
    });
    expect(theirs).not.toHaveProperty('origin');
    expect(copy).toMatchObject({ id: 'copy', origin: { creatorFirstName: 'Maria' } });
    expect(copy).not.toHaveProperty('creator');
    // Raw relations / Following columns never leak, even for Following users.
    for (const r of rows) {
      for (const k of ['originCreator', 'originRecipeId', 'originCreatorId', 'hiddenAt']) {
        expect(r).not.toHaveProperty(k);
      }
    }
    expect(Object.keys(own!).sort()).toEqual(MASTER_LIST_ROW_KEYS);
  });
});

describe('RecipeService word filter on writes (PRD §9.4, stub until L-MODERATION)', () => {
  const BODY = {
    name: 'Dal',
    description: 'Lentils',
    ingredients: [{ name: 'lentils', quantity: 200, unit: 'g' }],
    instructions: [],
    nutritionInfo: { calories: 400, protein: 20, carbs: 50, fat: 8, fiber: 9 },
    cuisineType: 'Indian',
    dietaryTags: [],
    prepTimeMins: 5,
    cookTimeMins: 30,
    servings: 2,
  };

  it('create checks the name + description first; a rejection writes nothing', async () => {
    const mod = moderation();
    await new RecipeService(undefined, undefined, mod).create('u1', BODY);
    expect(mod.checkRecipeText).toHaveBeenCalledWith('u1', { name: 'Dal', description: 'Lentils' });

    mod.checkRecipeText.mockRejectedValueOnce(new Error('textRejected'));
    createManualRecipe.mockClear();
    await expect(new RecipeService(undefined, undefined, mod).create('u1', BODY)).rejects.toThrow(
      'textRejected',
    );
    expect(createManualRecipe).not.toHaveBeenCalled();
  });

  it('create never takes origins from input (only RecipeCopyService sets them)', async () => {
    await new RecipeService(undefined, undefined, moderation()).create('u1', {
      ...BODY,
      originRecipeId: 'x',
      originCreatorId: 'y',
    });
    expect(createManualRecipe.mock.calls[0]![1]).not.toHaveProperty('originRecipeId');
    expect(createManualRecipe.mock.calls[0]![1]).not.toHaveProperty('originCreatorId');
  });

  it('update checks the text as it will be after the edit, with the recipe id', async () => {
    findManualRecipeById.mockResolvedValueOnce(
      recipe({ id: 'r1', name: 'Old name', description: 'Old desc', source: 'MANUAL' }),
    );
    const mod = moderation();
    await new RecipeService(undefined, undefined, mod).update('u1', 'r1', { name: 'New name' });
    expect(mod.checkRecipeText).toHaveBeenCalledWith(
      'u1',
      { name: 'New name', description: 'Old desc' },
      'r1',
    );
    expect(updateManualRecipe).toHaveBeenCalled();
  });

  it("update of your copy of someone's recipe skips the filter (copies are never shared)", async () => {
    findManualRecipeById.mockResolvedValueOnce({
      ...recipe({ id: 'c1', name: 'Dal', source: 'MANUAL', creatorId: 'u1' }),
      originRecipeId: 'theirs',
      originCreatorId: 'maria',
    });
    const mod = moderation();
    await new RecipeService(undefined, undefined, mod).update('u1', 'c1', { name: 'My dal' });
    expect(mod.checkRecipeText).not.toHaveBeenCalled();
    expect(updateManualRecipe).toHaveBeenCalled();
  });
});

describe("RecipeService hearting a followed creator's recipe (FR-17.2)", () => {
  const recipeSocial = (visible: boolean) => ({
    isEnabled: vi.fn().mockResolvedValue(true),
    recipesAccess: vi.fn().mockResolvedValue(visible ? 'visible' : 'locked'),
    hasHearted: vi.fn().mockResolvedValue(false),
  });

  it('toggleFavourite / rate succeed for a visible recipe of someone you follow', async () => {
    findRecipeById.mockResolvedValue(
      recipe({ id: 'theirs', name: 'Dal', source: 'MANUAL', creatorId: 'maria' }),
    );
    const service = new RecipeService(
      { upsert: vi.fn().mockResolvedValue({ rating: 5, notes: null }) } as never,
      undefined,
      moderation(),
      listSocial(),
      recipeSocial(true),
    );
    await expect(service.toggleFavourite('u1', 'theirs')).resolves.toEqual({ isSaved: true });
    expect(save).toHaveBeenCalledWith('u1', 'theirs');
    await expect(service.rate('u1', 'theirs', 5)).resolves.toEqual({ rating: 5, notes: null });
  });

  it('stays NOT_FOUND once access is gone (no heart on a locked recipe)', async () => {
    findRecipeById.mockResolvedValue(
      recipe({ id: 'theirs', name: 'Dal', source: 'MANUAL', creatorId: 'maria' }),
    );
    const service = new RecipeService(
      undefined,
      undefined,
      moderation(),
      listSocial(),
      recipeSocial(false),
    );
    await expect(service.toggleFavourite('u1', 'theirs')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(save).not.toHaveBeenCalled();
  });
  it('F3.1: an auto-hidden recipe can’t be newly hearted, or re-hearted after an unheart', async () => {
    findRecipeById.mockResolvedValue({
      ...recipe({ id: 'theirs', name: 'Dal', source: 'MANUAL', creatorId: 'maria' }),
      hiddenAt: new Date('2026-09-30T10:00:00Z'),
      hiddenReason: 'REPORTS',
    });
    // Visible creator, but the viewer never hearted it (hasHearted → false).
    const service = new RecipeService(
      undefined,
      undefined,
      moderation(),
      listSocial(),
      recipeSocial(true),
    );
    await expect(service.toggleFavourite('u1', 'theirs')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.rate('u1', 'theirs', 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.getSafetyChecks('u1', 'theirs')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(save).not.toHaveBeenCalled();
  });
});
