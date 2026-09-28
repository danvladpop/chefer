import { TRPCError } from '@trpc/server';
import {
  favouriteRecipeRepository,
  mealRatingRepository,
  type CreateManualRecipeData,
  type IMealRatingRepository,
  type Recipe,
} from '@chefer/database';
import type { SafetyChecks } from '@chefer/types';
import { ensureCuratedRecipes, safeCuratedPools } from '../../lib/curated-recipes/index.js';
import type { SafetyCheckable } from '../../lib/curated-recipes/safety.js';
import { safetyService, type SafetyService } from '../safety/safety.service.js';
import { selectDiscoverRecipes, type DiscoverFilters, type DiscoverRecipeDto } from './discover.js';
import { findRecipeVisibleTo } from './recipe-access.js';

type UpdateManualRecipeData = Partial<CreateManualRecipeData>;

/** T-40.3 (D-19): an empty cuisine (the widened minimum omits it) is stored as "International". */
function normaliseCuisine<T extends { cuisineType?: string }>(data: T): T {
  if (data.cuisineType?.trim() === '') {
    return { ...data, cuisineType: 'International' };
  }
  return data;
}

/** NOT_FOUND unless the user may see the recipe — same answer for missing and private. */
async function assertRecipeVisible(userId: string, recipeId: string): Promise<void> {
  if (!(await findRecipeVisibleTo(userId, recipeId))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
  }
}

export class RecipeService {
  constructor(
    private readonly ratingRepo: IMealRatingRepository = mealRatingRepository,
    private readonly safety: SafetyService = safetyService,
  ) {}

  async list(
    userId: string,
    opts: {
      search?: string | undefined;
      savedOnly?: boolean | undefined;
      myRecipesOnly?: boolean | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
      /**
       * B-34/B-46 (T-00.11): drop rows unsafe for the user's/household's
       * allergies and dietary restrictions — the meal-plan Replace picker
       * must never surface (or let the user pick) a recipe it can't eat.
       * Optional and off by default so older list callers are unaffected.
       */
      forTable?: boolean | undefined;
    },
  ): Promise<(Recipe & { isFavourite: boolean })[]> {
    const { forTable, ...listOpts } = opts;
    const [recipes, savedIds] = await Promise.all([
      favouriteRecipeRepository.findAllRecipesForUser(userId, listOpts),
      favouriteRecipeRepository.findSavedRecipeIds(userId),
    ]);
    const saved = new Set(savedIds);
    const withFavourite = recipes.map((recipe) => ({
      ...recipe,
      isFavourite: saved.has(recipe.id),
    }));
    if (!forTable) return withFavourite;

    // T-01.2/T-08.10: the Replace picker (and any other `forTable` list)
    // goes through the ONE SafetyService filter — reported recipes excluded,
    // dislikes hard, taxonomy-recognised legacy terms included.
    const ctx = await this.safety.loadContext(userId);
    return this.safety.filter(withFavourite, ctx);
  }

  async create(userId: string, data: CreateManualRecipeData): Promise<Recipe> {
    return favouriteRecipeRepository.createManualRecipe(userId, normaliseCuisine(data));
  }

  async getMyRecipe(userId: string, recipeId: string): Promise<Recipe> {
    const recipe = await favouriteRecipeRepository.findManualRecipeById(userId, recipeId);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    return recipe;
  }

