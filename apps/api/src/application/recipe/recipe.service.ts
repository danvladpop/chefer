import { TRPCError } from '@trpc/server';
import {
  favouriteRecipeRepository,
  followRepository,
  mealRatingRepository,
  recipeLineRepository,
  toIngredientsMirror,
  type CreateManualRecipeData,
  type IFavouriteRecipeRepository,
  type IMealRatingRepository,
  type Recipe,
} from '@chefer/database';
import type { SafetyChecks, TableSafety } from '@chefer/types';
import { rankForSlot, recipeMealTypeHint } from '@chefer/utils';
import type { RecipeData } from '../../lib/ai/types.js';
import {
  CURATED_POOL_BY_TYPE,
  ensureCuratedRecipes,
  safeCuratedPools,
} from '../../lib/curated-recipes/index.js';
import type { SafetyCheckable } from '../../lib/curated-recipes/safety.js';
import { moderationService, type ModerationService } from '../friends/moderation.service.js';
import { socialAccessService } from '../friends/social-access.service.js';
import {
  recipeNutritionService,
  type RecipeNutritionService,
  type SavedLineReport,
  type SaveLineInput,
  type TypedNutrition,
} from '../ingredients/recipe-nutrition.service.js';
import { safetyService, type SafetyService } from '../safety/safety.service.js';
import { selectDiscoverRecipes, type DiscoverFilters, type DiscoverRecipeDto } from './discover.js';
import {
  defaultRecipeSocialDeps,
  findRecipeVisibleTo,
  friendsEnabledFor,
  recipeAttribution,
  type RecipeAttribution,
  type RecipeSocialDeps,
} from './recipe-access.js';

/**
 * A manual save as the router passes it (plan-ingredient-catalog §6.2, §9):
 * catalog-aware lines, and typed nutrition the server only keeps under D4.
 */
export type ManualRecipeInput = Omit<CreateManualRecipeData, 'ingredients' | 'nutritionInfo'> & {
  ingredients: SaveLineInput[];
  nutritionInfo?: TypedNutrition | undefined;
};
type UpdateManualRecipeInput = Partial<ManualRecipeInput>;

/** A stored catalog line as `getMyRecipe` returns it (grams null = no data for it). */
export interface StoredLineDto {
  position: number;
  ingredientId: string | null;
  rawName: string;
  quantity: number;
  unit: string;
  grams: number | null;
  note: string | null;
  optional: boolean;
}

/** A saved manual recipe plus the per-line outcome (grams, problem). Additive. */
export type SavedRecipe = Recipe & { lines: SavedLineReport[] };

/** One `findAllRecipesForUser` row (the recipe + its creator/origin creator names). */
type RecipeWithPeople = Awaited<
  ReturnType<IFavouriteRecipeRepository['findAllRecipesForUser']>
>[number];

/**
 * The Following columns (plan §2.3). `recipe.list` rows never carry them raw:
 * they surface only as the optional `creator`/`origin` keys, so a row for a
 * user who never used Following has exactly the pre-Following key set (INV-8).
 */
type FollowingColumns = 'originRecipeId' | 'originCreatorId' | 'hiddenAt' | 'hiddenReason';

/** A `recipe.list` row: the recipe as before, plus the optional attribution keys. */
export type RecipeListRow = Omit<Recipe, FollowingColumns> &
  Pick<RecipeAttribution, 'creator' | 'origin'> & {
    isFavourite: boolean;
    safetyChecks?: SafetyChecks;
    /**
     * UX-PLAN-05: the meal type of a CURATED recipe, only when `list` was
     * asked for a `slotType` (additive; absent = unknown).
     */
    mealType?: MealTypeKey;
  };

type MealTypeKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

