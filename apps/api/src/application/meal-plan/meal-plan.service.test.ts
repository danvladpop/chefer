import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chefProfileRepository,
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  householdMemberRepository,
  mealRatingRepository,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import { dayImagePriority, MealPlanService } from './meal-plan.service.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: { aiCallLog: { create: vi.fn().mockResolvedValue({}) } },
    chefProfileRepository: { findByUserId: vi.fn() },
    dietaryPreferencesRepository: { findByUserId: vi.fn() },
    favouriteRecipeRepository: {
      findPinnedForNextPlan: vi.fn().mockResolvedValue([]),
      clearNextPlanFlags: vi.fn().mockResolvedValue(undefined),
    },
    mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
    householdMemberRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
    // F3 wiring: generate loads use-first items + computes usedPantryItems —
    // empty pantry keeps every existing expectation identical.
    pantryItemRepository: { findByUser: vi.fn().mockResolvedValue([]) },
    mealPlanRepository: {},
  };
});

vi.mock('../../lib/ai/index.js', () => ({
  aiService: { generateMealPlan: vi.fn(), generateRecipeSwap: vi.fn() },
}));

vi.mock('../../lib/curated-recipes/index.js', () => {
  const mkRecipe = (id: string, type: string) => ({
    id,
    name: `Curated ${type} ${id}`,
    description: 'd',
    ingredients: [],
    instructions: ['step'],
    nutritionInfo: { calories: 500, protein: 30, carbs: 40, fat: 20, fiber: 5 },
    cuisineType: 'generic',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 10,
    servings: 1,
    imageUrl: 'https://img.example/x.jpg',
  });
  const pools = {
    breakfast: [
      mkRecipe('b1', 'breakfast'),
      mkRecipe('b2', 'breakfast'),
      mkRecipe('b3', 'breakfast'),
    ],
    lunch: [mkRecipe('l1', 'lunch'), mkRecipe('l2', 'lunch'), mkRecipe('l3', 'lunch')],
    dinner: [mkRecipe('d1', 'dinner'), mkRecipe('d2', 'dinner'), mkRecipe('d3', 'dinner')],
    snack: [mkRecipe('s1', 'snack')],
  };
  return {
    ensureCuratedRecipes: vi.fn().mockResolvedValue(undefined),
    pickRandomCurated: vi.fn((type: string) => mkRecipe('swap', type)),
    safeCuratedPools: vi.fn(() => pools),
    MIN_SAFE_POOL_SIZE: 3,
    CURATED_POOL_BY_TYPE: pools,
  };
});

vi.mock('../../workers/recipe-image.worker.js', () => ({
  recipeImageWorker: { wake: vi.fn() },
}));

vi.mock('../shared/plan-cost.js', () => ({
  estimatePlanCostEur: vi
    .fn()
    .mockResolvedValue({ totalEur: 42.5, pricedLines: 10, totalLines: 12 }),
}));

// ─── Fake repository ──────────────────────────────────────────────────────────

function makeRepo() {
  return {
    upsertRecipes: vi.fn().mockResolvedValue(undefined),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
    findRecipeById: vi.fn().mockResolvedValue(null),
    findRecipeImagesByNames: vi.fn().mockResolvedValue(new Map<string, string>()),
    findRecipesBySource: vi.fn().mockResolvedValue([]),
    createPlan: vi.fn().mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-08-17'),
    }),
    findActiveWithDays: vi.fn().mockResolvedValue(null),
    archiveOldPlans: vi.fn().mockResolvedValue(undefined),
    updateDayMeal: vi.fn().mockResolvedValue(undefined),
    findAllByUserId: vi.fn().mockResolvedValue([]),
    restorePlan: vi.fn().mockResolvedValue(undefined),
    findByIdForUser: vi.fn().mockResolvedValue(null),
    findByWeekStart: vi.fn().mockResolvedValue(null),
    findLatestWithDaysBefore: vi.fn().mockResolvedValue(null),
  };
}

