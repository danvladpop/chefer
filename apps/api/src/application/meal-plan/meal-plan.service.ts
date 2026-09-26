import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  AiCallType,
  chefProfileRepository,
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  householdMemberRepository,
  MealPlanOrigin,
  mealPlanRepository,
  mealRatingRepository,
  prisma,
  type FavouriteRecipeWithRecipe,
  type IHouseholdMemberRepository,
  type IMealPlanRepository,
  type Recipe,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import type {
  Ingredient,
  MealType,
  NutritionInfo,
  RecipeData,
  WeekPlanResponse,
} from '../../lib/ai/index.js';
import {
  ensureCuratedRecipes,
  findSafetyIssues,
  MIN_SAFE_POOL_SIZE,
  pickRandomCurated,
  safeCuratedPools,
  type SafetyPrefs,
} from '../../lib/curated-recipes/index.js';
import { normalizeIngredientName } from '../../lib/ingredient-prices/index.js';
import type { MacroVocabularyRow } from '../../lib/recipe-import/macro-check.js';
import { recipeImageWorker } from '../../workers/recipe-image.worker.js';
import { computeHouseholdContext, mergeHouseholdSafety } from '../household/household.service.js';
import { pairLeftovers } from '../pantry/leftovers.js';
import { computeUsedPantryItemsForUser, getUseFirstIngredients } from '../pantry/pantry-context.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { findRecipeVisibleTo, isRecipeOpenTo } from '../recipe/recipe-access.js';
import { estimatePlanCostEur, type PlanCostEstimate } from '../shared/plan-cost.js';
import { daysFrom, firstShoppingDay } from '../shared/plan-window.js';
import { planCuratedWeek } from './curated-planner.js';
import { reconcileRecipeMacros } from './macro-reconcile.js';
import { withServerRecipeIds } from './recipe-ids.js';

// ─── Summary DTO ──────────────────────────────────────────────────────────────

export interface MealPlanSummaryDto {
  id: string;
  weekStartDate: Date;
  weekEndDate: Date;
  status: string;
  createdAt: Date;
  recipePreview: string[]; // up to 3 recipe names
  macroSummary: {
    avgKcal: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
  };
}

// ─── Output DTOs ──────────────────────────────────────────────────────────────

export interface RecipeDto {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  nutritionInfo: NutritionInfo;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
  imageStatus: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  /**
   * The viewer's allergies and dietary restrictions (household union) this
   * recipe conflicts with. Present only when non-empty; additive, so older
   * clients ignore it (audit F-REC-2-3, F-PLAN-1-7).
   */
  allergenWarnings?: string[];
}

export interface MealSlotDto {
  type: MealType;
  recipe: RecipeDto;
  /** F3 leftovers: source-day name when this slot is "Leftovers from X". */
  leftoverOf?: string;
}

export interface DayPlanDto {
  dayOfWeek: number;
  meals: MealSlotDto[];
}

export const MAX_WEEK_TEMPLATES = 4;

export interface TemplateSummaryDto {
  id: string;
  name: string;
  isFollowed: boolean;
  createdAt: Date;
  mealsCount: number;
  previewNames: string[];
}

export interface WeekPlanDto {
  planId: string;
  weekStartDate: Date;
  days: DayPlanDto[];
  /**
   * True on the response that materialized this week's plan as a copy of the
   * user's previous plan (plans continue week to week until changed) — lets
   * clients hint "continued from last week". Later reads return it as a
   * normal plan without the flag.
   */
  carriedOver?: boolean;
  /**
   * The daily calorie target the plan was (or should have been) built
   * against — same resolver as the dashboard ring, so the planner can badge
   * days that land off target (trust fix P-1/P-2 in docs/ux-fixes-plan.md).
   */
  calorieTarget?: number;
  /**
   * Estimated week cost from the ingredient price vocabulary (P2-4) —
   * the priced-shopping-list wedge, surfaced on the plan itself. Covers the
   * days from `shoppingFromDay` on, like the shopping list.
   */
  estimatedCost?: PlanCostEstimate;
  /**
   * First day (0 = Monday) the list and cost cover, when the plan was made
   * mid-week (audit F-PM-3). Absent = the whole week.
   */
  shoppingFromDay?: number;
  /**
   * What the generation learned from (P1-1) — present only on the response of
   * a premium generate, so the UI can show "built from N dishes you rated".
   */
  personalisation?: {
    pinnedDishNames: string[];
    likedCount: number;
    dislikedCount: number;
    /** F3: pantry items the generated week actually uses (use-first order). */
    usedPantryItems: string[];
  };
}

// ─── Week helper ──────────────────────────────────────────────────────────────

function getMondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** 0=Monday … 6=Sunday for today (matches dayOfWeek in plans). */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun … 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Image generation priority for a plan day: distance in days from today
 * (0 = today's meals generate first). Next week's days sort after this week's.
 */
export function dayImagePriority(dayOfWeek: number, weekOffset: number): number {
  if (weekOffset <= 0) {
    return (dayOfWeek - getTodayDayIndex() + 7) % 7;
  }
  return weekOffset * 7 + dayOfWeek;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MealPlanService {
  constructor(
    private readonly repo: IMealPlanRepository,
    private readonly householdRepo: IHouseholdMemberRepository = householdMemberRepository,
  ) {}

  /**
   * Generates a fresh 7-day meal plan for the user, persists it, and returns
   * the assembled DTO. Only the plan for the targeted week is archived —
   * plans for other weeks are left untouched.
   *
   * Premium users get an AI-personalised plan; free users get a random
   * selection from the curated generic recipe pool, filtered by their
   * allergies/restrictions/dislikes (no AI calls, preset stock images).
   *
   * @param weekOffset 0 = current week, 1 = next week, etc.
   */
  async generate(
    userId: string,
    weekOffset = 0,
    premium = false,
    options: {
      leftovers?: boolean;
      /** The caller already reserved (and logged) this generation's quota. */
      usageReserved?: boolean;
      /** WEEKLY_AUTO when the Sunday worker generates (drives the Monday banner). */
      origin?: MealPlanOrigin;
    } = {},
  ): Promise<WeekPlanDto> {
    if (!premium) {
      return this.generateCurated(userId, weekOffset);
    }
    // 1. Load user preferences + learning signals (P1-1: pinned favourites
    // and recent ratings feed the generation) + household members (F2).
    const [chefProfile, dietaryPrefs, pinnedCandidates, ratingSignals, householdMembers] =
      await Promise.all([
        chefProfileRepository.findByUserId(userId),
        dietaryPreferencesRepository.findByUserId(userId),
        favouriteRecipeRepository.findPinnedForNextPlan(userId),
        mealRatingRepository.findSignalsForUser(userId),
        this.householdRepo.findByUserId(userId),
      ]);

    // No profile yet (the goal and metrics steps are optional) is not a dead
    // end: generate against default targets, and the dashboard keeps nudging
    // the user to complete their profile (audit F-PM-2).

    // A pin must be a recipe the user may see — never another user's private
    // recipe favourited by id (recipe-access.ts).
    const pinnedFavourites = await this.visiblePins(userId, pinnedCandidates);

    const likedDishes = ratingSignals
      .filter((s) => s.rating >= 4)
      .map((s) => `${s.recipeName} (${s.cuisineType})`);
    const dislikedDishes = ratingSignals.filter((s) => s.rating <= 2).map((s) => s.recipeName);

    // 2. Build the AI input from stored preferences. Targets come from the
    // shared resolver so the generated plan always matches what the dashboard
    // ring and tracker display.
    const liveTargets = resolveDailyTargets(chefProfile ?? null);
    const liveCalorieTarget = liveTargets.dailyCalorieTarget;

    // Household context (F2): the seam field carries servings (portionSum)
    // and soft dislike notes; the HARD safety union is ALSO merged into the
    // top-level allergies/restrictions so every prompt line and downstream
    // check sees the whole table's constraints.
    const ownerSafety: SafetyPrefs = {
      allergies: dietaryPrefs?.allergies ?? [],
      dietaryRestrictions: dietaryPrefs?.dietaryRestrictions ?? [],
      dislikedIngredients: dietaryPrefs?.dislikedIngredients ?? [],
    };
    const householdContext = computeHouseholdContext(householdMembers, ownerSafety);

    // ── F3 pantry seam (wired at wave-2 integration) ─────────────────────────
    // Use-first items steer the prompt (soft constraint); an empty array
    // keeps the prompt byte-identical — the section builder no-ops on empty.
    const useFirstIngredients = await getUseFirstIngredients(userId);

    const aiInput = {
      userId,
      goal: chefProfile?.goal ?? 'MAINTAIN',
      biologicalSex: chefProfile?.biologicalSex ?? 'MALE',
      age: chefProfile?.age ?? 30,
      heightCm: chefProfile?.heightCm ?? 175,
      weightKg: chefProfile?.weightKg ?? 75,
      activityLevel: chefProfile?.activityLevel ?? 'MODERATELY_ACTIVE',
      dailyCalorieTarget: liveCalorieTarget,
      // Macro targets were never sent (audit F-PLAN-1-2): plans hit kcal while
      // fat ran +50–100% over and protein −25%.
      macroTargets: {
        proteinG: liveTargets.proteinG,
        carbsG: liveTargets.carbsG,
        fatG: liveTargets.fatG,
      },
      dietaryRestrictions: householdContext
        ? householdContext.mergedSafety.dietaryRestrictions
        : ownerSafety.dietaryRestrictions,
      allergies: householdContext ? householdContext.mergedSafety.allergies : ownerSafety.allergies,
      dislikedIngredients: ownerSafety.dislikedIngredients,
      cuisinePreferences: dietaryPrefs?.cuisinePreferences ?? [],
      mealsPerDay: dietaryPrefs?.mealsPerDay ?? 3,
      servingSize: dietaryPrefs?.servingSize ?? 1,
      pinnedDishNames: pinnedFavourites.map((f) => f.recipe.name),
      likedDishes,
      dislikedDishes,
      ...(chefProfile?.weeklyBudgetEur != null && {
        weeklyBudgetEur: chefProfile.weeklyBudgetEur,
      }),
      ...(householdContext && { householdContext }),
      ...(useFirstIngredients.length > 0 && { useFirstIngredients }),
      ...(options.leftovers && { leftoversMode: true }),
    };

    // 3. Call AI service
    let weekPlan;
    try {
      weekPlan = await aiService.generateMealPlan(aiInput);
    } catch (err) {
      console.error('AI generateMealPlan failed:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: aiFailureMessage(err, 'Failed to generate meal plan. Please try again.'),
      });
    }

    // 3a. Honest numbers first (audit F-REC-2-4): AI recipes whose stated
    // calories drift from their ingredients get resized and restated
    // (macro-reconcile.ts), so the day totals below are real.
    weekPlan = await this.reconcilePlanMacros(weekPlan);

    // 3a. Server-side day-total validation (trust P-1): the prompt demands
    // ±5% but models routinely return days 25-45% under target — and, with
    // kcal on target, fat +50–100% over (F-PLAN-1-2), so macros count too.
    // One corrective retry with the failed numbers in the prompt; keep
    // whichever attempt is closer. The retry is intentionally NOT logged to
    // aiCallLog — quota counts user actions, and the user asked once.
    const firstScore = planOffTargetScore(weekPlan, liveTargets);
    if (firstScore > 0) {
      try {
        const retryPlan = await this.reconcilePlanMacros(
          await aiService.generateMealPlan({
            ...aiInput,
            calorieCorrection: {
              target: liveCalorieTarget,
              previousDayTotals: planDayKcalTotals(weekPlan),
              previousDayMacros: planDayMacroTotals(weekPlan),
            },
          }),
        );
        if (planOffTargetScore(retryPlan, liveTargets) < firstScore) {
          weekPlan = retryPlan;
        }
      } catch (err) {
        console.error('Calorie-correction retry failed; keeping first plan:', err);
      }
    }

    // 3a'. Server-minted recipe ids — never store under the LLM's name slug,
    // which could collide with another user's row (see recipe-ids.ts).
    weekPlan = withServerRecipeIds(weekPlan);

    // 3a''. AI output is never trusted for safety (audit F-PLAN-1-9): every
    // generated dish is re-checked against the household's allergies and
    // restrictions, and a failing slot is replaced from the safe curated
    // pool (or dropped when nothing safe fits).
    const planSafety: SafetyPrefs = {
      ...ownerSafety,
      ...householdContext?.mergedSafety,
    };
    const safetyPass = await this.enforcePlanSafety(weekPlan, planSafety);
    weekPlan = safetyPass.plan;

    // Log AI call (fire-and-forget — never crash the server if logging fails)
    // The router's quota reservation already logged it; the weekly worker
    // path hasn't.
    if (!options.usageReserved) {
      prisma.aiCallLog
        .create({ data: { userId, callType: AiCallType.MEAL_PLAN } })
        .catch((err) => console.error('[aiCallLog] Failed to log MEAL_PLAN call:', err));
    }

    // 3b. Place pinned favourites into the plan verbatim (P1-1). Done as a
    // post-processing step, not via the prompt: the user pinned a SPECIFIC
    // saved recipe, and only slot replacement guarantees that exact recipe
    // (id, image and all) appears — an LLM asked to "include dish X" invents
    // a fresh variant.
    const pinnedIds = new Set(pinnedFavourites.map((f) => f.recipe.id));
    let placedPinNames: string[] = [];
    if (pinnedFavourites.length > 0) {
      placedPinNames = await this.placePinnedRecipes(userId, weekPlan, pinnedFavourites);
    }

    // 3c. F3 leftovers ("cook once, eat twice"): deterministic post-processing
    // pairs dinners with next-day lunches (doubled servings, `leftoverOf`
    // labels). Runs AFTER pin placement so pins land in fresh slots first.
    if (options.leftovers) {
      weekPlan = pairLeftovers(weekPlan);
    }

    // 4. Collect unique recipes and their image priority (min day-distance
    //    across the slots each recipe appears in — today's meals first)
    const recipeMap = new Map<string, RecipeData>();
    const priorityMap = new Map<string, number>();
    for (const day of weekPlan.days) {
      const dayPriority = dayImagePriority(day.dayOfWeek, weekOffset);
      for (const slot of day.meals) {
        recipeMap.set(slot.recipe.id, slot.recipe);
        const prev = priorityMap.get(slot.recipe.id);
        priorityMap.set(slot.recipe.id, Math.min(prev ?? 100, dayPriority));
      }
    }
    const recipes = Array.from(recipeMap.values());

    // 5. Reuse images for dishes we've generated before. LLM recipe IDs are
    //    fresh every run, but names are stable — a name match with a DONE image
    //    means the (deterministic, name-seeded) image already exists.
    const knownImages = await this.repo.findRecipeImagesByNames(recipes.map((r) => r.name));
    const resolvedImage = (r: RecipeData): { imageUrl: string | null; done: boolean } => {
      if (r.imageUrl) return { imageUrl: r.imageUrl, done: true };
      const reused = knownImages.get(r.name.toLowerCase());
      return reused ? { imageUrl: reused, done: true } : { imageUrl: null, done: false };
    };

    // 6. Persist recipes (upsert so reruns are idempotent). Pinned favourites
    // already exist as rows — and must NOT be re-upserted: that would stamp
    // this user's creatorId (and AI source) onto shared curated rows.
    await this.repo.upsertRecipes(
      recipes
        // Curated safety replacements already exist as shared rows too.
        .filter((r) => !pinnedIds.has(r.id) && !safetyPass.curatedIds.has(r.id))
        .map((r) => {
          const img = resolvedImage(r);
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredients: r.ingredients,
            instructions: r.instructions,
            nutritionInfo: r.nutritionInfo,
            cuisineType: r.cuisineType,
            dietaryTags: r.dietaryTags,
            prepTimeMins: r.prepTimeMins,
            cookTimeMins: r.cookTimeMins,
            servings: r.servings,
            imageUrl: img.imageUrl,
            imageStatus: img.done ? ('DONE' as const) : ('PENDING' as const),
            imagePriority: priorityMap.get(r.id) ?? 100,
            creatorId: userId,
          };
        }),
    );

    // 7. Persist the meal plan (archives only the plan for the same week)
    const weekStartDate = getMondayOfWeek(weekOffset);
    const shopFrom = firstShoppingDay(weekStartDate, new Date());
    const plan = await this.repo.createPlan({
      userId,
      weekStartDate,
      days: weekPlan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => ({
          type: m.type,
          recipeId: m.recipe.id,
          ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
        })),
      })),
      recipeIds: recipes.map((r) => r.id),
      origin: options.origin,
    });

    // 8. Start image generation immediately — don't wait for the worker's poll
    recipeImageWorker.wake();

    // 8b. A pin means "next plan", not "every plan forever" — reset the flags
    // now that the plan they were pinned for exists.
    if (pinnedFavourites.length > 0) {
      await favouriteRecipeRepository.clearNextPlanFlags(userId);
    }

    // 9. Assemble the DTO
    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      calorieTarget: liveCalorieTarget,
      days: weekPlan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => {
          const img = resolvedImage(m.recipe);
          return {
            type: m.type,
            recipe: toRecipeDto(m.recipe, {
              imageUrl: img.imageUrl,
              imageStatus: img.done ? 'DONE' : 'PENDING',
            }),
            ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
          };
        }),
      })),
      estimatedCost: await estimatePlanCostEur(daysFrom(weekPlan.days, shopFrom)),
      ...(shopFrom > 0 && { shoppingFromDay: shopFrom }),
      personalisation: {
        pinnedDishNames: placedPinNames,
        likedCount: likedDishes.length,
        dislikedCount: dislikedDishes.length,
        // F3: which pantry items the week actually cooks from — feeds the
        // "uses N things you already have" banner + plan_used_pantry event.
        usedPantryItems: await computeUsedPantryItemsForUser(userId, weekPlan.days),
      },
    };
  }

  /** Drops pinned favourites the user may no longer see (recipe-access.ts). */
  private async visiblePins(
    userId: string,
    pins: FavouriteRecipeWithRecipe[],
  ): Promise<FavouriteRecipeWithRecipe[]> {
    const visible = await Promise.all(
      pins.map(
        async (f) =>
          isRecipeOpenTo(f.recipe, userId) ||
          (await this.repo.isRecipeInUserPlans(userId, f.recipe.id)),
      ),
    );
    return pins.filter((_, i) => visible[i]);
  }

  /**
   * Replaces plan slots with the user's pinned favourite recipes (P1-1).
   * Meal types are inferred from where each recipe last appeared in the
   * user's recent plans (falling back to dinner); pins of the same type are
   * spread across the week rather than stacked on consecutive days.
   */
  private async placePinnedRecipes(
    userId: string,
    weekPlan: { days: { dayOfWeek: number; meals: { type: string; recipe: RecipeData }[] }[] },
    pinnedFavourites: FavouriteRecipeWithRecipe[],
  ): Promise<string[]> {
    // recipeId → meal type from the most recent plan that contains it.
    const typeByRecipe = new Map<string, string>();
    const recentPlans = await this.repo.findAllByUserId(userId, 10);
    for (const plan of recentPlans) {
      for (const day of plan.days) {
        for (const slot of day.meals as { type: string; recipeId: string }[]) {
          if (!typeByRecipe.has(slot.recipeId)) typeByRecipe.set(slot.recipeId, slot.type);
        }
      }
    }

    // Spread pins across the week (Mon, Thu, Sat, Tue, Fri, Sun, Wed).
    const DAY_SPREAD = [0, 3, 5, 1, 4, 6, 2];
    const taken = new Set<string>();
    const placed: string[] = [];

    for (const favourite of pinnedFavourites) {
      const recipe = favourite.recipe;
      const mealType = typeByRecipe.get(recipe.id) ?? 'dinner';

      for (const dayOfWeek of DAY_SPREAD) {
        if (taken.has(`${dayOfWeek}:${mealType}`)) continue;
        const day = weekPlan.days.find((d) => d.dayOfWeek === dayOfWeek);
        const slot = day?.meals.find((m) => m.type === mealType);
        if (!slot) continue;
        slot.recipe = rowToRecipeData(recipe);
        taken.add(`${dayOfWeek}:${mealType}`);
        placed.push(recipe.name);
        break;
      }
    }
    return placed;
  }

  /**
   * FREE-tier plan generation: a random selection from the curated generic
   * recipe pool, filtered by the user's allergies, dietary restrictions and
   * dislikes (P1-2 — safety is free; only personalisation depth is premium).
   * No AI calls; images are preset stock photos (instantly DONE).
   */
  private async generateCurated(userId: string, weekOffset = 0): Promise<WeekPlanDto> {
    await ensureCuratedRecipes();

    // F2: household members' allergies/restrictions are unioned with the
    // owner's — safety is never premium, so the filter applies on the free
    // tier too whenever members exist (e.g. created before a downgrade).
    const safety = await this.loadMergedSafety(userId);
    const pools = safeCuratedPools(safety);

    const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

    // Pool exhaustion is an upgrade moment, not an error: the free pool can't
    // cover this combination of restrictions, but AI generation can.
    const exhausted = MEAL_TYPES.filter((type) => pools[type].length < MIN_SAFE_POOL_SIZE);
    if (exhausted.length > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          "We don't have enough free recipes matching your restrictions — upgrade for AI-generated plans that always fit your needs.",
      });
    }

    // Each day picks toward the user's calorie and protein targets, adding
    // snacks when three meals fall short (curated-planner.ts, audit
    // F-PLAN-1-3 / F-PM-4). Variety rule unchanged: no repeat until a pool
    // is used up.
    const profile = await chefProfileRepository.findByUserId(userId);
    const targets = resolveDailyTargets(profile ?? null);
    const days = planCuratedWeek(pools, {
      calories: targets.dailyCalorieTarget,
      proteinG: targets.proteinG,
      goal: profile?.goal ?? null,
    });

    const uniqueRecipeIds = [...new Set(days.flatMap((d) => d.meals.map((m) => m.recipe.id)))];
    const weekStartDate = getMondayOfWeek(weekOffset);
    const curatedShopFrom = firstShoppingDay(weekStartDate, new Date());
    const plan = await this.repo.createPlan({
      userId,
      weekStartDate,
      days: days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => ({ type: m.type, recipeId: m.recipe.id })),
      })),
      recipeIds: uniqueRecipeIds,
    });

    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      calorieTarget: await this.loadCalorieTarget(userId),
      days: days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => ({
          type: m.type,
          recipe: toRecipeDto(m.recipe, { imageUrl: m.recipe.imageUrl, imageStatus: 'DONE' }),
        })),
      })),
      estimatedCost: await estimatePlanCostEur(daysFrom(days, curatedShopFrom)),
      ...(curatedShopFrom > 0 && { shoppingFromDay: curatedShopFrom }),
    };
  }

  /**
   * The user's SafetyPrefs with every household member's allergies and
   * dietary restrictions unioned in (F2 — reused by the free curated path,
   * curated swaps and AI swaps; premium generation merges via
   * computeHouseholdContext). Filtering itself stays `filterSafeRecipes`,
   * unchanged.
   */
  /**
   * Resizes and restates AI recipes whose stated calories drift from their
   * ingredients (audit F-REC-2-4, macro-reconcile.ts). Curated recipes are
   * hand-checked and left alone. One vocabulary query per plan.
   */
  private async reconcilePlanMacros<T extends { days: { meals: { recipe: RecipeData }[] }[] }>(
    weekPlan: T,
  ): Promise<T> {
    const aiRecipes = weekPlan.days
      .flatMap((d) => d.meals.map((m) => m.recipe))
      .filter((r) => !r.id.startsWith('curated-'));
    if (aiRecipes.length === 0) return weekPlan;
    const rows = await loadMacroVocabulary(aiRecipes);
    const reconciled = new Map<RecipeData, RecipeData>();
    let scaled = 0;
    for (const recipe of aiRecipes) {
      const result = reconcileRecipeMacros(recipe, rows);
      if (result.action === 'scaled') scaled += 1;
      reconciled.set(recipe, result.recipe);
    }
    if (scaled > 0) console.info(`[meal-plan] reconciled macros of ${scaled} AI recipe(s)`);
    return {
      ...weekPlan,
      days: weekPlan.days.map((d) => ({
        ...d,
        meals: d.meals.map((m) => ({ ...m, recipe: reconciled.get(m.recipe) ?? m.recipe })),
      })),
    };
  }

  /**
   * Replaces generated dishes that conflict with the hard safety prefs
   * (allergies, dietary restrictions) with safe curated recipes of the same
   * meal type. A slot with no safe replacement is dropped rather than served.
   */
  private async enforcePlanSafety(
    plan: WeekPlanResponse,
    safety: SafetyPrefs,
  ): Promise<{ plan: WeekPlanResponse; curatedIds: Set<string> }> {
    const curatedIds = new Set<string>();
    if (safety.allergies.length === 0 && safety.dietaryRestrictions.length === 0) {
      return { plan, curatedIds };
    }
    let replaced = 0;
    let dropped = 0;
    const days = plan.days.map((day) => ({
      ...day,
      meals: day.meals.flatMap((slot) => {
        if (findSafetyIssues(slot.recipe, safety).length === 0) return [slot];
        const safe = pickRandomCurated(slot.type, undefined, safety);
        if (!safe) {
          dropped++;
          return [];
        }
        replaced++;
        curatedIds.add(safe.id);
        // A replacement is a different dish: drop any leftovers label.
        return [{ type: slot.type, recipe: safe }];
      }),
    }));
    if (replaced + dropped > 0) {
      console.warn(
        `[meal-plan] safety pass replaced ${replaced} and dropped ${dropped} unsafe AI slot(s)`,
      );
      if (replaced > 0) await ensureCuratedRecipes();
    }
    return { plan: { ...plan, days }, curatedIds };
  }

  private async loadMergedSafety(userId: string): Promise<SafetyPrefs> {
    const [dietaryPrefs, members] = await Promise.all([
      dietaryPreferencesRepository.findByUserId(userId),
      this.householdRepo.findByUserId(userId),
    ]);
    return mergeHouseholdSafety(
      {
        allergies: dietaryPrefs?.allergies ?? [],
        dietaryRestrictions: dietaryPrefs?.dietaryRestrictions ?? [],
        dislikedIngredients: dietaryPrefs?.dislikedIngredients ?? [],
      },
      members,
    );
  }

  /**
   * The user's live daily calorie target — same resolver the dashboard ring
   * and premium generation use, so every surface shows one number (P-1/P-3).
   */
  private async loadCalorieTarget(userId: string): Promise<number> {
    const chefProfile = await chefProfileRepository.findByUserId(userId);
    return resolveDailyTargets(chefProfile ?? null).dailyCalorieTarget;
  }

  /**
   * Joins a plan's day JSON against its recipe rows and assembles the
   * WeekPlanDto. The one implementation behind getActive / getForWeek /
   * getById — this logic used to be copy-pasted three times, which is where
   * single-copy bug fixes went to die (roadmap P0-7).
   */
  private async assemblePlanDto(
    plan: {
      id: string;
      weekStartDate: Date;
      createdAt?: Date;
      days: { dayOfWeek: number; meals: unknown }[];
    },
    userId?: string,
  ): Promise<WeekPlanDto> {
    type MealSlotJson = { type: string; recipeId: string; leftoverOf?: string };
    const allMeals = plan.days.flatMap((d) => d.meals as MealSlotJson[]);
    const uniqueIds = [...new Set(allMeals.map((m) => m.recipeId))];
    const [recipeRows, safety] = await Promise.all([
      this.repo.findRecipesByIds(uniqueIds),
      userId ? this.loadMergedSafety(userId) : Promise.resolve(null),
    ]);
    const recipeMap = new Map<string, Recipe>(recipeRows.map((r) => [r.id, r]));

    const days: DayPlanDto[] = plan.days.map((d) => {
      const meals = (d.meals as MealSlotJson[]).map((m) => {
        const row = recipeMap.get(m.recipeId);
        if (!row) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Recipe ${m.recipeId} not found in database.`,
          });
        }
        return {
          type: m.type as MealType,
          recipe: withAllergenWarnings(rowToRecipeDto(row), row, safety),
          ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
        };
      });
      return { dayOfWeek: d.dayOfWeek, meals };
    });

    const shopFrom = firstShoppingDay(plan.weekStartDate, plan.createdAt);
    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      days,
      estimatedCost: await estimatePlanCostEur(daysFrom(days, shopFrom)),
      ...(shopFrom > 0 && { shoppingFromDay: shopFrom }),
      ...(userId && { calorieTarget: await this.loadCalorieTarget(userId) }),
    };
  }

  /**
   * Returns the active meal plan for the user with all recipes joined,
   * or null if no active plan exists.
   */
  async getActive(userId: string): Promise<WeekPlanDto | null> {
    const plan = await this.repo.findActiveWithDays(userId);
    if (!plan) return null;
    return this.assemblePlanDto(plan, userId);
  }

  /**
   * Returns the meal plan for a given week offset (0 = current, -1 = last week, 1 = next week).
   * Returns null if no plan exists for that week.
   */
  async getForWeek(userId: string, weekOffset: number): Promise<WeekPlanDto | null> {
    const monday = getMondayOfWeek(weekOffset);
    let plan = await this.repo.findByWeekStart(userId, monday);

    // For offset 0, fall back to the active plan
    if (!plan && weekOffset === 0) {
      plan = await this.repo.findActiveWithDays(userId);
    }

    // Carry-forward: a week without a plan continues the user's most recent
    // one (current and future weeks only — the past stays as it was). The
    // copy is a real plan row so shopping list / tracker / swaps all work on
    // it, and editing it never touches the source week. Deliberate write-on-
    // read: "the plan continues by default" must hold on every surface that
    // reads the week, without each client opting in.
    if (!plan && weekOffset >= 0) {
      // A followed template ("My weeks") wins over the most recent plan.
      const followed = await this.repo.findFollowedTemplate(userId);
      const source = followed ?? (await this.repo.findLatestWithDaysBefore(userId, monday));
      if (source?.days.some((d) => (d.meals as unknown[]).length > 0)) {
        await this.repo.createPlan({
          userId,
          weekStartDate: monday,
          days: source.days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            meals: d.meals as { type: string; recipeId: string }[],
          })),
          recipeIds: [],
          // Marked so the Sunday worker can still replace an untouched copy
          // with a fresh week (audit F-PLAN-4-2); a followed template is a
          // choice and stays.
          origin: followed ? MealPlanOrigin.TEMPLATE : MealPlanOrigin.CARRY_FORWARD,
        });
        const created = await this.repo.findByWeekStart(userId, monday);
        if (created) {
          return { ...(await this.assemblePlanDto(created, userId)), carriedOver: true };
        }
      }
    }

    if (!plan) return null;
    return this.assemblePlanDto(plan, userId);
  }

  /**
   * Returns a single recipe by ID, if the user may see it (recipe-access.ts):
   * open recipes work without a meal plan; another user's private recipe is
   * NOT_FOUND.
   */
  async getRecipe(userId: string, recipeId: string): Promise<RecipeDto> {
    const row = await findRecipeVisibleTo(userId, recipeId, this.repo);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    return withAllergenWarnings(rowToRecipeDto(row), row, await this.loadMergedSafety(userId));
  }

  /**
   * Swaps a single meal slot. Premium users get an AI-generated alternative;
   * free users get a random curated recipe of the same meal type.
   */
  async swapRecipe(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    _reason?: string,
    premium = false,
  ): Promise<RecipeDto> {
    // Verify the plan belongs to this user (look up by ID so it works for any week)
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }

    if (!premium) {
      return this.swapCurated(userId, planId, dayOfWeek, mealType, plan);
    }

    // Load dietary preferences for the swap prompt. Safety is the household
    // union (F2) — a swapped-in dish must be safe for everyone at the table.
    const [, dietaryPrefs, mergedSafety] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      dietaryPreferencesRepository.findByUserId(userId),
      this.loadMergedSafety(userId),
    ]);

    // Find the current recipe name in the plan day
    type MealSlotJson = { type: string; recipeId: string };
    const day = plan.days.find((d: { dayOfWeek: number }) => d.dayOfWeek === dayOfWeek);
    const slot = day ? (day.meals as MealSlotJson[]).find((m) => m.type === mealType) : undefined;
    const currentRecipe = slot ? await this.repo.findRecipeById(slot.recipeId) : null;

    // Call AI swap
    let newRecipe: RecipeData;
    try {
      newRecipe = await aiService.generateRecipeSwap({
        userId,
        mealType: mealType as MealType,
        originalRecipeName: currentRecipe?.name ?? mealType,
        preferences: {
          dietaryRestrictions: mergedSafety.dietaryRestrictions,
          allergies: mergedSafety.allergies,
          cuisinePreferences: dietaryPrefs?.cuisinePreferences ?? [],
        },
      });
    } catch (err) {
      console.error('AI generateRecipeSwap failed:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: aiFailureMessage(err, 'Failed to swap recipe. Please try again.'),
      });
    }

    // Server-minted id, as for generated weeks (recipe-ids.ts).
    newRecipe = { ...newRecipe, id: randomUUID() };
    newRecipe = reconcileRecipeMacros(newRecipe, await loadMacroVocabulary([newRecipe])).recipe;

    // Usage is logged by the caller's quota reservation (reserveAiSwap).

    // Never trust the AI on safety (F-PLAN-1-9): an unsafe swap falls back
    // to a safe curated recipe instead.
    if (findSafetyIssues(newRecipe, mergedSafety).length > 0) {
      console.warn('[meal-plan] AI swap failed the safety check; using a curated recipe');
      return this.swapCurated(userId, planId, dayOfWeek, mealType, plan);
    }

    // Reuse an existing image if we've generated this dish before
    const knownImages = await this.repo.findRecipeImagesByNames([newRecipe.name]);
    const reusedUrl = newRecipe.imageUrl ?? knownImages.get(newRecipe.name.toLowerCase()) ?? null;

    await this.repo.upsertRecipes([
      {
        id: newRecipe.id,
        name: newRecipe.name,
        description: newRecipe.description,
        ingredients: newRecipe.ingredients,
        instructions: newRecipe.instructions,
        nutritionInfo: newRecipe.nutritionInfo,
        cuisineType: newRecipe.cuisineType,
        dietaryTags: newRecipe.dietaryTags,
        prepTimeMins: newRecipe.prepTimeMins,
        cookTimeMins: newRecipe.cookTimeMins,
        servings: newRecipe.servings,
        imageUrl: reusedUrl,
        imageStatus: reusedUrl ? ('DONE' as const) : ('PENDING' as const),
        imagePriority: dayImagePriority(dayOfWeek, 0),
        creatorId: userId,
      },
    ]);

    // Update the day's meal slot
    await this.repo.updateDayMeal(planId, dayOfWeek, mealType, newRecipe.id);

    if (!reusedUrl) recipeImageWorker.wake();

    return toRecipeDto(newRecipe, {
      imageUrl: reusedUrl,
      imageStatus: reusedUrl ? 'DONE' : 'PENDING',
    });
  }

  /**
   * FREE-tier swap: random curated recipe of the same meal type (no AI),
   * drawn only from the user's safety-filtered pool.
   */
  private async swapCurated(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    plan: { days: { dayOfWeek: number; meals: unknown }[] },
  ): Promise<RecipeDto> {
    await ensureCuratedRecipes();

    // F2: swap alternatives must be safe for the whole household too.
    const safety = await this.loadMergedSafety(userId);

    type MealSlotJson = { type: string; recipeId: string };
    const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
    const slot = day ? (day.meals as MealSlotJson[]).find((m) => m.type === mealType) : undefined;

    const newRecipe = pickRandomCurated(mealType as MealType, slot?.recipeId, safety);
    if (!newRecipe) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          "We don't have another free recipe matching your restrictions — upgrade for AI swaps that always fit your needs.",
      });
    }
    await this.repo.updateDayMeal(planId, dayOfWeek, mealType, newRecipe.id);

    return toRecipeDto(newRecipe, { imageUrl: newRecipe.imageUrl, imageStatus: 'DONE' });
  }

  /**
   * Replaces a single meal slot with a specific saved recipe chosen by the user.
   */
  async replaceRecipe(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    recipeId: string,
  ): Promise<RecipeDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }

    const recipe = await findRecipeVisibleTo(userId, recipeId, this.repo);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }

    await this.repo.updateDayMeal(planId, dayOfWeek, mealType, recipeId);

    return rowToRecipeDto(recipe);
  }

  // ─── Week templates ("My weeks") ────────────────────────────────────────────
  // Up to MAX_WEEK_TEMPLATES named saved weeks the user rotates through. All
  // free-tier: no AI is involved anywhere in templates.

  async saveAsTemplate(userId: string, planId: string, name: string): Promise<TemplateSummaryDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan || plan.isTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const count = await this.repo.countTemplates(userId);
    if (count >= MAX_WEEK_TEMPLATES) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `You can keep up to ${MAX_WEEK_TEMPLATES} week templates — delete one to save this week.`,
      });
    }
    const template = await this.repo.createTemplate(
      userId,
      name,
      plan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals as { type: string; recipeId: string }[],
      })),
    );
    const [summary] = await this.summarizeTemplates([{ ...template, days: plan.days }]);
    return summary!;
  }

  async listTemplates(userId: string): Promise<TemplateSummaryDto[]> {
    const templates = await this.repo.findTemplates(userId);
    return this.summarizeTemplates(templates);
  }

  async renameTemplate(userId: string, templateId: string, name: string): Promise<void> {
    const template = await this.repo.findTemplateById(userId, templateId);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Week template not found.' });
    }
    await this.repo.renameTemplate(userId, templateId, name);
  }

  async deleteTemplate(userId: string, templateId: string): Promise<void> {
    const template = await this.repo.findTemplateById(userId, templateId);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Week template not found.' });
    }
    await this.repo.deleteTemplate(userId, templateId);
  }

  /**
   * Marks the template as followed (carry-forward clones it from now on) and
   * applies it to the requested week immediately: the existing plan for that
   * week, if any, is archived by createPlan — one tap to switch weeks.
   */
  async followTemplate(
    userId: string,
    templateId: string,
    weekOffset: 0 | 1,
  ): Promise<WeekPlanDto> {
    const template = await this.repo.findTemplateById(userId, templateId);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Week template not found.' });
    }
    await this.repo.setFollowedTemplate(userId, templateId);

    const created = await this.applyTemplateToWeek(userId, template, getMondayOfWeek(weekOffset));
    return this.assemblePlanDto(created, userId);
  }

  /**
   * Materializes a template as the plan for the week starting `monday`
   * (origin TEMPLATE). Used by followTemplate and by the Sunday worker, which
   * must repeat a followed week instead of generating over it (F-PLAN-4-1).
   */
  async applyTemplateToWeek(
    userId: string,
    template: { days: { dayOfWeek: number; meals: unknown }[] },
    monday: Date,
  ): Promise<NonNullable<Awaited<ReturnType<IMealPlanRepository['findByWeekStart']>>>> {
    await this.repo.createPlan({
      userId,
      weekStartDate: monday,
      days: template.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals as { type: string; recipeId: string }[],
      })),
      recipeIds: [],
      origin: MealPlanOrigin.TEMPLATE,
    });
    const created = await this.repo.findByWeekStart(userId, monday);
    if (!created) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Applying the week failed.' });
    }
    return created;
  }

  async unfollowTemplate(userId: string): Promise<void> {
    await this.repo.setFollowedTemplate(userId, null);
  }

  private async summarizeTemplates(
    templates: {
      id: string;
      name: string | null;
      isFollowed: boolean;
      createdAt: Date;
      days: { meals: unknown }[];
    }[],
  ): Promise<TemplateSummaryDto[]> {
    type MealSlotJson = { type: string; recipeId: string };
    const allIds = new Set<string>();
    for (const t of templates) {
      for (const day of t.days) {
        for (const m of day.meals as MealSlotJson[]) allIds.add(m.recipeId);
      }
    }
    const recipeRows = await this.repo.findRecipesByIds([...allIds]);
    const nameById = new Map(recipeRows.map((r) => [r.id, r.name]));

    return templates.map((t) => {
      const meals = t.days.flatMap((d) => d.meals as MealSlotJson[]);
      const uniqueIds = [...new Set(meals.map((m) => m.recipeId))];
      return {
        id: t.id,
        name: t.name ?? 'Saved week',
        isFollowed: t.isFollowed,
        createdAt: t.createdAt,
        mealsCount: meals.length,
        previewNames: uniqueIds.slice(0, 3).map((id) => nameById.get(id) ?? 'Unknown'),
      };
    });
  }

  async list(userId: string, limit = 10, offset = 0): Promise<MealPlanSummaryDto[]> {
    const plans = await this.repo.findAllByUserId(userId, limit, offset);
    if (plans.length === 0) return [];

    // Collect all recipe IDs across all plans
    type MealSlotJson = { type: string; recipeId: string };
    const allIds = new Set<string>();
    for (const plan of plans) {
      for (const day of plan.days) {
        for (const m of day.meals as MealSlotJson[]) allIds.add(m.recipeId);
      }
    }
    const recipeRows = await this.repo.findRecipesByIds([...allIds]);
    const recipeMap = new Map<string, Recipe>(recipeRows.map((r) => [r.id, r]));

    return plans.map((plan) => {
      const allMeals = plan.days.flatMap((d) => d.meals as MealSlotJson[]);
      const uniqueIds = [...new Set(allMeals.map((m) => m.recipeId))];
      const previewNames = uniqueIds.slice(0, 3).map((id) => recipeMap.get(id)?.name ?? 'Unknown');

      // Calculate average daily macros
      const dayTotals = plan.days.map((day) => {
        const dayMeals = (day.meals as MealSlotJson[]).map((m) => recipeMap.get(m.recipeId));
        let kcal = 0,
          protein = 0,
          carbs = 0,
          fat = 0;
        for (const recipe of dayMeals) {
          if (!recipe) continue;
          const n = recipe.nutritionInfo as unknown as NutritionInfo;
          kcal += n.calories ?? 0;
          protein += n.protein ?? 0;
          carbs += n.carbs ?? 0;
          fat += n.fat ?? 0;
        }
        return { kcal, protein, carbs, fat };
      });

      const dayCount = dayTotals.length || 1;
      const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / dayCount);

      const weekStart = new Date(plan.weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return {
        id: plan.id,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        status: plan.status,
        createdAt: plan.createdAt,
        recipePreview: previewNames,
        macroSummary: {
          avgKcal: avg(dayTotals.map((d) => d.kcal)),
          avgProtein: avg(dayTotals.map((d) => d.protein)),
          avgCarbs: avg(dayTotals.map((d) => d.carbs)),
          avgFat: avg(dayTotals.map((d) => d.fat)),
        },
      };
    });
  }

  async restore(userId: string, planId: string): Promise<WeekPlanDto> {
    // Ownership check via a single indexed lookup (previously a 100-row scan)
    const target = await this.repo.findByIdForUser(userId, planId);
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });
    }

    if (target.isTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });
    }

    // Restore = a fresh copy of the old plan as the newest row for its week.
    // Flipping the old row back to ACTIVE didn't work: week lookups take the
    // newest row, so the restored plan never showed, and every other week's
    // plan was archived too (audit F-PLAN-6-1). createPlan archives only the
    // same week and carries the old plan's shopping ticks and custom items.
    const days = target.days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      meals: d.meals as { type: string; recipeId: string; leftoverOf?: string }[],
    }));
    const restored = await this.repo.createPlan({
      userId,
      weekStartDate: target.weekStartDate,
      days,
      recipeIds: [...new Set(days.flatMap((d) => d.meals.map((m) => m.recipeId)))],
      carryShoppingFromPlanId: target.id,
    });

    return this.assemblePlanDto({ ...restored, days: target.days }, userId);
  }

  async getById(userId: string, planId: string): Promise<WeekPlanDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });
    }
    return this.assemblePlanDto(plan, userId);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const mealPlanService = new MealPlanService(mealPlanRepository);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * User-facing message for a failed AI call. Transient provider overloads
 * (Gemini 429/503 — already retried by the AI layer) get an honest
 * "try again shortly" instead of a generic failure.
 */
function aiFailureMessage(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  if (status === 429 || status === 503) {
    return 'The AI service is temporarily overloaded. Please try again in a minute.';
  }
  return fallback;
}

/** The macro vocabulary rows for every ingredient in `recipes` (one query). */
async function loadMacroVocabulary(
  recipes: RecipeData[],
): Promise<Map<string, MacroVocabularyRow>> {
  const names = [
    ...new Set(recipes.flatMap((r) => r.ingredients.map((i) => normalizeIngredientName(i.name)))),
  ];
  if (names.length === 0) return new Map();
  const rows = await prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: names } },
    select: {
      ingredientName: true,
      caloriesPer100g: true,
      proteinPer100g: true,
      carbsPer100g: true,
      fatPer100g: true,
      fiberPer100g: true,
      gramsPerPiece: true,
    },
  });
  return new Map(rows.map((r) => [r.ingredientName, r]));
}

/**
 * Per-day kcal totals of a generated week (per-serving nutrition — matches
 * what the planner's "Day total" row displays).
 */
function planDayKcalTotals(weekPlan: { days: { meals: { recipe: RecipeData }[] }[] }): number[] {
  return weekPlan.days.map((d) =>
    d.meals.reduce((sum, m) => sum + (m.recipe.nutritionInfo?.calories ?? 0), 0),
  );
}

/** How far a plan's days stray beyond the ±15% band around the target (0 = every day in band). */
const PLAN_KCAL_TOLERANCE = 0.15;
function offTargetScore(dayTotals: number[], target: number): number {
  if (!target) return 0;
  return dayTotals.reduce(
    (sum, t) => sum + Math.max(0, Math.abs(t - target) / target - PLAN_KCAL_TOLERANCE),
    0,
  );
}

/** Per-day protein / carbs / fat totals (grams, per serving). */
function planDayMacroTotals(weekPlan: {
  days: { meals: { recipe: RecipeData }[] }[];
}): { proteinG: number; carbsG: number; fatG: number }[] {
  return weekPlan.days.map((d) =>
    d.meals.reduce(
      (acc, m) => ({
        proteinG: acc.proteinG + (m.recipe.nutritionInfo?.protein ?? 0),
        carbsG: acc.carbsG + (m.recipe.nutritionInfo?.carbs ?? 0),
        fatG: acc.fatG + (m.recipe.nutritionInfo?.fat ?? 0),
      }),
      { proteinG: 0, carbsG: 0, fatG: 0 },
    ),
  );
}

/** Macros get a wider band than kcal (±20%) and half the weight. */
const PLAN_MACRO_TOLERANCE = 0.2;
const MACRO_WEIGHT = 0.5;

/**
 * Kcal score plus how far protein, carbs and fat stray beyond ±20% of their
 * targets (audit F-PLAN-1-2). 0 = every day in every band.
 */
export function planOffTargetScore(
  weekPlan: { days: { meals: { recipe: RecipeData }[] }[] },
  targets: { dailyCalorieTarget: number; proteinG: number; carbsG: number; fatG: number },
): number {
  const kcal = offTargetScore(planDayKcalTotals(weekPlan), targets.dailyCalorieTarget);
  const band = (actual: number, target: number) =>
    target > 0 ? Math.max(0, Math.abs(actual - target) / target - PLAN_MACRO_TOLERANCE) : 0;
  const macros = planDayMacroTotals(weekPlan).reduce(
    (sum, d) =>
      sum +
      band(d.proteinG, targets.proteinG) +
      band(d.carbsG, targets.carbsG) +
      band(d.fatG, targets.fatG),
    0,
  );
  return kcal + MACRO_WEIGHT * macros;
}

function toRecipeDto(
  r: RecipeData,
  image?: { imageUrl: string | null; imageStatus: RecipeDto['imageStatus'] },
): RecipeDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    ingredients: r.ingredients,
    instructions: r.instructions,
    nutritionInfo: r.nutritionInfo,
    cuisineType: r.cuisineType,
    dietaryTags: r.dietaryTags,
    prepTimeMins: r.prepTimeMins,
    cookTimeMins: r.cookTimeMins,
    servings: r.servings,
    imageUrl: image?.imageUrl ?? r.imageUrl ?? null,
    // Without an explicit resolution, new AI recipes have no image yet —
    // treat as PENDING so the worker generates one.
    imageStatus: image?.imageStatus ?? 'PENDING',
  };
}

// Converts a Prisma Recipe row into the RecipeData shape the plan-assembly
// pipeline works with — used to inject pinned favourites into AI plans (P1-1).
/**
 * Adds `allergenWarnings` when the recipe conflicts with the viewer's hard
 * safety prefs — the detail page, cook mode and planner show them so an
 * unsafe dish is never presented silently (F-REC-2-3, F-PLAN-1-7).
 */
function withAllergenWarnings(dto: RecipeDto, row: Recipe, safety: SafetyPrefs | null): RecipeDto {
  if (!safety) return dto;
  const issues = findSafetyIssues(rowToRecipeData(row), safety);
  if (issues.length === 0) return dto;
  const restrictions = new Set(safety.dietaryRestrictions);
  return {
    ...dto,
    allergenWarnings: issues.map((issue) =>
      restrictions.has(issue) ? restrictionWarningLabel(issue) : issue,
    ),
  };
}

/**
 * Clients render warnings as "Contains …", which read "Contains Paleo" for a
 * diet conflict. Phrase restrictions as what the dish contains instead:
 * "Gluten-free" → "gluten", "Paleo" → "non-paleo". Stays a plain
 * string so shipped app binaries render it unchanged.
 */
export function restrictionWarningLabel(restriction: string): string {
  const lower = restriction.trim().toLowerCase();
  const free = /^(.+?)[\s-]*free$/.exec(lower);
  if (free?.[1]) return free[1];
  return `non-${lower}`;
}

function rowToRecipeData(row: Recipe): RecipeData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients as unknown as Ingredient[],
    instructions: row.instructions,
    nutritionInfo: row.nutritionInfo as unknown as NutritionInfo,
    cuisineType: row.cuisineType,
    dietaryTags: row.dietaryTags,
    prepTimeMins: row.prepTimeMins,
    cookTimeMins: row.cookTimeMins,
    servings: row.servings,
    imageUrl: row.imageUrl,
  };
}

// Converts a Prisma Recipe row (with JSON fields) to a RecipeDto
function rowToRecipeDto(row: {
  id: string;
  name: string;
  description: string;
  ingredients: unknown;
  instructions: string[];
  nutritionInfo: unknown;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
  imageStatus?: unknown;
}): RecipeDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients as Ingredient[],
    instructions: row.instructions,
    nutritionInfo: row.nutritionInfo as NutritionInfo,
    cuisineType: row.cuisineType,
    dietaryTags: row.dietaryTags,
    prepTimeMins: row.prepTimeMins,
    cookTimeMins: row.cookTimeMins,
    servings: row.servings,
    imageUrl: row.imageUrl,
    imageStatus: (row.imageStatus as 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED') ?? 'DONE',
  };
}