let curatedMealTypes: Map<string, MealTypeKey> | null = null;
/** Curated recipe id → its meal type (the pools are static, built once). */
function curatedMealTypeOf(id: string): MealTypeKey | undefined {
  if (!curatedMealTypes) {
    curatedMealTypes = new Map();
    for (const [type, pool] of Object.entries(CURATED_POOL_BY_TYPE)) {
      for (const recipe of pool) curatedMealTypes.set(recipe.id, type as MealTypeKey);
    }
  }
  return curatedMealTypes.get(id);
}

/** Rows scanned to find the best matches for a slot (the repo caps a read at 200). */
const SLOT_RANK_WINDOW = 200;

/** What `list` needs from Following. Injectable for tests. */
export interface RecipeListSocialDeps {
  isEnabled(userId: string): Promise<boolean>;
  /** Whether the user turned Following on (has a SocialProfile). */
  isActivated(userId: string): Promise<boolean>;
  /** Accepted followees whose profile shares recipes. */
  visibleCreatorIds(userId: string): Promise<string[]>;
}

const defaultListSocialDeps: RecipeListSocialDeps = {
  isEnabled: friendsEnabledFor,
  isActivated: async (userId) => (await socialAccessService.profile(userId)) !== null,
  visibleCreatorIds: (userId) => followRepository.acceptedFolloweeIdsSharingRecipes(userId),
};

/** Strips the raw relations/columns and adds the omitted-when-absent attribution keys. */
function toListRow(
  userId: string,
  row: RecipeWithPeople,
  friendsOn: boolean,
  isFavourite: boolean,
): Omit<RecipeListRow, 'safetyChecks'> {
  const {
    creator,
    originCreator,
    originRecipeId: _originRecipeId,
    originCreatorId: _originCreatorId,
    hiddenAt: _hiddenAt,
    hiddenReason: _hiddenReason,
    ...base
  } = row;
  const { creator: creatorDto, origin } = recipeAttribution(
    userId,
    row,
    { creator, originCreator },
    { friendsOn },
  );
  return {
    ...base,
    isFavourite,
    ...(creatorDto && { creator: creatorDto }),
    ...(origin && { origin }),
  };
}

/**
 * `SafetyService.check` assumes a full `SafetyCheckable` row (ingredients +
 * instructions) — a partial/summary shape (e.g. `DiscoverRecipeDto`, which
 * carries neither) makes `ingredients.map` throw. Every caller here must
 * pass the full shape (fixed below), but a read must never 500 just because
 * one row's decoration failed — omit `safetyChecks` for that row instead.
 */
function safeCheck(
  safety: SafetyService,
  data: SafetyCheckable,
  table: TableSafety,
): SafetyChecks | undefined {
  try {
    return safety.check(data, table);
  } catch (err) {
    console.error('[recipe] safetyChecks failed for a row — omitting it', err);
    return undefined;
  }
}

/** T-40.3 (D-19): an empty cuisine (the widened minimum omits it) is stored as "International". */
function normaliseCuisine<T extends { cuisineType?: string }>(data: T): T {
  if (data.cuisineType?.trim() === '') {
    return { ...data, cuisineType: 'International' };
  }
  return data;
}

export class RecipeService {
  constructor(
    private readonly ratingRepo: IMealRatingRepository = mealRatingRepository,
    private readonly safety: SafetyService = safetyService,
    private readonly moderation: Pick<ModerationService, 'checkRecipeText'> = moderationService,
    private readonly social: RecipeListSocialDeps = defaultListSocialDeps,
    /** The Following branch of recipe access (recipe-access.ts, plan §4.3). */
    private readonly recipeSocial: RecipeSocialDeps = defaultRecipeSocialDeps,
    private readonly nutrition: Pick<
      RecipeNutritionService,
      'prepareSave'
    > = recipeNutritionService,
  ) {}

  /** `findRecipeVisibleTo` with this service's social deps. */
  private findVisible(userId: string, recipeId: string): Promise<Recipe | null> {
    return findRecipeVisibleTo(userId, recipeId, undefined, this.recipeSocial);
  }