const AI_RECIPE = {
  id: 'ai-r1',
  name: 'Miso Salmon',
  description: 'd',
  ingredients: [{ name: 'salmon', quantity: 200, unit: 'g' }],
  instructions: ['cook'],
  // In-band for CHEF_PROFILE's ~2259 kcal live target (±15%) so the P-1
  // calorie validation never triggers a retry in tests that assert a single
  // generateMealPlan call.
  nutritionInfo: { calories: 2200, protein: 40, carbs: 30, fat: 25, fiber: 4 },
  cuisineType: 'japanese',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 1,
  imageUrl: null,
};

const AI_WEEK_PLAN = {
  days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipe: AI_RECIPE }] }],
};

const CHEF_PROFILE = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  activityLevel: 'MODERATELY_ACTIVE',
  biologicalSex: 'MALE',
  goal: 'LOSE_WEIGHT',
  dailyCalorieTarget: 2500,
};

describe('MealPlanService.generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations — restore the no-signal defaults so
    // one test's pins/ratings don't leak into the next.
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
  });

  it('free tier: builds a 7-day curated plan with ZERO AI calls', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, false);

    expect(plan.days).toHaveLength(7);
    for (const day of plan.days) {
      expect(day.meals.map((m) => m.type)).toEqual(['breakfast', 'lunch', 'dinner']);
      // Curated recipes ship with preset images — instantly DONE, no worker.
      for (const meal of day.meals) {
        expect(meal.recipe.imageStatus).toBe('DONE');
      }
    }
    expect(aiService.generateMealPlan).not.toHaveBeenCalled();
    expect(repo.createPlan).toHaveBeenCalledOnce();
  });

  it('free tier: filters the curated pool by safety prefs before assembling', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    const curated = await import('../../lib/curated-recipes/index.js');
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      dietaryRestrictions: ['Vegan'],
      allergies: ['peanuts'],
      dislikedIngredients: [],
    } as never);

    await service.generate('user1', 0, false);

    expect(curated.safeCuratedPools).toHaveBeenCalledWith(
      expect.objectContaining({ allergies: ['peanuts'], dietaryRestrictions: ['Vegan'] }),
    );
  });

  it('free tier: pool exhaustion throws PRECONDITION_FAILED (the upgrade moment), not a plan', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    const curated = await import('../../lib/curated-recipes/index.js');
    // Only 2 safe dinners left — below MIN_SAFE_POOL_SIZE.
    vi.mocked(curated.safeCuratedPools).mockReturnValueOnce({
      breakfast: [1, 2, 3],
      lunch: [1, 2, 3],
      dinner: [1, 2],
      snack: [],
    } as never);

    await expect(service.generate('user1', 0, false)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(repo.createPlan).not.toHaveBeenCalled();
    expect(aiService.generateMealPlan).not.toHaveBeenCalled();
  });

  it('premium: passes allergies, restrictions and the LIVE calorie target to the AI', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      dietaryRestrictions: ['vegetarian'],
      allergies: ['peanuts'],
      dislikedIngredients: ['okra'],
      cuisinePreferences: ['thai'],
      mealsPerDay: 3,
      servingSize: 1,
    } as never);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    await service.generate('user1', 0, true);

    expect(aiService.generateMealPlan).toHaveBeenCalledOnce();
    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.allergies).toEqual(['peanuts']);
    expect(input.dietaryRestrictions).toEqual(['vegetarian']);
    // Live Mifflin-St Jeor (80kg/180cm/30y moderate male, −500 fat-loss
    // deficit) — NOT the stale 2500 snapshot stored on the profile.
    expect(input.dailyCalorieTarget).not.toBe(2500);
    expect(input.dailyCalorieTarget).toBeLessThan(2500);
    expect(repo.upsertRecipes).toHaveBeenCalledOnce();
  });

  it('premium: a pinned favourite is placed verbatim, flags cleared, row not re-upserted (P1-1)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);
    const pinnedRecipe = {
      id: 'curated-fix-r-999',
      name: 'Shakshuka with Peppers',
      description: 'd',
      ingredients: [{ name: 'eggs', quantity: 2, unit: 'large' }],
      instructions: ['cook'],
      nutritionInfo: { calories: 380, protein: 18, carbs: 24, fat: 24, fiber: 6 },
      cuisineType: 'Middle Eastern',
      dietaryTags: ['vegetarian'],
      prepTimeMins: 10,
      cookTimeMins: 20,
      servings: 1,
      imageUrl: 'https://img.example/shakshuka.jpg',
    };
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([
      { recipe: pinnedRecipe } as never,
    ]);

    const plan = await service.generate('user1', 0, true);

    // Placed verbatim (exact id + DONE image), reported in personalisation.
    const dinner = plan.days[0]!.meals.find((m) => m.type === 'dinner')!;
    expect(dinner.recipe.id).toBe('curated-fix-r-999');
    expect(dinner.recipe.imageStatus).toBe('DONE');
    expect(plan.personalisation?.pinnedDishNames).toEqual(['Shakshuka with Peppers']);

    // The AI was told not to duplicate the pinned dish.
    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.pinnedDishNames).toEqual(['Shakshuka with Peppers']);

    // A pin means "next plan", not "forever".
    expect(favouriteRecipeRepository.clearNextPlanFlags).toHaveBeenCalledWith('user1');

    // The existing row must not be re-upserted (would stamp creatorId/source).
    const upserted = vi.mocked(repo.upsertRecipes).mock.calls[0]![0] as { id: string }[];
    expect(upserted.map((r) => r.id)).not.toContain('curated-fix-r-999');
  });

  it('premium: recent ratings become liked/disliked signals in the AI input (P1-1)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([
      { rating: 5, recipeName: 'Thai Green Curry', cuisineType: 'Thai', dietaryTags: [] },
      { rating: 4, recipeName: 'Shakshuka', cuisineType: 'Middle Eastern', dietaryTags: [] },
      { rating: 3, recipeName: 'Plain Rice', cuisineType: 'generic', dietaryTags: [] },
      { rating: 1, recipeName: 'Quinoa Buddha Bowl', cuisineType: 'American', dietaryTags: [] },
    ]);

    const plan = await service.generate('user1', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.likedDishes).toEqual(['Thai Green Curry (Thai)', 'Shakshuka (Middle Eastern)']);
    expect(input.dislikedDishes).toEqual(['Quinoa Buddha Bowl']);
    // 3-star ratings are neutral — not in either list.
    expect(input.likedDishes).not.toContain('Plain Rice (generic)');
    expect(plan.personalisation).toMatchObject({ likedCount: 2, dislikedCount: 1 });
    // No pins → nothing to clear.
    expect(favouriteRecipeRepository.clearNextPlanFlags).not.toHaveBeenCalled();
  });

  it('premium: the weekly budget reaches the AI input and the cost lands on the DTO (P2-4)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      ...CHEF_PROFILE,
      weeklyBudgetEur: 60,
    } as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    const plan = await service.generate('user1', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.weeklyBudgetEur).toBe(60);
    expect(plan.estimatedCost?.totalEur).toBe(42.5);
  });

  it('premium without a chef profile is rejected with BAD_REQUEST', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);

    await expect(service.generate('user1', 0, true)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(aiService.generateMealPlan).not.toHaveBeenCalled();
  });
});

