import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  AiCallType,
  chefProfileRepository,
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  householdMemberRepository,
  mealPlanRepository,
  mealRatingRepository,
  prisma,
  type FavouriteRecipeWithRecipe,
  type IHouseholdMemberRepository,
  type IMealPlanRepository,
  type Recipe,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import type { Ingredient, MealType, NutritionInfo, RecipeData } from '../../lib/ai/index.js';
import {
  ensureCuratedRecipes,
  MIN_SAFE_POOL_SIZE,
  pickRandomCurated,
  safeCuratedPools,
  type SafetyPrefs,
} from '../../lib/curated-recipes/index.js';
import { recipeImageWorker } from '../../workers/recipe-image.worker.js';
import { computeHouseholdContext, mergeHouseholdSafety } from '../household/household.service.js';
import { pairLeftovers } from '../pantry/leftovers.js';
import { computeUsedPantryItemsForUser, getUseFirstIngredients } from '../pantry/pantry-context.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { findRecipeVisibleTo, isRecipeOpenTo } from '../recipe/recipe-access.js';
import { estimatePlanCostEur, type PlanCostEstimate } from '../shared/plan-cost.js';
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
   * the priced-shopping-list wedge, surfaced on the plan itself.
   */
  estimatedCost?: PlanCostEstimate;
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
    options: { leftovers?: boolean } = {},
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

    if (!chefProfile) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Complete your profile setup before generating a meal plan.',
      });
    }

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
    const liveCalorieTarget = resolveDailyTargets(chefProfile).dailyCalorieTarget;

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
      goal: chefProfile.goal ?? 'MAINTAIN',
      biologicalSex: chefProfile.biologicalSex ?? 'MALE',
      age: chefProfile.age ?? 30,
      heightCm: chefProfile.heightCm ?? 175,
      weightKg: chefProfile.weightKg ?? 75,
      activityLevel: chefProfile.activityLevel ?? 'MODERATELY_ACTIVE',
      dailyCalorieTarget: liveCalorieTarget,
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
      ...(chefProfile.weeklyBudgetEur != null && {
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

    // 3a. Server-side day-total validation (trust P-1): the prompt demands
    // ±5% but models routinely return days 25-45% under target. One corrective
    // retry with the failed numbers in the prompt; keep whichever attempt is
    // closer. The retry is intentionally NOT logged to aiCallLog — quota
    // counts user actions, and the user asked once.
    const firstTotals = planDayKcalTotals(weekPlan);
    if (offTargetScore(firstTotals, liveCalorieTarget) > 0) {
      try {
        const retryPlan = await aiService.generateMealPlan({
          ...aiInput,
          calorieCorrection: { target: liveCalorieTarget, previousDayTotals: firstTotals },
        });
        if (
          offTargetScore(planDayKcalTotals(retryPlan), liveCalorieTarget) <
          offTargetScore(firstTotals, liveCalorieTarget)
        ) {
          weekPlan = retryPlan;
        }
      } catch (err) {
        console.error('Calorie-correction retry failed; keeping first plan:', err);
      }
    }

    // 3a'. Server-minted recipe ids — never store under the LLM's name slug,
    // which could collide with another user's row (see recipe-ids.ts).
    weekPlan = withServerRecipeIds(weekPlan);

    // Log AI call (fire-and-forget — never crash the server if logging fails)
    prisma.aiCallLog
      .create({ data: { userId, callType: AiCallType.MEAL_PLAN } })
      .catch((err) => console.error('[aiCallLog] Failed to log MEAL_PLAN call:', err));

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
        .filter((r) => !pinnedIds.has(r.id))
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
      estimatedCost: await estimatePlanCostEur(weekPlan.days),
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

    // Shuffled cycling per meal type: variety across the week, no repeats
    // until a pool is exhausted.
    const cyclers = new Map<MealType, { pool: RecipeData[]; idx: number }>();
    for (const type of MEAL_TYPES) {
      const pool = [...pools[type]];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      cyclers.set(type, { pool, idx: 0 });
    }
    const nextRecipe = (type: MealType): RecipeData => {
      const cycler = cyclers.get(type);
      if (!cycler || cycler.pool.length === 0) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `No curated recipes available for ${type}.`,
        });
      }
      const recipe = cycler.pool[cycler.idx % cycler.pool.length]!;
      cycler.idx += 1;
      return recipe;
    };

    const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      meals: MEAL_TYPES.map((type) => ({ type, recipe: nextRecipe(type) })),
    }));

    const uniqueRecipeIds = [...new Set(days.flatMap((d) => d.meals.map((m) => m.recipe.id)))];
    const weekStartDate = getMondayOfWeek(weekOffset);
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
      estimatedCost: await estimatePlanCostEur(days),
    };
  }

  /**
   * The user's SafetyPrefs with every household member's allergies and
   * dietary restrictions unioned in (F2 — reused by the free curated path,
   * curated swaps and AI swaps; premium generation merges via
   * computeHouseholdContext). Filtering itself stays `filterSafeRecipes`,
   * unchanged.
   */
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
      days: { dayOfWeek: number; meals: unknown }[];
    },
    userId?: string,
  ): Promise<WeekPlanDto> {
    type MealSlotJson = { type: string; recipeId: string; leftoverOf?: string };
    const allMeals = plan.days.flatMap((d) => d.meals as MealSlotJson[]);
    const uniqueIds = [...new Set(allMeals.map((m) => m.recipeId))];
    const recipeRows: Recipe[] = await this.repo.findRecipesByIds(uniqueIds);
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
          recipe: rowToRecipeDto(row),
          ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
        };
      });
      return { dayOfWeek: d.dayOfWeek, meals };
    });

    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      days,
      estimatedCost: await estimatePlanCostEur(days),
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
      const source =
        (await this.repo.findFollowedTemplate(userId)) ??
        (await this.repo.findLatestWithDaysBefore(userId, monday));
      if (source?.days.some((d) => (d.meals as unknown[]).length > 0)) {
        await this.repo.createPlan({
          userId,
          weekStartDate: monday,
          days: source.days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            meals: d.meals as { type: string; recipeId: string }[],
          })),
          recipeIds: [],
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
    return rowToRecipeDto(row);
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

    prisma.aiCallLog
      .create({ data: { userId, callType: AiCallType.RECIPE_SWAP } })
      .catch((err) => console.error('[aiCallLog] Failed to log RECIPE_SWAP call:', err));

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

    const monday = getMondayOfWeek(weekOffset);
    await this.repo.createPlan({
      userId,
      weekStartDate: monday,
      days: template.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals as { type: string; recipeId: string }[],
      })),
      recipeIds: [],
    });
    const created = await this.repo.findByWeekStart(userId, monday);
    if (!created) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Applying the week failed.' });
    }
    return this.assemblePlanDto(created, userId);
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

    // Archive current active plans and set target to ACTIVE
    await this.repo.restorePlan(userId, planId);

    return this.getActive(userId) as Promise<WeekPlanDto>;
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