  /** NOT_FOUND unless the user may see the recipe — same answer for missing and private. */
  private async assertRecipeVisible(userId: string, recipeId: string): Promise<void> {
    if (!(await this.findVisible(userId, recipeId))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
  }

  /**
   * Following (plan §4.2, `recipe.list`): the creators whose hearted recipes
   * join Saved/All — people the viewer follows (accepted) who share recipes.
   * Only when Following is on for the viewer AND they turned it on
   * (SocialAccess rule 0); otherwise undefined = today's rows exactly.
   */
  private async listSocial(
    userId: string,
  ): Promise<{ friendsOn: boolean; visibleCreatorIds?: string[] }> {
    if (!(await this.social.isEnabled(userId))) return { friendsOn: false };
    if (!(await this.social.isActivated(userId))) return { friendsOn: true };
    const ids = await this.social.visibleCreatorIds(userId);
    return ids.length > 0 ? { friendsOn: true, visibleCreatorIds: ids } : { friendsOn: true };
  }

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
      /**
       * UX-PLAN-05: the meal slot the list is for. Re-orders so recipes that
       * fit it come first (the Lunch picker used to lead with breakfasts) and
       * tags curated rows with their `mealType`. Optional and additive.
       */
      slotType?: MealTypeKey | undefined;
    },
  ): Promise<RecipeListRow[]> {
    const { forTable, slotType, ...listOpts } = opts;
    const { friendsOn, visibleCreatorIds } = await this.listSocial(userId);
    // A slot ranks BEFORE the page is cut, so scan a wider window first.
    const wanted = listOpts.limit ?? 20;
    const [recipes, savedIds] = await Promise.all([
      favouriteRecipeRepository.findAllRecipesForUser(userId, {
        ...listOpts,
        ...(slotType && !listOpts.cursor && { limit: Math.max(wanted, SLOT_RANK_WINDOW) }),
        ...(visibleCreatorIds && { visibleCreatorIds }),
      }),
      favouriteRecipeRepository.findSavedRecipeIds(userId),
    ]);
    const saved = new Set(savedIds);
    const base = recipes.map((recipe) =>
      toListRow(userId, recipe, friendsOn, saved.has(recipe.id)),
    );
    const withFavourite = slotType
      ? rankForSlot(
          base.map((row) => {
            const known = curatedMealTypeOf(row.id);
            return known ? { ...row, mealType: known } : row;
          }),
          slotType,
          recipeMealTypeHint,
        )
      : base;
    // The ranked window is cut after the safety filter, below.
    const finish = (rows: RecipeListRow[]) => (slotType ? rows.slice(0, wanted) : rows);
    if (!forTable) return finish(withFavourite);

    // T-01.2/T-08.10: the Replace picker (and any other `forTable` list)
    // goes through the ONE SafetyService filter — reported recipes excluded,
    // dislikes hard, taxonomy-recognised legacy terms included.
    const ctx = await this.safety.loadContext(userId);
    const visible = this.safety.filter(withFavourite, ctx, { deriveFromIngredients: true });
    // T-02.1/T-02.4: picker rows get their Checked chip from the same
    // payload the plan surfaces use — only attached when the table has
    // rules (UX-02 AC1: no false "Checked" claim on a rule-less table).
    if (!ctx.table.hasRules) return finish(visible);
    // `visible` rows are full Prisma `Recipe` rows (findAllRecipesForUser
    // does a plain findMany, no narrowing `select`) — ingredients/
    // instructions/dietaryTags are all present, so this cast is safe.
    return finish(
      visible.map((r) => {
        const checks = safeCheck(this.safety, r as unknown as SafetyCheckable, ctx.table);
        return checks ? { ...r, safetyChecks: checks } : r;
      }),
    );
  }

  /**
   * T-02.5 (rev 2): the Replace picker's `Filtered for …` count + active
   * rule labels — mirrors `discoverHiddenCount` for `list({ forTable: true
   * })`'s search results (AC7). A separate query so an old client that only
   * calls `list` is unaffected.
   */
  async listHiddenCount(
    userId: string,
    opts: {
      search?: string | undefined;
      savedOnly?: boolean | undefined;
      myRecipesOnly?: boolean | undefined;
    },
  ): Promise<{ hiddenCount: number; filteredFor: string[] }> {
    const { visibleCreatorIds } = await this.listSocial(userId);
    const [ctx, recipes] = await Promise.all([
      this.safety.loadContext(userId),
      favouriteRecipeRepository.findAllRecipesForUser(userId, {
        ...opts,
        ...(visibleCreatorIds && { visibleCreatorIds }),
      }),
    ]);
    const visible = this.safety.filter(recipes, ctx, { deriveFromIngredients: true });
    const filteredFor = [...ctx.prefs.allergies, ...ctx.prefs.dietaryRestrictions];
    return { hiddenCount: recipes.length - visible.length, filteredFor };
  }

  /**
   * Creates a manual recipe. Nutrition is always computed on the server from
   * the lines (client numbers are kept only under D4, as USER_ENTERED); the
   * recipe, its catalog lines and the Json mirror are written in one
   * transaction.
   */
  async create(userId: string, data: ManualRecipeInput): Promise<SavedRecipe> {
    // PRD §9.4 word filter — applies only when the author shares recipes
    // (moderation.service decides; BAD_REQUEST + data.textRejected otherwise).
    await this.moderation.checkRecipeText(userId, {
      name: data.name,
      description: data.description,
    });
    // Origins are never taken from a create (only RecipeCopyService sets them).
    const { originRecipeId: _o, originCreatorId: _c, ingredients, nutritionInfo, ...own } = data;
    const prepared = await this.nutrition.prepareSave(
      userId,
      ingredients,
      data.servings,
      nutritionInfo,
    );
    const recipe = await favouriteRecipeRepository.createManualRecipe(
      userId,
      normaliseCuisine({
        ...own,
        ingredients: toIngredientsMirror(prepared.lines),
        nutritionInfo: prepared.nutrition.perServing,
      }),
      { lines: prepared.lines, nutrition: prepared.nutrition },
    );
    return { ...recipe, lines: prepared.report };
  }

  /** The edit form's recipe, plus its stored catalog lines (additive, plan §9). */
  async getMyRecipe(
    userId: string,
    recipeId: string,
  ): Promise<Recipe & { lines: StoredLineDto[] }> {
    const recipe = await favouriteRecipeRepository.findManualRecipeById(userId, recipeId);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    const lines = await recipeLineRepository.findByRecipeIds([recipe.id]);
    return {
      ...recipe,
      lines: lines.map((l) => ({
        position: l.position,
        ingredientId: l.ingredientId,
        rawName: l.rawName,
        quantity: l.quantity,
        unit: l.unit,
        grams: l.grams,
        note: l.note,
        optional: l.optional,
      })),
    };
  }

  /** Updates a manual recipe; a save with lines recomputes its nutrition (see create). */
  async update(
    userId: string,
    recipeId: string,
    data: UpdateManualRecipeInput,
  ): Promise<SavedRecipe> {
    const existing = await favouriteRecipeRepository.findManualRecipeById(userId, recipeId);
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Recipe not found or you do not have permission to edit it.',
      });
    }
    // PRD §9.4 word filter on the text as it will be after the edit; with the
    // recipe id, clean text lifts a FILTER hide (moderation.service). A copy
    // of someone else's recipe is never shared (PRD §13), so it isn't filtered.
    const isCopy = existing.originRecipeId != null || existing.originCreatorId != null;
    if (!isCopy) {
      await this.moderation.checkRecipeText(
        userId,
        {
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
        },
        recipeId,
      );
    }
    const { ingredients, nutritionInfo, ...rest } = data;
    if (!ingredients) {
      const recipe = await favouriteRecipeRepository.updateManualRecipe(
        userId,
        recipeId,
        normaliseCuisine(rest),
      );
      return { ...recipe, lines: [] };
    }
    const prepared = await this.nutrition.prepareSave(
      userId,
      ingredients,
      data.servings ?? existing.servings,
      nutritionInfo,
    );
    const recipe = await favouriteRecipeRepository.updateManualRecipe(
      userId,
      recipeId,
      normaliseCuisine(rest),
      { lines: prepared.lines, nutrition: prepared.nutrition },
    );
    return { ...recipe, lines: prepared.report };
  }

  async toggleFavourite(userId: string, recipeId: string): Promise<{ isSaved: boolean }> {
    const isSaved = await favouriteRecipeRepository.isSaved(userId, recipeId);
    if (isSaved) {
      await favouriteRecipeRepository.remove(userId, recipeId);
      return { isSaved: false };
    } else {
      await this.assertRecipeVisible(userId, recipeId);
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
  ): Promise<{ isSaved: boolean; useInNextPlan: boolean; canEdit: boolean }> {
    const [favourite, own] = await Promise.all([
      favouriteRecipeRepository.findFavourite(userId, recipeId),
      // Owner dogfood 2026-09-30: the recipe page offers Edit on the user's
      // own recipes — the same ownership rule `update` enforces.
      favouriteRecipeRepository.findManualRecipeById(userId, recipeId),
    ]);
    return {
      isSaved: favourite !== null,
      useInNextPlan: favourite?.useInNextPlan ?? false,
      canEdit: own !== null,
    };
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
    if (useInNextPlan) await this.assertRecipeVisible(userId, recipeId);
    await favouriteRecipeRepository.toggleUseInNextPlan(userId, recipeId, useInNextPlan);
    return { useInNextPlan };
  }

  async rate(
    userId: string,
    recipeId: string,
    rating: number,
    notes?: string,
  ): Promise<{ rating: number; notes: string | null }> {
    await this.assertRecipeVisible(userId, recipeId);
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
  async discover(
    userId: string,
    filters: DiscoverFilters,
  ): Promise<(DiscoverRecipeDto & { safetyChecks?: SafetyChecks })[]> {
    const [ctx, savedIds] = await Promise.all([
      this.safety.loadContext(userId),
      favouriteRecipeRepository.findSavedRecipeIds(userId),
      ensureCuratedRecipes(),
    ]);
    // UX-01 (T-01.2): dislikes are soft (a DislikeChip) in search/Discover —
    // only allergies and diet restrictions hard-exclude here; reported
    // recipes are still removed either way.
    const searchPrefs = { ...ctx.prefs, dislikedIngredients: [] };
    const pools = safeCuratedPools(searchPrefs);
    const results = selectDiscoverRecipes(pools, filters, new Set(savedIds));
    const visible = results.filter((r) => !ctx.hiddenRecipeIds.includes(r.id));
    // T-02.1: Discover rows get the same Checked chip as every other surface.
    if (!ctx.table.hasRules) return visible;
    // Bug fix: `DiscoverRecipeDto` is a SUMMARY shape — it carries neither
    // `ingredients` nor `instructions`, so casting a row straight into
    // `check()` crashed (`ingredients.map` on `undefined`) for any user with
    // a rule. `check()` needs the full `RecipeData` the pool itself already
    // has — look each row up there by id instead of casting the summary.
    const fullById = new Map<string, RecipeData>(
      Object.values(pools)
        .flat()
        .map((r) => [r.id, r]),
    );
    return visible.map((r) => {
      const full = fullById.get(r.id);
      const checks = full ? safeCheck(this.safety, full, ctx.table) : undefined;
      return checks ? { ...r, safetyChecks: checks } : r;
    });
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
    const recipe = await this.findVisible(userId, recipeId);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    const ctx = await this.safety.loadContext(userId);
    if (!ctx.table.hasRules) return { safetyChecks: null };
    const checks = safeCheck(this.safety, recipe as unknown as SafetyCheckable, ctx.table);
    if (!checks) return { safetyChecks: null };
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