describe('MealPlanService — day-total calorie validation (P-1)', () => {
  const planWithKcal = (kcal: number, name = `Dish ${kcal}`) => ({
    days: [
      {
        dayOfWeek: 0,
        meals: [
          {
            type: 'dinner',
            recipe: {
              ...AI_RECIPE,
              id: `r-${kcal}`,
              name,
              nutritionInfo: { ...AI_RECIPE.nutritionInfo, calories: kcal },
            },
          },
        ],
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
  });

  it('an off-target first plan triggers exactly one corrective retry carrying the failed totals', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(aiService.generateMealPlan)
      .mockResolvedValueOnce(planWithKcal(600, 'Tiny Salad') as never)
      .mockResolvedValueOnce(planWithKcal(2200, 'Proper Dinner') as never);

    const plan = await service.generate('user1', 0, true);

    expect(aiService.generateMealPlan).toHaveBeenCalledTimes(2);
    const firstInput = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    const retryInput = vi.mocked(aiService.generateMealPlan).mock.calls[1]![0];
    expect(firstInput.calorieCorrection).toBeUndefined();
    expect(retryInput.calorieCorrection).toEqual({
      target: firstInput.dailyCalorieTarget,
      previousDayTotals: [600],
    });
    // The in-band retry wins.
    expect(plan.days[0]!.meals[0]!.recipe.name).toBe('Proper Dinner');
    expect(plan.calorieTarget).toBe(firstInput.dailyCalorieTarget);
  });

  it('keeps the first plan when the retry is even further off target', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(aiService.generateMealPlan)
      .mockResolvedValueOnce(planWithKcal(1700, 'Close Enough') as never)
      .mockResolvedValueOnce(planWithKcal(300, 'Worse') as never);

    const plan = await service.generate('user1', 0, true);

    expect(aiService.generateMealPlan).toHaveBeenCalledTimes(2);
    expect(plan.days[0]!.meals[0]!.recipe.name).toBe('Close Enough');
  });

  it('a failed retry keeps the first plan instead of throwing', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(aiService.generateMealPlan)
      .mockResolvedValueOnce(planWithKcal(600, 'Tiny Salad') as never)
      .mockRejectedValueOnce(new Error('provider down'));

    const plan = await service.generate('user1', 0, true);

    expect(plan.days[0]!.meals[0]!.recipe.name).toBe('Tiny Salad');
  });

  it('an in-band plan generates exactly once (no wasted AI call)', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(planWithKcal(2200) as never);

    await service.generate('user1', 0, true);

    expect(aiService.generateMealPlan).toHaveBeenCalledOnce();
  });

  it('free tier: the DTO carries the default calorie target for the badge math', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);

    const plan = await service.generate('user1', 0, false);

    expect(plan.calorieTarget).toBe(2000);
    expect(aiService.generateMealPlan).not.toHaveBeenCalled();
  });
});