  async update(userId: string, recipeId: string, data: UpdateManualRecipeData): Promise<Recipe> {
    const existing = await favouriteRecipeRepository.findManualRecipeById(userId, recipeId);
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Recipe not found or you do not have permission to edit it.',
      });
    }
    return favouriteRecipeRepository.updateManualRecipe(userId, recipeId, normaliseCuisine(data));
  }

  async toggleFavourite(userId: string, recipeId: string): Promise<{ isSaved: boolean }> {
    const isSaved = await favouriteRecipeRepository.isSaved(userId, recipeId);
    if (isSaved) {
      await favouriteRecipeRepository.remove(userId, recipeId);
      return { isSaved: false };
    } else {
      await assertRecipeVisible(userId, recipeId);
      await favouriteRecipeRepository.save(userId, recipeId);
      return { isSaved: true };
    }
  }

  async isSaved(userId: string, recipeId: string): Promise<boolean> {
    return favouriteRecipeRepository.isSaved(userId, recipeId);
  }

  /** Saved + pinned state in one lookup — backs the recipe page toggle. */
  async getFavouriteState(
    userId: string,
    recipeId: string,
  ): Promise<{ isSaved: boolean; useInNextPlan: boolean }> {
    const favourite = await favouriteRecipeRepository.findFavourite(userId, recipeId);
    return { isSaved: favourite !== null, useInNextPlan: favourite?.useInNextPlan ?? false };
  }

  async toggleUseInNextPlan(
    userId: string,
    recipeId: string,
    useInNextPlan: boolean,
  ): Promise<{ useInNextPlan: boolean }> {
    const isSaved = await favouriteRecipeRepository.isSaved(userId, recipeId);
    if (!isSaved) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Recipe must be saved before toggling use in next plan.',
      });
    }
    if (useInNextPlan) await assertRecipeVisible(userId, recipeId);
    await favouriteRecipeRepository.toggleUseInNextPlan(userId, recipeId, useInNextPlan);
    return { useInNextPlan };
  }

  async rate(
    userId: string,
    recipeId: string,
    rating: number,
    notes?: string,
  ): Promise<{ rating: number; notes: string | null }> {
    await assertRecipeVisible(userId, recipeId);
    const upsertData: { userId: string; recipeId: string; rating: number; notes?: string } = {
      userId,
      recipeId,
      rating,
    };
    if (notes !== undefined) upsertData.notes = notes;
    const result = await this.ratingRepo.upsert(upsertData);
    return { rating: result.rating, notes: result.notes };
  }

  async getMyRating(
    userId: string,
    recipeId: string,
  ): Promise<{ rating: number; notes: string | null } | null> {
    const result = await this.ratingRepo.findByUserAndRecipe(userId, recipeId);
    if (!result) return null;
    return { rating: result.rating, notes: result.notes };
  }

  /**
   * Cookbook → Discover (F-REC-1-4): the curated pool, filtered by the
   * user's and household's allergies and restrictions (safety is free), with
   * meal-type, search and time filters. Every tier; no AI. Rows are upserted
   * first so each result opens, saves and cooks like any other recipe.
   */
  async discover(userId: string, filters: DiscoverFilters): Promise<DiscoverRecipeDto[]> {
    const [ctx, savedIds] = await Promise.all([
      this.safety.loadContext(userId),
      favouriteRecipeRepository.findSavedRecipeIds(userId),
      ensureCuratedRecipes(),
    ]);
    // UX-01 (T-01.2): dislikes are soft (a DislikeChip) in search/Discover —
    // only allergies and diet restrictions hard-exclude here; reported
    // recipes are still removed either way.
    const searchPrefs = { ...ctx.prefs, dislikedIngredients: [] };
    const results = selectDiscoverRecipes(
      safeCuratedPools(searchPrefs),
      filters,
      new Set(savedIds),
    );
    return results.filter((r) => !ctx.hiddenRecipeIds.includes(r.id));
  }

  /**
   * T-02.3: the detail-surface Checked line (recipe page, cook mode). A
   * separate, additive query rather than a new field on `mealPlan.getRecipe`
   * (`application/meal-plan/**` is another lane's file this wave) — the
   * client fetches this alongside its existing recipe query. `null` when the
   * table has no rules at all (T-02.2/T-02.3 AC1: the Checked element only
   * ever renders when there is something to check).
   */
  async getSafetyChecks(
    userId: string,
    recipeId: string,
  ): Promise<{ safetyChecks: SafetyChecks | null }> {
    const recipe = await findRecipeVisibleTo(userId, recipeId);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    const ctx = await this.safety.loadContext(userId);
    if (!ctx.table.hasRules) return { safetyChecks: null };
    const checks = this.safety.check(recipe as unknown as SafetyCheckable, ctx.table);
    const nothingToShow =
      checks.checked.length === 0 && checks.unchecked.length === 0 && checks.conflicts.length === 0;
    if (nothingToShow) return { safetyChecks: null };
    return { safetyChecks: checks };
  }

  /**
   * T-02.5/T-01.4: the `FilteredForLine` count for Discover — how many
   * curated results the safety filter removed, and which rule labels are
   * active (allergies + diet; dislikes are soft here, T-01.2, so they never
   * count as "hidden"). A separate query from `discover` itself so an old
   * client that only calls `discover` keeps getting a plain array back.
   */
  async discoverHiddenCount(
    userId: string,
    filters: DiscoverFilters,
  ): Promise<{ hiddenCount: number; filteredFor: string[] }> {
    const [ctx] = await Promise.all([this.safety.loadContext(userId), ensureCuratedRecipes()]);
    const searchPrefs = { ...ctx.prefs, dislikedIngredients: [] };
    const unfiltered = selectDiscoverRecipes(safeCuratedPools(null), filters, new Set());
    const filtered = selectDiscoverRecipes(safeCuratedPools(searchPrefs), filters, new Set());
    const filteredIds = new Set(filtered.map((r) => r.id));
    const hiddenCount = unfiltered.filter(
      (r) => !filteredIds.has(r.id) || ctx.hiddenRecipeIds.includes(r.id),
    ).length;
    const filteredFor = [...ctx.prefs.allergies, ...ctx.prefs.dietaryRestrictions];
    return { hiddenCount, filteredFor };
  }
}

export const recipeService = new RecipeService();