describe('MealPlanService — household context (F2)', () => {
  const member = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    userId: 'user1',
    name: 'Maria',
    portionFactor: 1,
    isKid: false,
    allergies: [],
    dietaryRestrictions: [],
    dislikedIngredients: [],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      dietaryRestrictions: [],
      allergies: ['shellfish'],
      dislikedIngredients: ['okra'],
      cuisinePreferences: [],
      mealsPerDay: 3,
      servingSize: 1,
    } as never);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);
  });

  it('premium: householdContext reaches the AI input with portion math + merged safety + dislike notes', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([
      member({
        name: 'Maria',
        portionFactor: 1,
        allergies: ['peanuts'],
        dietaryRestrictions: ['Vegan'],
        dislikedIngredients: ['mushrooms'],
      }),
      member({ id: 'm2', name: 'Timmy', portionFactor: 0.5, isKid: true }),
    ] as never);

    await service.generate('user1', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    // ceil(1 owner + 1 + 0.5) = 3 servings for the table.
    expect(input.householdContext).toEqual({
      memberCount: 2,
      portionSum: 3,
      mergedSafety: {
        allergies: ['shellfish', 'peanuts'],
        dietaryRestrictions: ['Vegan'],
      },
      dislikeNotes: ['avoid mushrooms for Maria'],
    });
    // The hard union ALSO lands on the top-level prompt fields; the owner's
    // soft dislikes stay theirs alone.
    expect(input.allergies).toEqual(['shellfish', 'peanuts']);
    expect(input.dietaryRestrictions).toEqual(['Vegan']);
    expect(input.dislikedIngredients).toEqual(['okra']);
  });

  it('premium: no members → no householdContext, prompt fields unchanged', async () => {
    const service = new MealPlanService(makeRepo());

    await service.generate('user1', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.householdContext).toBeUndefined();
    expect(input.allergies).toEqual(['shellfish']);
  });

  it("free tier: a member's allergies join the curated safety filter (safety is never premium)", async () => {
    const service = new MealPlanService(makeRepo());
    const curated = await import('../../lib/curated-recipes/index.js');
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([
      member({ allergies: ['peanuts'], dietaryRestrictions: ['Vegan'] }),
    ] as never);

    await service.generate('user1', 0, false);

    expect(curated.safeCuratedPools).toHaveBeenCalledWith({
      allergies: ['shellfish', 'peanuts'],
      dietaryRestrictions: ['Vegan'],
      dislikedIngredients: ['okra'],
    });
  });
});

describe('dayImagePriority', () => {
  it("today's meals generate first (priority 0) for the current week", () => {
    const today = (() => {
      const jsDay = new Date().getDay();
      return jsDay === 0 ? 6 : jsDay - 1;
    })();
    expect(dayImagePriority(today, 0)).toBe(0);
    expect(dayImagePriority((today + 1) % 7, 0)).toBe(1);
    // A day "before" today wraps to the end of the queue, not negative.
    expect(dayImagePriority((today + 6) % 7, 0)).toBe(6);
  });

  it('future weeks sort strictly after the current week', () => {
    expect(dayImagePriority(0, 1)).toBe(7);
    expect(dayImagePriority(6, 1)).toBe(13);
    expect(dayImagePriority(0, 2)).toBe(14);
  });
});

// ─── getForWeek carry-forward ─────────────────────────────────────────────────
// Plans continue week to week: an empty current/next week materializes as a
// copy of the user's most recent plan (real row — downstream features work),
// flagged carriedOver on that first response. The past never mutates.

describe('MealPlanService.getForWeek carry-forward', () => {
  const DB_RECIPE = { ...AI_RECIPE, imageStatus: 'DONE' };
  const SOURCE_PLAN = {
    id: 'plan-prev',
    weekStartDate: new Date('2026-09-14'),
    days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'ai-r1' }] }],
  };
  const CLONED_PLAN = {
    id: 'plan-clone',
    weekStartDate: new Date('2026-09-21'),
    days: SOURCE_PLAN.days,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null as never);
  });

  it('clones the most recent plan into an empty next week and flags it', async () => {
    const repo = makeRepo();
    repo.findByWeekStart.mockResolvedValueOnce(null).mockResolvedValueOnce(CLONED_PLAN);
    repo.findLatestWithDaysBefore.mockResolvedValue(SOURCE_PLAN);
    repo.findRecipesByIds.mockResolvedValue([DB_RECIPE]);

    const service = new MealPlanService(repo);
    const result = await service.getForWeek('u1', 1);

    expect(repo.createPlan).toHaveBeenCalledTimes(1);
    const created = vi.mocked(repo.createPlan).mock.calls[0]![0] as {
      userId: string;
      days: unknown;
    };
    expect(created.userId).toBe('u1');
    expect(created.days).toEqual(SOURCE_PLAN.days);
    expect(result?.carriedOver).toBe(true);
    expect(result?.planId).toBe('plan-clone');
    expect(result?.days[0]?.meals[0]?.recipe.id).toBe('ai-r1');
  });

  it('never clones into a past week', async () => {
    const repo = makeRepo();
    repo.findLatestWithDaysBefore.mockResolvedValue(SOURCE_PLAN);

    const service = new MealPlanService(repo);
    const result = await service.getForWeek('u1', -1);

    expect(result).toBeNull();
    expect(repo.createPlan).not.toHaveBeenCalled();
  });

  it('returns null when there is no earlier plan to continue', async () => {
    const repo = makeRepo();

    const service = new MealPlanService(repo);
    const result = await service.getForWeek('u1', 1);

    expect(result).toBeNull();
    expect(repo.createPlan).not.toHaveBeenCalled();
  });

  it('ignores a source plan whose days are all empty', async () => {
    const repo = makeRepo();
    repo.findLatestWithDaysBefore.mockResolvedValue({
      ...SOURCE_PLAN,
      days: [{ dayOfWeek: 0, meals: [] }],
    });

    const service = new MealPlanService(repo);
    const result = await service.getForWeek('u1', 1);

    expect(result).toBeNull();
    expect(repo.createPlan).not.toHaveBeenCalled();
  });
});
