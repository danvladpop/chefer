import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chefProfileRepository,
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  householdMemberRepository,
  mealPlanTailoringRepository,
  mealRatingRepository,
  prisma,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import { pickRandomCurated, safeCuratedPools } from '../../lib/curated-recipes/index.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { safetyService } from '../safety/safety.service.js';
import {
  dayImagePriority,
  MealPlanService,
  planOffTargetScore,
  resolvePlanSlot,
  restrictionWarningLabel,
} from './meal-plan.service.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      aiCallLog: { create: vi.fn().mockResolvedValue({}) },
      // UX-06: reads without a view resolve the viewer's tier for the training payload.
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      // Macro vocabulary (macro-reconcile) — empty: AI numbers stay as stated.
      ingredientPrice: { findMany: vi.fn().mockResolvedValue([]) },
    },
    chefProfileRepository: { findByUserId: vi.fn() },
    dietaryPreferencesRepository: { findByUserId: vi.fn() },
    favouriteRecipeRepository: {
      findPinnedForNextPlan: vi.fn().mockResolvedValue([]),
      clearNextPlanFlags: vi.fn().mockResolvedValue(undefined),
    },
    mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
    householdMemberRepository: {
      findByUserId: vi.fn().mockResolvedValue([]),
      migrateLegacyServingSize: vi.fn().mockResolvedValue(0),
    },
    // T-01.5/delta-4: SafetyService.loadContext (now called throughout this
    // file) reads reported recipes too — nobody has reported anything here.
    safetyReportRepository: { findRecipeIdsByUser: vi.fn().mockResolvedValue([]) },
    // F3 wiring: generate loads use-first items + computes usedPantryItems —
    // empty pantry keeps every existing expectation identical.
    pantryItemRepository: { findByUser: vi.fn().mockResolvedValue([]) },
    // P2-4 lifter lookups via the default training service: nobody lifts.
    gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
    weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
    routineRepository: { findActive: vi.fn().mockResolvedValue(null) },
    // UX-06 (T-06.2): every plan response reads the week's training days.
    workoutSessionRepository: { findCompleted: vi.fn().mockResolvedValue([]) },
    trainingPauseRepository: { listForUser: vi.fn().mockResolvedValue([]) },
    mealPlanRepository: {},
    // Live tailoring: no jobs unless a test queues one.
    mealPlanTailoringRepository: {
      findByPlanId: vi.fn().mockResolvedValue(null),
      cancelRunningForWeek: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      findCheckedKeys: vi.fn().mockResolvedValue([]),
      findUserGate: vi.fn().mockResolvedValue(null),
      saveProgress: vi.fn(),
    },
  };
});

vi.mock('../../lib/ai/index.js', () => ({
  aiService: {
    generateMealPlan: vi.fn(),
    generateMealPlanDay: vi.fn(),
    generateRecipeSwap: vi.fn(),
  },
}));

vi.mock('../../lib/curated-recipes/index.js', async () => {
  // The real matcher — safety decisions must be exercised, not stubbed.
  const { findSafetyIssues } = await vi.importActual<
    typeof import('../../lib/curated-recipes/safety.js')
  >('../../lib/curated-recipes/safety.js');
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
    findSafetyIssues,
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
    isRecipeInUserPlans: vi.fn().mockResolvedValue(false),
    findRecipeImagesByNames: vi.fn().mockResolvedValue(new Map<string, string>()),
    findRecipesBySource: vi.fn().mockResolvedValue([]),
    createPlan: vi.fn().mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-08-17'),
    }),
    findActiveWithDays: vi.fn().mockResolvedValue(null),
    findForWeek: vi.fn().mockResolvedValue(null),
    archiveOldPlans: vi.fn().mockResolvedValue(undefined),
    updateDayMeal: vi.fn().mockResolvedValue(undefined),
    setSlotPinned: vi.fn().mockResolvedValue(undefined),
    setDayPortions: vi.fn().mockResolvedValue(undefined),
    setDayMeals: vi.fn().mockResolvedValue(undefined),
    findAllByUserId: vi.fn().mockResolvedValue([]),
    findByIdForUser: vi.fn().mockResolvedValue(null),
    findByWeekStart: vi.fn().mockResolvedValue(null),
    findLatestWithDaysBefore: vi.fn().mockResolvedValue(null),
    createTemplate: vi.fn().mockResolvedValue({
      id: 'tpl1',
      name: 'Saved week',
      isFollowed: false,
      createdAt: new Date('2026-09-01'),
    }),
    findTemplates: vi.fn().mockResolvedValue([]),
    findTemplateById: vi.fn().mockResolvedValue(null),
    countTemplates: vi.fn().mockResolvedValue(0),
    renameTemplate: vi.fn().mockResolvedValue(undefined),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    setFollowedTemplate: vi.fn().mockResolvedValue(undefined),
    findFollowedTemplate: vi.fn().mockResolvedValue(null),
    hasShoppingProgress: vi.fn().mockResolvedValue(false),
    appendDayMeal: vi.fn().mockResolvedValue(0),
    removeDayMealIfMatches: vi.fn().mockResolvedValue(true),
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
      // Three mains, plus snacks when they fall short of the target (F-PLAN-1-3).
      expect(day.meals.map((m) => m.type).slice(0, 3)).toEqual(['breakfast', 'lunch', 'dinner']);
      expect(day.meals.slice(3).every((m) => m.type === 'snack')).toBe(true);
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

    const audit = vi.spyOn(safetyService, 'logFilterAudit');

    await service.generate('user1', 0, false);

    expect(curated.safeCuratedPools).toHaveBeenCalledWith(
      expect.objectContaining({ allergies: ['peanuts'], dietaryRestrictions: ['Vegan'] }),
    );
    // T-26.7: one `safety.filter` evidence line per curated generation.
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'plan.curated',
        prefs: expect.objectContaining({ allergies: ['peanuts'] }),
      }),
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

  it('free tier: pool exhaustion attaches a machine-readable PoolExhaustedCause (T-10.4)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    const curated = await import('../../lib/curated-recipes/index.js');
    vi.mocked(curated.safeCuratedPools).mockReturnValueOnce({
      breakfast: [1, 2, 3],
      lunch: [1, 2, 3],
      dinner: [1, 2],
      snack: [],
    } as never);

    const { PoolExhaustedCause } = await import('./meal-plan.service.js');
    await expect(service.generate('user1', 0, false)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      cause: expect.any(PoolExhaustedCause),
    });
  });

  it('a shape only requiring dinner is not blocked by an empty breakfast/lunch pool (T-07.2)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    const curated = await import('../../lib/curated-recipes/index.js');
    vi.mocked(curated.safeCuratedPools).mockReturnValueOnce({
      breakfast: [],
      lunch: [],
      dinner: [
        { ...AI_RECIPE, id: 'd1' },
        { ...AI_RECIPE, id: 'd2' },
        { ...AI_RECIPE, id: 'd3' },
      ],
      snack: [],
    });

    await expect(
      service.generate('user1', 0, false, { shape: { slots: ['dinner'] } }),
    ).resolves.toBeDefined();
  });

  it('AC1: an explicit shape plans only the chosen days and slots; other days are `planned: false`', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, false, {
      shape: { slots: ['dinner'], days: [0, 1, 2, 3] },
    });

    expect(plan.days).toHaveLength(7);
    const planned = plan.days.filter((d) => d.planned);
    expect(planned).toHaveLength(4);
    expect(planned.every((d) => d.dayOfWeek <= 3)).toBe(true);
    expect(planned.every((d) => d.meals.every((m) => m.type === 'dinner'))).toBe(true);
    const unplanned = plan.days.filter((d) => d.planned === false);
    expect(unplanned).toHaveLength(3);
    expect(unplanned.every((d) => d.meals.length === 0)).toBe(true);
  });

  it("generate returns previousPlanId from the repo's createPlan result (T-08.3)", async () => {
    const repo = makeRepo();
    repo.createPlan.mockResolvedValueOnce({
      id: 'plan2',
      weekStartDate: new Date('2026-08-17'),
      previousPlanId: 'plan1',
    });
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, false);

    expect(plan.previousPlanId).toBe('plan1');
  });

  it('T-07.4: keepPinned preserves a pinned slot from the replaced plan and reports drops', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue({
      id: 'old-plan',
      days: [
        {
          dayOfWeek: 0,
          meals: [
            { type: 'dinner', recipeId: 'd1', pinned: true },
            // Pinned but unsafe now — dropped and counted.
            { type: 'lunch', recipeId: 'peanut-dish', pinned: true },
          ],
        },
      ],
    });
    repo.findRecipesByIds.mockResolvedValue([
      {
        id: 'd1',
        name: 'Curated dinner d1',
        description: 'd',
        ingredients: [],
        instructions: ['step'],
        nutritionInfo: { calories: 500, protein: 30, carbs: 40, fat: 20, fiber: 5 },
        cuisineType: 'generic',
        dietaryTags: [],
        prepTimeMins: 10,
        cookTimeMins: 10,
        servings: 1,
        imageUrl: null,
      },
      {
        id: 'peanut-dish',
        name: 'Peanut noodles',
        description: 'd',
        ingredients: [],
        instructions: ['step'],
        nutritionInfo: { calories: 500, protein: 30, carbs: 40, fat: 20, fiber: 5 },
        cuisineType: 'generic',
        dietaryTags: ['peanut'],
        prepTimeMins: 10,
        cookTimeMins: 10,
        servings: 1,
        imageUrl: null,
      },
    ] as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      dietaryRestrictions: [],
      allergies: ['peanut'],
      dislikedIngredients: [],
    } as never);
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, false, { keepPinned: true });

    const monday = plan.days.find((d) => d.dayOfWeek === 0)!;
    const dinner = monday.meals.find((m) => m.type === 'dinner')!;
    expect(dinner.recipe.id).toBe('d1');
    expect(dinner.pinned).toBe(true);
    // The lunch pin was unsafe (peanut allergy) — dropped, not applied.
    const lunch = monday.meals.find((m) => m.type === 'lunch')!;
    expect(lunch.recipe.id).not.toBe('peanut-dish');
    expect(plan.droppedPinned).toBe(1);
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

    // (The one-dish fixture is off target, so a corrective retry may follow —
    // this test pins the first call's input.)
    expect(aiService.generateMealPlan).toHaveBeenCalled();
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

  it('T-10.7: premiumChanges is present only on a regeneration, with an honest target-hit count', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    // First generation of the week: nothing to compare against.
    const first = await service.generate('user1', 0, true);
    expect(first.premiumChanges).toBeUndefined();

    // A regeneration: the repo reports a previousPlanId for the same week.
    repo.createPlan.mockResolvedValueOnce({
      id: 'plan2',
      weekStartDate: new Date('2026-08-17'),
      previousPlanId: 'plan1',
    });
    const regenerated = await service.generate('user1', 0, true);
    expect(regenerated.previousPlanId).toBe('plan1');
    expect(regenerated.premiumChanges?.targetHits).toBe(1); // AI_WEEK_PLAN's one day, in-band
    expect(regenerated.premiumChanges?.missDays).toBe(0);
    expect(regenerated.premiumChanges?.lines.length).toBeGreaterThan(0);
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

  it('premium without a chef profile generates against default targets (F-PM-2)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    const plan = await service.generate('user1', 0, true);

    expect(plan.days).toHaveLength(1);
    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input).toMatchObject({ goal: 'MAINTAIN', activityLevel: 'MODERATELY_ACTIVE' });
    expect(input.dailyCalorieTarget).toBeGreaterThan(0);
  });
});

describe('MealPlanService — day-total calorie validation (P-1)', () => {
  // Macros follow the profile's targets scaled to `kcal`, so these tests pin
  // the calorie behaviour; macro drift has its own test below.
  const TARGETS = resolveDailyTargets(CHEF_PROFILE);
  const macrosFor = (kcal: number) => {
    const f = kcal / TARGETS.dailyCalorieTarget;
    return {
      protein: Math.round(TARGETS.proteinG * f),
      carbs: Math.round(TARGETS.carbsG * f),
      fat: Math.round(TARGETS.fatG * f),
    };
  };
  const planWithKcal = (kcal: number, name = `Dish ${kcal}`, macros = macrosFor(kcal)) => ({
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
              nutritionInfo: { ...AI_RECIPE.nutritionInfo, calories: kcal, ...macros },
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
    expect(retryInput.calorieCorrection).toMatchObject({
      target: firstInput.dailyCalorieTarget,
      previousDayTotals: [600],
    });
    expect(retryInput.calorieCorrection?.previousDayMacros).toHaveLength(1);
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

  it('kcal on target but fat far over still triggers the retry (F-PLAN-1-2)', async () => {
    const service = new MealPlanService(makeRepo());
    const t = TARGETS.dailyCalorieTarget;
    vi.mocked(aiService.generateMealPlan)
      .mockResolvedValueOnce(
        planWithKcal(t, 'Fat Bomb', { ...macrosFor(t), fat: TARGETS.fatG * 2 }) as never,
      )
      .mockResolvedValueOnce(planWithKcal(t, 'Balanced') as never);

    const plan = await service.generate('user1', 0, true);

    expect(aiService.generateMealPlan).toHaveBeenCalledTimes(2);
    const first = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(first.macroTargets).toEqual({
      proteinG: TARGETS.proteinG,
      carbsG: TARGETS.carbsG,
      fatG: TARGETS.fatG,
    });
    expect(plan.days[0]!.meals[0]!.recipe.name).toBe('Balanced');
  });

  it('an in-band plan generates exactly once (no wasted AI call)', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(
      planWithKcal(TARGETS.dailyCalorieTarget) as never,
    );

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

  it('premium: servings come from the household, never the legacy serving size (F-PM-8)', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      dietaryRestrictions: [],
      allergies: [],
      dislikedIngredients: [],
      cuisinePreferences: [],
      mealsPerDay: 3,
      servingSize: 4, // stale legacy value
    } as never);
    const order: string[] = [];
    vi.mocked(householdMemberRepository.migrateLegacyServingSize).mockImplementation(async () => {
      order.push('migrate');
      return 0;
    });
    vi.mocked(householdMemberRepository.findByUserId).mockImplementation(async () => {
      order.push('find');
      return [member({ portionFactor: 0.5, isKid: true })] as never;
    });

    const result = await service.generate('user1', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.servingSize).toBe(2); // ceil(1 + 0.5)
    // A legacy "cooking for N" is converted into members BEFORE they're read
    // (the second "find" is SafetyService's own household read, T-01.5/
    // delta-4 — it now also carries this generation's hidden-recipe ids).
    expect(order).toEqual(['migrate', 'find', 'find']);
    // The week cost is sized for the same table.
    const { estimatePlanCostEur } = await import('../shared/plan-cost.js');
    expect(vi.mocked(estimatePlanCostEur).mock.calls.at(-1)?.[1]).toEqual({ portions: 2 });
    expect(result.planId).toBeDefined();
  });

  it('premium solo: servings are 1 even with a stale legacy serving size', async () => {
    const service = new MealPlanService(makeRepo());
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      dietaryRestrictions: [],
      allergies: [],
      dislikedIngredients: [],
      cuisinePreferences: [],
      mealsPerDay: 3,
      servingSize: 3,
    } as never);
    await service.generate('user1', 0, true);
    expect(vi.mocked(aiService.generateMealPlan).mock.calls[0]![0].servingSize).toBe(1);
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
      // T-01.5/delta-4: SafetyService.loadContext (buildCuratedWeek's new
      // safety read, for reported-recipe exclusion) carries this through.
      excludeLabelDependent: false,
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
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
  });

  it('UX-06 (T-06.2): a read carries trainingDays + trainingBasis from the training service', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue(CLONED_PLAN);
    repo.findRecipesByIds.mockResolvedValue([DB_RECIPE]);
    const trainingDays = [
      {
        dayOfWeek: 0,
        dayName: 'Monday',
        kind: 'lift',
        workoutName: 'Upper A',
        kcalBonus: 250,
        proteinBonus: 32,
        carbsBonus: 30,
        done: false,
        applied: true,
      },
    ];
    const basis = { restKcal: 2500, restProteinG: 144, proteinGPerKg: 1.8, bodyweightKg: 80 };
    const training = {
      loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
      trainingSchedule: vi.fn().mockResolvedValue([]),
      isBumpWidened: vi.fn().mockResolvedValue(false),
      trainingWeek: vi.fn().mockResolvedValue({ trainingDays, basis }),
    };
    const service = new MealPlanService(repo, undefined, training);

    const result = await service.getForWeek('u1', 0, { trainingAccess: true });

    expect(result?.trainingDays).toEqual(trainingDays);
    expect(result?.trainingBasis).toEqual(basis);
    expect(training.trainingWeek).toHaveBeenCalledWith('u1', null, expect.any(Date), true);
  });

  it('UX-06: a user with no training days gets neither field', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue(CLONED_PLAN);
    repo.findRecipesByIds.mockResolvedValue([DB_RECIPE]);
    const result = await new MealPlanService(repo).getForWeek('u1', 0);
    expect(result?.trainingDays).toBeUndefined();
    expect(result?.trainingBasis).toBeUndefined();
    expect(result?.firstScaledWeek).toBeUndefined();
  });

  it('clones the most recent plan into an empty next week and flags it', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValueOnce(null).mockResolvedValueOnce(CLONED_PLAN);
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

  it('sizes the week cost for a premium household only (householdScaling, P2-3)', async () => {
    const { estimatePlanCostEur } = await import('../shared/plan-cost.js');
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue(CLONED_PLAN);
    repo.findRecipesByIds.mockResolvedValue([DB_RECIPE]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([
      { portionFactor: 1, allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
      { portionFactor: 0.5, allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
    ] as never);
    const service = new MealPlanService(repo);

    await service.getForWeek('u1', 0, { householdScaling: true });
    expect(vi.mocked(estimatePlanCostEur).mock.calls.at(-1)?.[1]).toEqual({ portions: 3 });

    // Free household: same members, single-portion cost.
    await service.getForWeek('u1', 0);
    expect(vi.mocked(estimatePlanCostEur).mock.calls.at(-1)?.[1]).toEqual({ portions: null });
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

// ─── B-13: one "this week" everywhere ──────────────────────────────────────────

describe('MealPlanService — B-13 week-matched reads (T-00.15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
  });

  it('Sunday: only next week planned → getForWeek(0) and getActive are both empty, never leak next week', async () => {
    const repo = makeRepo();
    // Only a plan for NEXT week exists and it's the sole ACTIVE plan — the
    // old bug read it via findActiveWithDays as if it were "this week".
    repo.findActiveWithDays.mockResolvedValue({
      id: 'plan-next-week',
      weekStartDate: new Date('2026-10-05'),
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'r1' }] }],
    });
    repo.findForWeek.mockResolvedValue(null);
    repo.findLatestWithDaysBefore.mockResolvedValue(null);
    repo.findFollowedTemplate.mockResolvedValue(null);

    const service = new MealPlanService(repo);

    const thisWeek = await service.getForWeek('u1', 0);
    expect(thisWeek).toBeNull();
    expect(repo.findActiveWithDays).not.toHaveBeenCalled();

    const active = await service.getActive('u1');
    expect(active).toBeNull();
    expect(repo.findActiveWithDays).not.toHaveBeenCalled();
  });
});

// ─── Week templates ("My weeks") ──────────────────────────────────────────────

describe('MealPlanService week templates', () => {
  const PLAN_ROW = {
    id: 'plan-src',
    isTemplate: false,
    weekStartDate: new Date('2026-09-14'),
    days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'ai-r1' }] }],
  };
  const TEMPLATE_ROW = {
    id: 'tpl1',
    name: 'Mediterranean week',
    isFollowed: false,
    isTemplate: true,
    createdAt: new Date('2026-09-01'),
    weekStartDate: new Date('2026-09-01'),
    days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'ai-r1' }] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
  });

  it('saveAsTemplate copies the plan days into a named template', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW);
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, imageStatus: 'DONE' }]);

    const service = new MealPlanService(repo);
    const summary = await service.saveAsTemplate('u1', 'plan-src', 'Mediterranean week');

    expect(repo.createTemplate).toHaveBeenCalledWith('u1', 'Mediterranean week', PLAN_ROW.days);
    expect(summary.previewNames).toEqual(['Miso Salmon']);
    expect(summary.mealsCount).toBe(1);
  });

  it('saveAsTemplate enforces the 4-template cap with CONFLICT', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW);
    repo.countTemplates.mockResolvedValue(4);

    const service = new MealPlanService(repo);
    await expect(service.saveAsTemplate('u1', 'plan-src', 'One too many')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(repo.createTemplate).not.toHaveBeenCalled();
  });

  it('saveAsTemplate refuses to template a template', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({ ...PLAN_ROW, isTemplate: true });

    const service = new MealPlanService(repo);
    await expect(service.saveAsTemplate('u1', 'tpl1', 'Copy')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('followTemplate marks it followed and applies it to the requested week', async () => {
    const repo = makeRepo();
    repo.findTemplateById.mockResolvedValue(TEMPLATE_ROW);
    repo.findByWeekStart.mockResolvedValue({
      id: 'plan-applied',
      weekStartDate: new Date('2026-09-28'),
      days: TEMPLATE_ROW.days,
    });
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, imageStatus: 'DONE' }]);

    const service = new MealPlanService(repo);
    const week = await service.followTemplate('u1', 'tpl1', 1);

    expect(repo.setFollowedTemplate).toHaveBeenCalledWith('u1', 'tpl1');
    expect(repo.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', days: TEMPLATE_ROW.days }),
    );
    expect(week.planId).toBe('plan-applied');
  });

  it('carry-forward prefers the followed template over the latest plan', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'plan-clone',
      weekStartDate: new Date(),
      days: TEMPLATE_ROW.days,
    });
    repo.findFollowedTemplate.mockResolvedValue(TEMPLATE_ROW);
    repo.findLatestWithDaysBefore.mockResolvedValue(PLAN_ROW);
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, imageStatus: 'DONE' }]);

    const service = new MealPlanService(repo);
    const result = await service.getForWeek('u1', 1);

    const created = vi.mocked(repo.createPlan).mock.calls[0]![0] as { days: unknown };
    expect(created.days).toEqual(TEMPLATE_ROW.days);
    expect(repo.findLatestWithDaysBefore).not.toHaveBeenCalled();
    expect(result?.carriedOver).toBe(true);
  });

  it('deleteTemplate and renameTemplate 404 on unknown ids', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    await expect(service.deleteTemplate('u1', 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.renameTemplate('u1', 'nope', 'X')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── Audit S1 fixes (2026-09-25) ──────────────────────────────────────────────

const PRIVATE_RECIPE = {
  id: 'private-1',
  name: 'Grandma soup',
  description: 'd',
  ingredients: [],
  instructions: ['cook'],
  nutritionInfo: { calories: 300, protein: 10, carbs: 30, fat: 10, fiber: 2 },
  cuisineType: 'romanian',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 2,
  imageUrl: null,
  imageStatus: 'DONE',
  source: 'MANUAL',
  creatorId: 'victim',
};

describe('MealPlanService — recipe visibility (F-REC-2-1, F-PLAN-3-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getRecipe: another user's private recipe is NOT_FOUND", async () => {
    const repo = makeRepo();
    repo.findRecipeById.mockResolvedValue(PRIVATE_RECIPE);
    const service = new MealPlanService(repo);

    await expect(service.getRecipe('attacker', 'private-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.getRecipe('victim', 'private-1')).resolves.toMatchObject({
      id: 'private-1',
    });
  });

  it("replaceRecipe: refuses to copy another user's private recipe into a plan", async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({ id: 'plan1', days: [] });
    repo.findRecipeById.mockResolvedValue(PRIVATE_RECIPE);
    const service = new MealPlanService(repo);

    await expect(
      service.replaceRecipe('attacker', 'plan1', 0, 'dinner', 'private-1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.updateDayMeal).not.toHaveBeenCalled();
  });

  it("generate: drops a pinned favourite that is another user's private recipe", async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([
      { recipe: PRIVATE_RECIPE } as never,
    ]);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    await service.generate('attacker', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.pinnedDishNames).toEqual([]);
  });
});

describe('MealPlanService.replaceRecipe — safety (B-34/B-46, T-00.11)', () => {
  const PLAN_ROW_SIMPLE = {
    id: 'plan1',
    days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'old' }] }],
  };
  const eggRecipe = (over: Record<string, unknown> = {}) => ({
    ...AI_RECIPE,
    id: 'egg-r1',
    name: 'Egg Fried Rice',
    ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
    source: 'AI',
    creatorId: null,
    ...over,
  });
  const EGG_ALLERGY = { allergies: ['egg'], dietaryRestrictions: [], dislikedIngredients: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
  });

  it('rejects an unsafe recipe with UNSAFE_FOR_TABLE, naming the conflicting allergen', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW_SIMPLE);
    repo.findRecipeById.mockResolvedValue(eggRecipe());
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
    const service = new MealPlanService(repo);

    await expect(
      service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'egg-r1'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringMatching(/UNSAFE_FOR_TABLE/),
    });
    await expect(service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'egg-r1')).rejects.toThrow(
      /egg/i,
    );
    expect(repo.updateDayMeal).not.toHaveBeenCalled();
  });

  it("acknowledgeConflict succeeds for the user's own manual recipe", async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW_SIMPLE);
    repo.findRecipeById.mockResolvedValue(eggRecipe({ source: 'MANUAL', creatorId: 'user1' }));
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
    const service = new MealPlanService(repo);

    await service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'egg-r1', undefined, true);
    expect(repo.updateDayMeal).toHaveBeenCalled();
  });

  it('acknowledgeConflict never bypasses safety for a recipe the user does not own', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW_SIMPLE);
    // AI/curated — visible to everyone, owned by nobody.
    repo.findRecipeById.mockResolvedValue(eggRecipe({ source: 'AI', creatorId: null }));
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
    const service = new MealPlanService(repo);

    await expect(
      service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'egg-r1', undefined, true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repo.updateDayMeal).not.toHaveBeenCalled();
  });

  it('a safe recipe is unaffected', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW_SIMPLE);
    repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'safe-r1', source: 'AI' });
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
    const service = new MealPlanService(repo);

    await service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'safe-r1');
    expect(repo.updateDayMeal).toHaveBeenCalled();
  });

  it("T-08.5/T-BUG-X2: keeps the slot's current portion instead of dropping it to 1×", async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'old', portion: 1.5 }] }],
    });
    repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'safe-r1', source: 'AI' });
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
    const service = new MealPlanService(repo);

    await service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'safe-r1');

    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan1', 0, 'dinner', 'safe-r1', 1.5, 0, true);
  });

  it('T-07.4: Replace marks the slot pinned and returns previousRecipeId', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(PLAN_ROW_SIMPLE);
    repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'safe-r1', source: 'AI' });
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
    const service = new MealPlanService(repo);

    const result = await service.replaceRecipe('user1', 'plan1', 0, 'dinner', 'safe-r1');

    expect(repo.updateDayMeal).toHaveBeenCalledWith(
      'plan1',
      0,
      'dinner',
      'safe-r1',
      undefined,
      0,
      true,
    );
    expect(result.previousRecipeId).toBe('old');
  });
});

describe('MealPlanService — server-minted AI recipe ids (F-PLAN-1-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
  });

  it('never persists a generated recipe under the LLM slug id', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    await service.generate('user1', 0, true);

    const stored = repo.upsertRecipes.mock.calls[0]![0] as { id: string; name: string }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]!.name).toBe('Miso Salmon');
    expect(stored[0]!.id).not.toBe('ai-r1');
  });
});

// ─── AI safety pass (audit F-PLAN-1-9) ────────────────────────────────────────

describe('MealPlanService — AI output is safety-checked', () => {
  const OMELETTE = {
    ...AI_RECIPE,
    id: 'ai-omelette',
    name: 'Spinach and Feta Omelette',
    ingredients: [
      { name: 'eggs', quantity: 3, unit: 'piece' },
      { name: 'feta', quantity: 40, unit: 'g' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      allergies: ['Eggs'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    } as never);
  });

  it('replaces an AI dish containing an allergen with a safe curated recipe', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue({
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipe: OMELETTE }] }],
    } as never);

    const plan = await service.generate('user1', 0, true);

    const dinner = plan.days[0]!.meals[0]!.recipe;
    expect(dinner.name).not.toContain('Omelette');
    expect(dinner.name).toMatch(/^Curated dinner/);
    // The curated row is shared and already stored — never re-upserted.
    const stored = (repo.upsertRecipes.mock.calls[0]?.[0] ?? []) as { name: string }[];
    expect(stored.map((r) => r.name)).not.toContain(dinner.name);
  });

  it('falls back to a curated recipe when an AI swap is unsafe', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'old' }] }],
    });
    const service = new MealPlanService(repo);
    vi.mocked(aiService.generateRecipeSwap).mockResolvedValue(OMELETTE);

    const swapped = await service.swapRecipe('user1', 'plan1', 0, 'dinner', undefined, true);

    expect(swapped.name).not.toContain('Omelette');
    expect(repo.upsertRecipes).not.toHaveBeenCalled();
    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan1', 0, 'dinner', swapped.id, undefined, 0);
  });

  it("getRecipe flags a recipe that conflicts with the viewer's allergies", async () => {
    const repo = makeRepo();
    repo.findRecipeById.mockResolvedValue({
      ...OMELETTE,
      imageStatus: 'DONE',
      source: 'AI',
      creatorId: 'user1',
    });
    const service = new MealPlanService(repo);

    const dto = await service.getRecipe('user1', 'ai-omelette');

    expect(dto.allergenWarnings).toEqual(['Eggs']);
  });
});

// ─── Restore (audit F-PLAN-6-1) ───────────────────────────────────────────────

describe('MealPlanService.restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
  });

  it('brings the plan back as the newest row for its week, carrying its shopping state', async () => {
    const repo = makeRepo();
    const weekStartDate = new Date('2026-09-21');
    const days = [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'r1' }] }];
    repo.findByIdForUser.mockResolvedValue({ id: 'old', weekStartDate, isTemplate: false, days });
    repo.createPlan.mockResolvedValue({ id: 'restored', weekStartDate });
    repo.findRecipesByIds.mockResolvedValue([
      { ...AI_RECIPE, id: 'r1', imageStatus: 'DONE', source: 'AI', creatorId: 'user1' },
    ]);
    const service = new MealPlanService(repo);

    const plan = await service.restore('user1', 'old');

    expect(repo.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user1',
        weekStartDate,
        days,
        carryShoppingFromPlanId: 'old',
      }),
    );
    expect(plan.planId).toBe('restored');
  });

  it('refuses to restore a template', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({ id: 'tpl', isTemplate: true, days: [] });
    const service = new MealPlanService(repo);
    await expect(service.restore('user1', 'tpl')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.createPlan).not.toHaveBeenCalled();
  });
});

describe('restrictionWarningLabel (allergen chip copy)', () => {
  it('turns diet restrictions into what the dish contains', () => {
    expect(restrictionWarningLabel('Paleo')).toBe('non-paleo');
    expect(restrictionWarningLabel('Vegetarian')).toBe('non-vegetarian');
    expect(restrictionWarningLabel('Gluten-free')).toBe('gluten');
    expect(restrictionWarningLabel('Dairy free')).toBe('dairy');
  });
});

describe('MealPlanService — training days (audit P2-4)', () => {
  const lifterTraining = {
    loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: 80 }),
    trainingSchedule: vi.fn().mockResolvedValue([
      { plannedWeekday: 0, name: 'Full Body A' },
      { plannedWeekday: 3, name: 'Full Body B' },
    ]),
    isBumpWidened: vi.fn().mockResolvedValue(false),
    trainingWeek: vi.fn().mockResolvedValue({ trainingDays: [], basis: null }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
  });

  it('premium: a lifter gets 1.8 g/kg protein and the routine days in the AI input', async () => {
    const service = new MealPlanService(makeRepo(), undefined, lifterTraining);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      ...CHEF_PROFILE,
      goal: 'GAIN_MUSCLE',
    } as never);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    await service.generate('user1', 0, true);

    const input = vi.mocked(aiService.generateMealPlan).mock.calls[0]![0];
    expect(input.macroTargets?.proteinG).toBe(144);
    expect(input.trainingDays?.days.map((d) => d.label)).toEqual(['Mon', 'Thu']);
    expect(input.trainingDays?.proteinBonus).toBe(32);
    expect(input.trainingDays?.kcalBonus).toBeGreaterThanOrEqual(150);
  });

  it('premium: no lifter, no training days in the prompt input', async () => {
    const service = new MealPlanService(makeRepo(), undefined, {
      loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
      trainingSchedule: vi.fn(),
      isBumpWidened: vi.fn().mockResolvedValue(false),
      trainingWeek: vi.fn().mockResolvedValue({ trainingDays: [], basis: null }),
    });
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);

    await service.generate('user1', 0, true);

    expect(vi.mocked(aiService.generateMealPlan).mock.calls[0]![0].trainingDays).toBeUndefined();
  });

  it('free: a lifter plan still has zero AI calls', async () => {
    const service = new MealPlanService(makeRepo(), undefined, lifterTraining);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      ...CHEF_PROFILE,
      goal: 'GAIN_MUSCLE',
    } as never);

    const plan = await service.generate('user1', 0, false);

    expect(plan.days).toHaveLength(7);
    expect(lifterTraining.trainingSchedule).toHaveBeenCalled();
    expect(aiService.generateMealPlan).not.toHaveBeenCalled();
  });

  it('validation judges training days against the bumped targets', () => {
    const day = (dayOfWeek: number, calories: number) => ({
      dayOfWeek,
      meals: [
        {
          recipe: {
            ...AI_RECIPE,
            nutritionInfo: { calories, protein: 150, carbs: 250, fat: 70, fiber: 0 },
          },
        },
      ],
    });
    const base = { dailyCalorieTarget: 2000, proteinG: 150, carbsG: 250, fatG: 70 };
    const bumped = { dailyCalorieTarget: 2600, proteinG: 150, carbsG: 250, fatG: 70 };
    const plan = { days: [day(0, 2600), day(1, 2000)] };
    expect(planOffTargetScore(plan, base)).toBeGreaterThan(0);
    expect(planOffTargetScore(plan, base, new Map([[0, bumped]]))).toBe(0);
  });
});

// ─── Curated portions (audit P1-1) ────────────────────────────────────────────

describe('MealPlanService — curated slot portions (P1-1)', () => {
  // The mocked pool is 500 kcal / 30 g per dish (1,500 kcal at 1×).
  const LIFTER = {
    weightKg: null,
    heightCm: null,
    age: null,
    activityLevel: null,
    biologicalSex: null,
    goal: 'GAIN_MUSCLE',
    dailyCalorieTarget: 2800,
  };
  // Not a set-up lifter: base (non-bodyweight) protein. P2-4 lifters below.
  const noLifter = {
    loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
    trainingSchedule: vi.fn().mockResolvedValue([]),
    isBumpWidened: vi.fn().mockResolvedValue(false),
    trainingWeek: vi.fn().mockResolvedValue({ trainingDays: [], basis: null }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(LIFTER as never);
  });

  it('stores and returns per-slot portions so a 2,800 kcal day is reachable', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo, undefined, noLifter);

    const plan = await service.generate('user1', 0, false);

    const stored = vi.mocked(repo.createPlan).mock.calls[0]![0] as {
      days: { meals: { recipeId: string; portion?: number }[] }[];
    };
    for (const [i, day] of plan.days.entries()) {
      const kcal = day.meals.reduce(
        (sum, m) => sum + m.recipe.nutritionInfo.calories * (m.portion ?? 1),
        0,
      );
      expect(Math.abs(kcal - 2800) / 2800).toBeLessThanOrEqual(0.1);
      // DTO and stored JSON agree; 1× is left out of both.
      expect(stored.days[i]!.meals.map((m) => m.portion)).toEqual(day.meals.map((m) => m.portion));
      // nutritionInfo stays per ONE serving.
      expect(day.meals.every((m) => m.recipe.nutritionInfo.calories === 500)).toBe(true);
    }
    expect(plan.days.some((d) => d.meals.some((m) => (m.portion ?? 1) > 1))).toBe(true);
    expect(plan.proteinTarget).toBe(resolveDailyTargets(LIFTER as never).proteinG);
  });

  it('flags an honestly protein-short day on read and scales nothing else', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-09-21'),
      days: [
        {
          dayOfWeek: 0,
          meals: [
            { type: 'breakfast', recipeId: 'ai-r1', portion: 1.5 },
            { type: 'dinner', recipeId: 'ai-r1' },
          ],
        },
      ],
    });
    // 2,200 kcal / 40 g per serving → 100 g at 2.5 servings vs 245 g target.
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, imageStatus: 'DONE' }]);
    const service = new MealPlanService(repo, undefined, noLifter);

    const dto = await service.getById('user1', 'plan1');

    const day = dto.days[0]!;
    expect(day.meals[0]!.portion).toBe(1.5);
    expect(day.meals[1]!.portion).toBeUndefined();
    expect(day.proteinGapG).toBe(dto.proteinTarget! - 100);
  });

  it('a free swap of a portioned slot keeps its calories', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'old', portion: 2 }] }],
    });
    // Old dish 400 kcal × 2 = 800 kcal; the swap-in is 500 kcal → 1.5×.
    repo.findRecipeById.mockResolvedValue({
      ...AI_RECIPE,
      id: 'old',
      nutritionInfo: { ...AI_RECIPE.nutritionInfo, calories: 400 },
    });
    const service = new MealPlanService(repo, undefined, noLifter);

    await service.swapRecipe('user1', 'plan1', 0, 'dinner', undefined, false);

    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan1', 0, 'dinner', 'swap', 1.5, 0);
  });

  it('a free swap of a 1× slot stays 1×', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'old' }] }],
    });
    const service = new MealPlanService(repo, undefined, noLifter);

    await service.swapRecipe('user1', 'plan1', 0, 'dinner', undefined, false);

    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan1', 0, 'dinner', 'swap', undefined, 0);
  });

  it('a free lifter is portioned toward, and judged against, bodyweight protein (P2-4)', async () => {
    const lifter = {
      loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: 80 }),
      trainingSchedule: vi.fn().mockResolvedValue([{ plannedWeekday: 0, name: 'Full Body A' }]),
      isBumpWidened: vi.fn().mockResolvedValue(false),
      trainingWeek: vi.fn().mockResolvedValue({ trainingDays: [], basis: null }),
    };
    const expected = resolveDailyTargets(LIFTER, 80);
    expect(expected.proteinG).toBe(144); // 1.8 g/kg

    const generated = await new MealPlanService(makeRepo(), undefined, lifter).generate(
      'user1',
      0,
      false,
    );
    expect(generated.proteinTarget).toBe(144);
    expect(generated.calorieTarget).toBe(expected.dailyCalorieTarget);

    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-09-21'),
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'ai-r1', portion: 2 }] }],
    });
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, imageStatus: 'DONE' }]);
    const dto = await new MealPlanService(repo, undefined, lifter).getById('user1', 'plan1');
    expect(dto.proteinTarget).toBe(144);
    expect(dto.days[0]!.proteinGapG).toBe(144 - 80); // 40 g × 2 servings
  });
});

describe('MealPlanService — per-slot operations on a two-snack day', () => {
  // A curated free day can hold two snacks (curated-planner.ts): index 3 and 4.
  const TWO_SNACK_PLAN = {
    id: 'plan1',
    weekStartDate: new Date('2026-09-21'),
    days: [
      {
        dayOfWeek: 2,
        meals: [
          { type: 'breakfast', recipeId: 'b1' },
          { type: 'lunch', recipeId: 'l1' },
          { type: 'dinner', recipeId: 'd1' },
          { type: 'snack', recipeId: 's1' },
          { type: 'snack', recipeId: 's2' },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
  });

  it('swaps the second snack when slotIndex is 4', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(TWO_SNACK_PLAN);
    const service = new MealPlanService(repo);

    await service.swapRecipe('user1', 'plan1', 2, 'snack', undefined, false, 4);

    // The alternative is drawn against the SECOND snack's recipe…
    expect(vi.mocked(pickRandomCurated).mock.calls[0]?.[1]).toBe('s2');
    // …and only that slot is written.
    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan1', 2, 'snack', 'swap', undefined, 4);
  });

  it('replaces the second snack when slotIndex is 4', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(TWO_SNACK_PLAN);
    repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'mine', source: 'AI' });
    const service = new MealPlanService(repo);

    await service.replaceRecipe('user1', 'plan1', 2, 'snack', 'mine', 4);

    // T-07.4: Replace always pins the slot ("Your pick").
    expect(repo.updateDayMeal).toHaveBeenCalledWith(
      'plan1',
      2,
      'snack',
      'mine',
      undefined,
      4,
      true,
    );
  });

  it('rejects a slotIndex that points at a different meal type with BAD_REQUEST', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(TWO_SNACK_PLAN);
    repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'mine', source: 'AI' });
    const service = new MealPlanService(repo);

    // Index 2 is dinner, not a snack; index 9 does not exist.
    await expect(
      service.swapRecipe('user1', 'plan1', 2, 'snack', undefined, true, 2),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      service.replaceRecipe('user1', 'plan1', 2, 'snack', 'mine', 9),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Validated before any AI call or write.
    expect(aiService.generateRecipeSwap).not.toHaveBeenCalled();
    expect(repo.updateDayMeal).not.toHaveBeenCalled();
  });

  it('without slotIndex the first snack is used, as shipped mobile builds expect', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(TWO_SNACK_PLAN);
    const service = new MealPlanService(repo);

    await service.swapRecipe('user1', 'plan1', 2, 'snack', undefined, false);

    expect(vi.mocked(pickRandomCurated).mock.calls[0]?.[1]).toBe('s1');
    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan1', 2, 'snack', 'swap', undefined, 3);
  });

  it('resolvePlanSlot: first match without an index, null when the day has no such slot', () => {
    expect(resolvePlanSlot(TWO_SNACK_PLAN, 2, 'snack')).toBe(3);
    expect(resolvePlanSlot(TWO_SNACK_PLAN, 2, 'snack', 4)).toBe(4);
    expect(resolvePlanSlot(TWO_SNACK_PLAN, 5, 'snack')).toBeNull();
    expect(() => resolvePlanSlot(TWO_SNACK_PLAN, 5, 'snack', 0)).toThrow();
  });
});

describe('MealPlanService.setSlotPinned (T-07.4)', () => {
  it('resolves the slot then delegates to the repository', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'd1' }] }],
    });
    const service = new MealPlanService(repo);

    await service.setSlotPinned('user1', 'plan1', 0, 'dinner', undefined, true);

    expect(repo.setSlotPinned).toHaveBeenCalledWith('plan1', 0, 'dinner', 0, true);
  });

  it('rejects a plan the user does not own', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(null);
    const service = new MealPlanService(repo);

    await expect(
      service.setSlotPinned('attacker', 'plan1', 0, 'dinner', undefined, true),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.setSlotPinned).not.toHaveBeenCalled();
  });
});

describe('MealPlanService.scaleDay (T-11.3, portion cap T-11.4)', () => {
  const scaleDayPlan = {
    id: 'plan1',
    days: [
      {
        dayOfWeek: 0,
        meals: [
          { type: 'dinner', recipeId: 'd1', portion: 1.5 },
          { type: 'snack', recipeId: 's1', pinned: true },
        ],
      },
    ],
  };
  const dinnerRow = {
    ...AI_RECIPE,
    id: 'd1',
    nutritionInfo: { calories: 600, protein: 40, carbs: 50, fat: 20, fiber: 5 },
  };
  const snackRow = {
    ...AI_RECIPE,
    id: 's1',
    nutritionInfo: { calories: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 },
  };

  it('preview (apply: false) computes the scaled totals without writing', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(scaleDayPlan);
    repo.findRecipesByIds.mockResolvedValue([dinnerRow, snackRow]);
    const service = new MealPlanService(repo);

    const result = await service.scaleDay('user1', 'plan1', 0, 1.25);

    // 1.5 × 1.25 = 1.875 → nearest step 1.75 (a tie with 2, kept at the
    // lower/earlier step); 1 × 1.25 = 1.25.
    const dinner = result.meals.find((m) => m.type === 'dinner')!;
    const snack = result.meals.find((m) => m.type === 'snack')!;
    expect(dinner.portion).toBe(1.75);
    expect(snack.portion).toBe(1.25);
    expect(snack.pinned).toBe(true);
    expect(result.kcal).toBe(600 * 1.75 + 200 * 1.25);
    expect(repo.setDayPortions).not.toHaveBeenCalled();
  });

  it('apply: true persists the scaled portions and never exceeds the 2× cap (T-11.4)', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(scaleDayPlan);
    repo.findRecipesByIds.mockResolvedValue([dinnerRow, snackRow]);
    const service = new MealPlanService(repo);

    // 1.5 × 1.5 = 2.25 → clamped to the plan's hard cap, step 2 (T-11.4).
    await service.scaleDay('user1', 'plan1', 0, 1.5, true);

    expect(repo.setDayPortions).toHaveBeenCalledWith('plan1', 0, [2, 1.5]);
    const applied = vi.mocked(repo.setDayPortions).mock.calls[0]![2] as number[];
    expect(Math.max(...applied)).toBeLessThanOrEqual(2);
  });

  it('404s for a day the plan does not have', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({ id: 'plan1', days: [] });
    const service = new MealPlanService(repo);

    await expect(service.scaleDay('user1', 'plan1', 3, 1.25)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('MealPlanService.planDay (wave-1 L-PLAN, UX-07 "Plan this day")', () => {
  const basePlan = {
    id: 'plan1',
    weekStartDate: new Date('2026-08-17'),
    days: [
      { dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'd1' }] },
      { dayOfWeek: 3, meals: [] },
    ],
  };
  const filledPlan = {
    ...basePlan,
    days: [
      basePlan.days[0],
      {
        dayOfWeek: 3,
        meals: [
          { type: 'breakfast', recipeId: 'b1' },
          { type: 'lunch', recipeId: 'l1' },
          { type: 'dinner', recipeId: 'd1' },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
  });

  it('fills an unplanned day with the curated picker, leaving every other day untouched', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValueOnce(basePlan).mockResolvedValueOnce(filledPlan);
    repo.findRecipesByIds.mockResolvedValue([
      { ...AI_RECIPE, id: 'd1' },
      { ...AI_RECIPE, id: 'b1' },
      { ...AI_RECIPE, id: 'l1' },
    ]);
    const service = new MealPlanService(repo);

    const result = await service.planDay('user1', 'plan1', 3);

    // Persists via setDayMeals (a full-day write), never updateDayMeal/
    // setDayPortions (single-slot patches) — and only for day 3.
    expect(repo.setDayMeals).toHaveBeenCalledOnce();
    const [planIdArg, dayArg, mealsArg] = repo.setDayMeals.mock.calls[0]!;
    expect(planIdArg).toBe('plan1');
    expect(dayArg).toBe(3);
    expect((mealsArg as { type: string }[]).map((m) => m.type).slice(0, 3)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
    expect(repo.updateDayMeal).not.toHaveBeenCalled();

    // The response is the whole plan (day 0 unaffected, day 3 now filled) —
    // clients can `setData` it the same way `generate`'s response is applied.
    expect(result.days.find((d) => d.dayOfWeek === 0)?.meals).toHaveLength(1);
    expect(result.days.find((d) => d.dayOfWeek === 3)?.meals.length).toBeGreaterThan(0);
  });

  it('rejects a day that already has meals — Replace/Regenerate own that job', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(basePlan);
    const service = new MealPlanService(repo);

    await expect(service.planDay('user1', 'plan1', 0)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repo.setDayMeals).not.toHaveBeenCalled();
  });

  it('404s for a plan the user does not own', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(null);
    const service = new MealPlanService(repo);

    await expect(service.planDay('attacker', 'plan1', 3)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('404s for a day the plan does not have', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({ id: 'plan1', days: [] });
    const service = new MealPlanService(repo);

    await expect(service.planDay('user1', 'plan1', 5)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('MealPlanService — reliable `planned` on every read (wave-1 T-07.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
  });

  it('marks an empty day outside the CURRENT stored shape as planned: false, even on a later read', async () => {
    // Before this test's fix, `planned` was reliable only on generate's own
    // response — a plain reload (getForWeek/getById) always omitted it, so
    // "Plan this day" only ever appeared right after generating.
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-08-17'),
      days: [
        { dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'd1' }] },
        { dayOfWeek: 3, meals: [] },
      ],
    });
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, id: 'd1' }]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      planSlots: ['dinner'],
      planDays: [0],
      timeCapMins: null,
      weekendNoLimit: false,
      cookingFor: null,
      leftovers: false,
    } as never);
    const service = new MealPlanService(repo);

    const plan = await service.getForWeek('user1', 0);

    expect(plan?.days.find((d) => d.dayOfWeek === 0)?.planned).toBeUndefined();
    expect(plan?.days.find((d) => d.dayOfWeek === 3)?.planned).toBe(false);
  });

  it('never relabels a day that already HAS meals, even once the shape excludes it', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-08-17'),
      days: [{ dayOfWeek: 3, meals: [{ type: 'dinner', recipeId: 'd1' }] }],
    });
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, id: 'd1' }]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      planSlots: ['dinner'],
      planDays: [0], // day 3 no longer in the shape
      timeCapMins: null,
      weekendNoLimit: false,
      cookingFor: null,
      leftovers: false,
    } as never);
    const service = new MealPlanService(repo);

    const plan = await service.getForWeek('user1', 0);
    const day3 = plan?.days.find((d) => d.dayOfWeek === 3);

    expect(day3?.planned).toBeUndefined();
    expect(day3?.meals).toHaveLength(1);
  });

  it('a legacy shape (never set) keeps every empty day `planned` absent, matching today’s behaviour', async () => {
    const repo = makeRepo();
    // clearAllMocks (in this describe's beforeEach) keeps a mock's LAST
    // implementation, not just its default — reset the previous tests'
    // stored shape explicitly so this one gets the true "never set" case.
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(undefined as never);
    repo.findForWeek.mockResolvedValue({
      id: 'plan1',
      weekStartDate: new Date('2026-08-17'),
      days: [{ dayOfWeek: 3, meals: [] }],
    });
    const service = new MealPlanService(repo);

    const plan = await service.getForWeek('user1', 0);

    expect(plan?.days.find((d) => d.dayOfWeek === 3)?.planned).toBeUndefined();
  });
});

// ─── Instant week, then live tailoring (premium) ──────────────────────────────

describe('MealPlanService — instant week + live tailoring (premium)', () => {
  const CONSENTED = { planTier: 'PREMIUM', role: 'USER', aiDataConsentAt: new Date() };
  const WEDNESDAY = new Date(2026, 8, 30, 10, 0, 0);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WEDNESDAY);
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(mealPlanTailoringRepository.findUserGate).mockResolvedValue(CONSENTED);
    vi.mocked(mealPlanTailoringRepository.findByPlanId).mockResolvedValue(null);
    vi.mocked(mealPlanTailoringRepository.findCheckedKeys).mockResolvedValue(['carried|g']);
    vi.mocked(mealPlanTailoringRepository.create).mockImplementation(
      async (data) =>
        ({
          ...data,
          id: 'job1',
          status: 'RUNNING',
          totalDays: data.queuedDays.length,
          tailoredDays: [],
          keptDays: [],
          failedDays: [],
          currentDay: data.queuedDays[0] ?? null,
          resumes: 0,
        }) as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a COMPLETE curated week at once with zero AI calls, and queues tailoring today-first', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, true, { instant: true, usageReserved: true });

    expect(aiService.generateMealPlan).not.toHaveBeenCalled();
    expect(aiService.generateMealPlanDay).not.toHaveBeenCalled();
    expect(plan.days).toHaveLength(7);
    expect(plan.days.every((d) => d.meals.length >= 3)).toBe(true);
    // Wednesday: today first, then the following days; Mon/Tue are past.
    expect(plan.tailoring).toMatchObject({
      status: 'RUNNING',
      tailoredDays: [],
      totalDays: 5,
      currentDay: 2,
      queuedDays: [2, 3, 4, 5, 6],
    });
    const job = vi.mocked(mealPlanTailoringRepository.create).mock.calls[0]![0];
    // Snapshots are the days exactly as stored — a later mismatch = the user touched it.
    const stored = repo.createPlan.mock.calls[0]![0].days as {
      dayOfWeek: number;
      meals: unknown;
    }[];
    expect(job.snapshots['2']).toEqual(stored[2]!.meals);
    expect(job.baselineCheckedKeys).toEqual(['carried|g']);
    expect(job.slotTypes).toEqual(['breakfast', 'lunch', 'dinner']);
    // Usage was reserved (and logged) by the router — not logged twice.
    expect(prisma.aiCallLog.create).not.toHaveBeenCalled();
  });

  it('next week tailors Monday first; the Sunday worker path logs the one generation', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 1, true, { instant: true });

    expect(plan.tailoring?.queuedDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(prisma.aiCallLog.create).toHaveBeenCalledOnce();
  });

  it('a newer generation cancels the running tailoring of the same week before replacing the plan', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    await service.generate('user1', 0, true, { instant: true, usageReserved: true });

    const cancel = vi.mocked(mealPlanTailoringRepository.cancelRunningForWeek);
    expect(cancel).toHaveBeenCalledWith('user1', expect.any(Date));
    expect(cancel.mock.invocationCallOrder[0]!).toBeLessThan(
      repo.createPlan.mock.invocationCallOrder[0]!,
    );
  });

  it('without AI data consent the week stays curated — nothing is queued', async () => {
    vi.mocked(mealPlanTailoringRepository.findUserGate).mockResolvedValue({
      ...CONSENTED,
      aiDataConsentAt: null,
    });
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, true, { instant: true, usageReserved: true });

    expect(mealPlanTailoringRepository.create).not.toHaveBeenCalled();
    expect(plan.tailoring).toBeUndefined();
    expect(plan.days).toHaveLength(7);
  });

  it('places pinned favourites as the user’s picks (locked for tailoring) and clears the flags', async () => {
    const pinnedRecipe = {
      ...AI_RECIPE,
      id: 'fav-1',
      name: 'Shakshuka with Peppers',
      imageUrl: 'https://img.example/s.jpg',
    };
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([
      { recipe: pinnedRecipe } as never,
    ]);
    const repo = makeRepo();
    repo.isRecipeInUserPlans.mockResolvedValue(true);
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 1, true, { instant: true, usageReserved: true });

    const monDinner = plan.days[0]!.meals.find((m) => m.type === 'dinner')!;
    expect(monDinner.recipe.id).toBe('fav-1');
    expect(monDinner.pinned).toBe(true);
    expect(plan.personalisation?.pinnedDishNames).toEqual(['Shakshuka with Peppers']);
    expect(favouriteRecipeRepository.clearNextPlanFlags).toHaveBeenCalledWith('user1');
  });

  it('leftovers: dinners pair with next-day lunches in the instant week (a locked pair)', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    await service.generate('user1', 1, true, {
      instant: true,
      usageReserved: true,
      leftovers: true,
    });

    const stored = repo.createPlan.mock.calls[0]![0].days as {
      dayOfWeek: number;
      meals: { type: string; recipeId: string; leftoverOf?: string }[];
    }[];
    const monDinner = stored[0]!.meals.find((m) => m.type === 'dinner')!;
    const tueLunch = stored[1]!.meals.find((m) => m.type === 'lunch')!;
    expect(tueLunch).toMatchObject({ recipeId: monDinner.recipeId, leftoverOf: 'Monday' });
    expect(vi.mocked(mealPlanTailoringRepository.create).mock.calls[0]![0].leftovers).toBe(true);
  });

  it('a table the curated pool cannot cover falls back to the blocking AI week', async () => {
    vi.mocked(safeCuratedPools).mockReturnValueOnce({
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    });
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);
    const repo = makeRepo();
    const service = new MealPlanService(repo);

    const plan = await service.generate('user1', 0, true, { instant: true, usageReserved: true });

    expect(aiService.generateMealPlan).toHaveBeenCalled();
    expect(plan.tailoring).toBeUndefined();
  });

  it('reads carry the tailoring block (additive — absent when there is no job)', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue({
      id: 'plan1',
      status: 'ACTIVE',
      weekStartDate: new Date(2026, 8, 28),
      createdAt: new Date(2026, 8, 28),
      days: [{ dayOfWeek: 2, meals: [] }],
    });
    vi.mocked(mealPlanTailoringRepository.findByPlanId).mockResolvedValue({
      status: 'RUNNING',
      tailoredDays: [2],
      totalDays: 5,
      currentDay: 3,
      queuedDays: [3, 4, 5, 6],
      keptDays: [],
      failedDays: [],
      resumes: 0,
    } as never);
    const service = new MealPlanService(repo);

    const dto = await service.getForWeek('user1', 0);

    expect(dto?.tailoring).toMatchObject({ status: 'RUNNING', tailoredDays: [2], currentDay: 3 });
  });
});

describe('MealPlanService.tailorDay (one live-tailored day)', () => {
  const planDays = [
    {
      dayOfWeek: 2,
      meals: [
        { type: 'breakfast', recipeId: 'kept-pick', pinned: true },
        { type: 'lunch', recipeId: 'cur-l' },
        { type: 'dinner', recipeId: 'cur-d' },
      ],
    },
    { dayOfWeek: 3, meals: [{ type: 'dinner', recipeId: 'other-day' }] },
  ];
  const plan = { id: 'plan1', weekStartDate: new Date(2026, 8, 28), days: planDays };
  const dish = (id: string, name: string, calories: number, extra = {}) => ({
    ...AI_RECIPE,
    id,
    name,
    nutritionInfo: { ...AI_RECIPE.nutritionInfo, calories },
    ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([]);
    vi.mocked(mealRatingRepository.findSignalsForUser).mockResolvedValue([]);
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
  });

  it('keeps locked slots, takes the AI for the rest, persists the new recipes under server ids', async () => {
    const repo = makeRepo();
    repo.findRecipesByIds.mockResolvedValue([{ id: 'other-day', name: 'Thai Curry' }] as never);
    vi.mocked(aiService.generateMealPlanDay).mockResolvedValue({
      dayOfWeek: 2,
      meals: [
        { type: 'breakfast', recipe: dish('llm-b', 'Oats', 600) },
        { type: 'lunch', recipe: dish('llm-l', 'Salad', 800) },
        { type: 'dinner', recipe: dish('llm-d', 'Salmon', 900) },
      ],
    } as never);
    const service = new MealPlanService(repo);

    const result = await service.tailorDay({
      userId: 'user1',
      plan,
      dayOfWeek: 2,
      slotTypes: ['breakfast', 'lunch', 'dinner'],
      deadline: Date.now() + 60_000,
    });

    if (!('meals' in result)) throw new Error('expected meals');
    expect(result.meals[0]).toEqual({ type: 'breakfast', recipeId: 'kept-pick', pinned: true });
    expect(result.meals.map((m) => m.type)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(result.meals.map((m) => m.recipeId)).not.toContain('llm-l');
    // The AI was told the day and what the rest of the week already has.
    const request = vi.mocked(aiService.generateMealPlanDay).mock.calls[0]![1];
    expect(request).toMatchObject({ dayOfWeek: 2 });
    expect(request.alreadyPlanned).toContain('Thai Curry');
    const upserted = repo.upsertRecipes.mock.calls[0]![0] as { id: string; name: string }[];
    expect(upserted.map((r) => r.name).sort()).toEqual(['Salad', 'Salmon']);
    expect(upserted.every((r) => !r.id.startsWith('llm-'))).toBe(true);
  });

  it('an unsafe AI dish is swapped for a safe curated one, exactly like a whole AI week', async () => {
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      allergies: ['Eggs'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    } as never);
    const repo = makeRepo();
    vi.mocked(aiService.generateMealPlanDay).mockResolvedValue({
      dayOfWeek: 2,
      meals: [
        {
          type: 'dinner',
          recipe: dish('llm-d', 'Omelette', 2000, {
            ingredients: [{ name: 'eggs', quantity: 3, unit: 'piece' }],
          }),
        },
      ],
    } as never);
    const service = new MealPlanService(repo);

    const result = await service.tailorDay({
      userId: 'user1',
      plan,
      dayOfWeek: 2,
      slotTypes: ['breakfast', 'lunch', 'dinner'],
      deadline: Date.now() + 60_000,
    });

    if (!('meals' in result)) throw new Error('expected meals');
    const dinner = result.meals.find((m) => m.type === 'dinner')!;
    expect(dinner.recipeId).toBe('swap'); // pickRandomCurated mock
    // Lunch the AI didn't provide keeps its curated slot.
    expect(result.meals.find((m) => m.type === 'lunch')?.recipeId).toBe('cur-l');
  });

  it('delta-4: a day replaced by tailorDay shows the CORRECT Checked/conflict state on a later read', async () => {
    // Same setup as "an unsafe AI dish is swapped…" above: the household has
    // an egg allergy, and the AI's dinner pick is rejected and swapped for a
    // safe curated dish at tailor time.
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue({
      allergies: ['Eggs'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    } as never);
    const repo = makeRepo();
    vi.mocked(aiService.generateMealPlanDay).mockResolvedValue({
      dayOfWeek: 2,
      meals: [
        {
          type: 'dinner',
          recipe: dish('llm-d', 'Omelette', 2000, {
            ingredients: [{ name: 'eggs', quantity: 3, unit: 'piece' }],
          }),
        },
      ],
    } as never);
    const service = new MealPlanService(repo);

    const tailored = await service.tailorDay({
      userId: 'user1',
      plan,
      dayOfWeek: 2,
      slotTypes: ['breakfast', 'lunch', 'dinner'],
      deadline: Date.now() + 60_000,
    });
    if (!('meals' in tailored)) throw new Error('expected meals');

    // Simulate the compare-and-set write: day 2 now holds tailorDay's
    // output — breakfast is the pinned slot tailoring left untouched
    // ("kept-pick", deliberately given egg ingredients below to prove a
    // conflict is still caught for a slot tailoring never touched), dinner
    // is the curated dish tailoring swapped in ("swap", egg-free).
    repo.findByIdForUser.mockResolvedValue({
      id: 'plan1',
      weekStartDate: plan.weekStartDate,
      days: [{ dayOfWeek: 2, meals: tailored.meals }, planDays[1]],
    });
    repo.findRecipesByIds.mockResolvedValue([
      {
        ...dish('kept-pick', 'Egg Fried Rice', 500, {
          ingredients: [{ name: 'egg', quantity: 2, unit: 'piece' }],
        }),
        imageStatus: 'DONE',
      },
      {
        ...dish('swap', 'Chicken Skewers', 500, {
          ingredients: [{ name: 'chicken', quantity: 200, unit: 'g' }],
        }),
        imageStatus: 'DONE',
      },
      {
        ...dish('cur-l', 'Curated Lunch', 500, {
          ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
        }),
        imageStatus: 'DONE',
      },
      { ...dish('other-day', 'Thai Curry', 500), imageStatus: 'DONE' },
    ] as never);

    // The read is what matters (delta-4): every recipe on the tailored day
    // gets its OWN fresh safety verdict from the CURRENT table, regardless
    // of how it got into the slot or what tailorDay's own safety pass
    // already knew about it.
    const dto = await service.getById('user1', 'plan1');
    const day2 = dto.days.find((d) => d.dayOfWeek === 2)!;
    const dinnerMeal = day2.meals.find((m) => m.type === 'dinner')!;
    expect(dinnerMeal.recipe.safetyChecks?.checked.map((c) => c.label)).toEqual(['Eggs']);
    expect(dinnerMeal.recipe.safetyChecks?.conflicts ?? []).toEqual([]);
    const breakfastMeal = day2.meals.find((m) => m.type === 'breakfast')!;
    expect(breakfastMeal.recipe.safetyChecks?.conflicts).toEqual(['Eggs']);
  });

  it('an off-target day gets one corrective retry carrying its numbers (budget permitting)', async () => {
    const repo = makeRepo();
    vi.mocked(aiService.generateMealPlanDay)
      .mockResolvedValueOnce({
        dayOfWeek: 2,
        meals: [{ type: 'dinner', recipe: dish('a', 'Tiny', 300) }],
      } as never)
      .mockResolvedValueOnce({
        dayOfWeek: 2,
        meals: [{ type: 'dinner', recipe: dish('b', 'Hearty', 2200) }],
      } as never);
    const service = new MealPlanService(repo);

    const result = await service.tailorDay({
      userId: 'user1',
      plan,
      dayOfWeek: 2,
      slotTypes: ['dinner'],
      deadline: Date.now() + 60_000,
    });

    expect(aiService.generateMealPlanDay).toHaveBeenCalledTimes(2);
    const retryInput = vi.mocked(aiService.generateMealPlanDay).mock.calls[1]![0];
    expect(retryInput.calorieCorrection?.previousDayTotals).toEqual([300]);
    if (!('meals' in result)) throw new Error('expected meals');
    const upserted = repo.upsertRecipes.mock.calls[0]![0] as { name: string }[];
    expect(upserted.map((r) => r.name)).toEqual(['Hearty']);
  });

  it('a day whose every slot is locked is skipped without an AI call', async () => {
    const repo = makeRepo();
    const service = new MealPlanService(repo);
    const locked = {
      ...plan,
      days: [{ dayOfWeek: 2, meals: [{ type: 'dinner', recipeId: 'x', pinned: true }] }],
    };
    const result = await service.tailorDay({
      userId: 'user1',
      plan: locked,
      dayOfWeek: 2,
      slotTypes: ['dinner'],
      deadline: Date.now() + 60_000,
    });
    expect(result).toEqual({ skip: 'locked' });
    expect(aiService.generateMealPlanDay).not.toHaveBeenCalled();
  });
});

describe('MealPlanService.resumeTailoring ("Tailor the rest")', () => {
  const WEDNESDAY = new Date(2026, 8, 30, 10, 0, 0);
  const planRow = {
    id: 'plan1',
    status: 'ACTIVE',
    isTemplate: false,
    weekStartDate: new Date(2026, 8, 28),
    createdAt: new Date(2026, 8, 28),
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, meals: [] as unknown[] })),
  };
  const partial = {
    id: 'job1',
    status: 'PARTIAL',
    tailoredDays: [2, 3],
    keptDays: [4],
    failedDays: [5],
    queuedDays: [6],
    totalDays: 5,
    resumes: 0,
    snapshots: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WEDNESDAY);
    vi.mocked(mealPlanTailoringRepository.findUserGate).mockResolvedValue({
      planTier: 'PREMIUM',
      role: 'USER',
      aiDataConsentAt: new Date(),
    });
    vi.mocked(mealPlanTailoringRepository.findCheckedKeys).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function repoWithPlan() {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue({
      ...planRow,
      days: planRow.days.map((d) => ({
        ...d,
        meals: [{ type: 'dinner', recipeId: `cur-${d.dayOfWeek}` }],
      })),
    });
    repo.findRecipesByIds.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ ...AI_RECIPE, id, imageStatus: 'DONE' })),
    );
    return repo;
  }

  it('re-queues ONLY the untailored days (failed + unreached), never tailored or kept ones', async () => {
    vi.mocked(mealPlanTailoringRepository.findByPlanId).mockResolvedValue(partial as never);
    const repo = repoWithPlan();
    const service = new MealPlanService(repo);

    await service.resumeTailoring('user1', 'plan1', true);

    const [, patch] = vi.mocked(mealPlanTailoringRepository.saveProgress).mock.calls[0]!;
    expect(patch).toMatchObject({
      status: 'RUNNING',
      queuedDays: [5, 6],
      failedDays: [],
      resumes: 1,
      strikes: 0,
      totalDays: 5,
    });
    expect((patch.snapshots as Record<string, unknown>)['5']).toEqual([
      { type: 'dinner', recipeId: 'cur-5' },
    ]);
  });

  it('is premium-only, and capped per plan', async () => {
    vi.mocked(mealPlanTailoringRepository.findByPlanId).mockResolvedValue(partial as never);
    const service = new MealPlanService(repoWithPlan());
    await expect(service.resumeTailoring('user1', 'plan1', false)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    vi.mocked(mealPlanTailoringRepository.findByPlanId).mockResolvedValue({
      ...partial,
      resumes: 3,
    } as never);
    await expect(service.resumeTailoring('user1', 'plan1', true)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(mealPlanTailoringRepository.saveProgress).not.toHaveBeenCalled();
  });

  it('refuses a running or finished job', async () => {
    vi.mocked(mealPlanTailoringRepository.findByPlanId).mockResolvedValue({
      ...partial,
      status: 'DONE',
    } as never);
    const service = new MealPlanService(repoWithPlan());
    await expect(service.resumeTailoring('user1', 'plan1', true)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

// ─── Following: another user's recipe into your week (L-XRECIPE) ─────────────

describe('MealPlanService — Following (PRD §13, FR-17, INV-5)', () => {
  const ME = 'me';
  const THEIRS = {
    ...AI_RECIPE,
    id: 'theirs',
    name: 'Lentil dal',
    ingredients: [{ name: 'lentils', quantity: 200, unit: 'g' }],
    imageStatus: 'DONE',
    source: 'MANUAL',
    sourceUrl: 'https://www.bbcgoodfood.com/recipes/dal',
    creatorId: 'maria',
    originRecipeId: null,
    originCreatorId: null,
    hiddenAt: null,
    hiddenReason: null,
  };
  const MY_COPY = {
    ...THEIRS,
    id: 'my-copy',
    creatorId: ME,
    originRecipeId: 'theirs',
    originCreatorId: 'maria',
  };
  const WEEK = {
    id: 'plan-me',
    userId: ME,
    weekStartDate: new Date('2026-09-28'),
    days: [
      {
        dayOfWeek: 1,
        meals: [
          { type: 'breakfast', recipeId: 'ai-r1' },
          { type: 'lunch', recipeId: 'old-lunch', portion: 1.5 },
        ],
      },
    ],
  };
  const EGG_ALLERGY = { allergies: ['egg'], dietaryRestrictions: [], dislikedIngredients: [] };

  const copiesStub = () => ({
    ownedRecipeFor: vi.fn(
      async (_viewer: string, recipe: { id: string; source: string; creatorId: string | null }) =>
        recipe.source === 'MANUAL' && recipe.creatorId !== ME
          ? { recipe: MY_COPY, copiedFromId: recipe.id, created: true }
          : { recipe, copiedFromId: null, created: false },
    ),
  });
  const socialStub = (visible = true) => ({
    isEnabled: vi.fn().mockResolvedValue(true),
    recipesAccess: vi.fn().mockResolvedValue(visible ? 'visible' : 'locked'),
    hasHearted: vi.fn().mockResolvedValue(false),
  });
  const serviceWith = (
    repo: ReturnType<typeof makeRepo>,
    copies = copiesStub(),
    social = socialStub(),
  ) => new MealPlanService(repo, undefined, undefined, undefined, copies as never, social);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(householdMemberRepository.findByUserId).mockResolvedValue([]);
    vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(null);
  });

  describe('addRecipeToSlot', () => {
    it("add: another user's recipe goes in as YOUR copy, appended as your pick", async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(THEIRS);
      repo.findForWeek.mockResolvedValue(WEEK);
      repo.appendDayMeal.mockResolvedValue(2);
      const copies = copiesStub();

      const result = await serviceWith(repo, copies).addRecipeToSlot(ME, {
        recipeId: 'theirs',
        weekOffset: 0,
        dayOfWeek: 1,
        mealType: 'dinner',
        mode: 'add',
      });

      expect(copies.ownedRecipeFor).toHaveBeenCalledWith(ME, THEIRS);
      expect(repo.appendDayMeal).toHaveBeenCalledWith('plan-me', 1, 'dinner', 'my-copy', {
        pinned: true,
      });
      expect(repo.updateDayMeal).not.toHaveBeenCalled();
      expect(result).toEqual({
        planId: 'plan-me',
        dayOfWeek: 1,
        mealType: 'dinner',
        slotIndex: 2,
        addedRecipeId: 'my-copy',
        copiedFromId: 'theirs',
      });
    });

    it('replace: swaps that slot, keeps its portion, returns previousRecipeId for Undo', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(THEIRS);
      repo.findForWeek.mockResolvedValue(WEEK);

      const result = await serviceWith(repo).addRecipeToSlot(ME, {
        recipeId: 'theirs',
        weekOffset: 0,
        dayOfWeek: 1,
        mealType: 'lunch',
        mode: 'replace',
        slotIndex: 1,
      });

      expect(repo.updateDayMeal).toHaveBeenCalledWith(
        'plan-me',
        1,
        'lunch',
        'my-copy',
        1.5,
        1,
        true,
      );
      expect(result).toMatchObject({
        slotIndex: 1,
        previousRecipeId: 'old-lunch',
        previousPinned: false, // F3.1: the replaced slot wasn't a pick
      });
    });

    it('replace without a slotIndex, or at a slot of another type → BAD_REQUEST', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(THEIRS);
      repo.findForWeek.mockResolvedValue(WEEK);
      const base = { recipeId: 'theirs', weekOffset: 0, dayOfWeek: 1, mealType: 'lunch' as const };
      await expect(
        serviceWith(repo).addRecipeToSlot(ME, { ...base, mode: 'replace' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        serviceWith(repo).addRecipeToSlot(ME, { ...base, mode: 'replace', slotIndex: 0 }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(repo.updateDayMeal).not.toHaveBeenCalled();
    });

    it('an open (AI/curated) recipe needs no copy', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, source: 'AI', creatorId: null });
      repo.findForWeek.mockResolvedValue(WEEK);
      const result = await serviceWith(repo).addRecipeToSlot(ME, {
        recipeId: 'ai-r1',
        weekOffset: 1,
        dayOfWeek: 3,
        mealType: 'dinner',
        mode: 'add',
      });
      expect(result).toMatchObject({ addedRecipeId: 'ai-r1', copiedFromId: null });
    });

    it("NOT_FOUND for a recipe you can't see — nothing copied, nothing written", async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(THEIRS);
      repo.findForWeek.mockResolvedValue(WEEK);
      const copies = copiesStub();
      await expect(
        serviceWith(repo, copies, socialStub(false)).addRecipeToSlot(ME, {
          recipeId: 'theirs',
          weekOffset: 0,
          dayOfWeek: 1,
          mealType: 'dinner',
          mode: 'add',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Recipe not found.' });
      expect(copies.ownedRecipeFor).not.toHaveBeenCalled();
      expect(repo.appendDayMeal).not.toHaveBeenCalled();
    });

    it('no plan for that week → NOT_FOUND with the sheet copy; never a carry-forward write', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(THEIRS);
      repo.findForWeek.mockResolvedValue(null);
      await expect(
        serviceWith(repo).addRecipeToSlot(ME, {
          recipeId: 'theirs',
          weekOffset: 1,
          dayOfWeek: 1,
          mealType: 'dinner',
          mode: 'add',
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'You don’t have a plan for this week yet.',
      });
      expect(repo.createPlan).not.toHaveBeenCalled();
    });

    it('conflict with your table → FORBIDDEN + unsafeForTable cause; Use anyway places it', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue({
        ...THEIRS,
        ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
      });
      repo.findForWeek.mockResolvedValue(WEEK);
      vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
      const input = {
        recipeId: 'theirs',
        weekOffset: 0,
        dayOfWeek: 1,
        mealType: 'dinner' as const,
        mode: 'add' as const,
      };
      const copies = copiesStub();
      const err = await serviceWith(repo, copies)
        .addRecipeToSlot(ME, input)
        .catch((e: unknown) => e);
      expect(err).toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringMatching(/UNSAFE_FOR_TABLE.*egg/),
      });
      expect((err as { cause?: { issues?: string[] } }).cause?.issues).toEqual(['egg']);
      expect(copies.ownedRecipeFor).not.toHaveBeenCalled();

      await serviceWith(repo, copies).addRecipeToSlot(ME, { ...input, acknowledgeConflict: true });
      expect(repo.appendDayMeal).toHaveBeenCalledTimes(1);
    });

    it('an open AI recipe that conflicts is refused even when acknowledged (no Use anyway data)', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue({
        ...AI_RECIPE,
        ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
        source: 'AI',
        creatorId: null,
      });
      repo.findForWeek.mockResolvedValue(WEEK);
      vi.mocked(dietaryPreferencesRepository.findByUserId).mockResolvedValue(EGG_ALLERGY as never);
      const err = await serviceWith(repo)
        .addRecipeToSlot(ME, {
          recipeId: 'ai-r1',
          weekOffset: 0,
          dayOfWeek: 1,
          mealType: 'dinner',
          mode: 'add',
          acknowledgeConflict: true,
        })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
      expect((err as { cause?: unknown }).cause).toBeUndefined();
      expect(repo.appendDayMeal).not.toHaveBeenCalled();
    });
  });

  describe('undoAddToSlot', () => {
    it("only on the caller's own plan", async () => {
      const repo = makeRepo();
      repo.findByIdForUser.mockResolvedValue(null);
      await expect(
        serviceWith(repo).undoAddToSlot(ME, {
          planId: 'someone-elses',
          dayOfWeek: 1,
          mealType: 'dinner',
          slotIndex: 2,
          addedRecipeId: 'my-copy',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repo.findByIdForUser).toHaveBeenCalledWith(ME, 'someone-elses');
      expect(repo.removeDayMealIfMatches).not.toHaveBeenCalled();
    });

    it('add → removes the slot only while it still holds the added recipe', async () => {
      const repo = makeRepo();
      repo.findByIdForUser.mockResolvedValue(WEEK);
      await expect(
        serviceWith(repo).undoAddToSlot(ME, {
          planId: 'plan-me',
          dayOfWeek: 1,
          mealType: 'dinner',
          slotIndex: 2,
          addedRecipeId: 'my-copy',
        }),
      ).resolves.toEqual({ ok: true });
      expect(repo.removeDayMealIfMatches).toHaveBeenCalledWith(
        'plan-me',
        1,
        2,
        'my-copy',
        'dinner',
      );
    });

    it('replace → puts the previous recipe back, keeping the portion', async () => {
      const repo = makeRepo();
      repo.findByIdForUser.mockResolvedValue({
        ...WEEK,
        days: [
          {
            dayOfWeek: 1,
            meals: [
              { type: 'breakfast', recipeId: 'ai-r1' },
              { type: 'lunch', recipeId: 'my-copy', portion: 1.5, pinned: true },
            ],
          },
        ],
      });
      repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'old-lunch', source: 'AI' });
      await serviceWith(repo).undoAddToSlot(ME, {
        planId: 'plan-me',
        dayOfWeek: 1,
        mealType: 'lunch',
        slotIndex: 1,
        addedRecipeId: 'my-copy',
        previousRecipeId: 'old-lunch',
      });
      expect(repo.updateDayMeal).toHaveBeenCalledWith(
        'plan-me',
        1,
        'lunch',
        'old-lunch',
        1.5,
        1,
        true,
      );
    });

    it('F3.1: replace → restores the previous slot’s own pick flag when Undo passes it', async () => {
      const repo = makeRepo();
      repo.findByIdForUser.mockResolvedValue({
        ...WEEK,
        days: [{ dayOfWeek: 1, meals: [{ type: 'lunch', recipeId: 'my-copy', pinned: true }] }],
      });
      repo.findRecipeById.mockResolvedValue({ ...AI_RECIPE, id: 'old-lunch', source: 'AI' });
      await serviceWith(repo).undoAddToSlot(ME, {
        planId: 'plan-me',
        dayOfWeek: 1,
        mealType: 'lunch',
        slotIndex: 0,
        addedRecipeId: 'my-copy',
        previousRecipeId: 'old-lunch',
        previousPinned: false,
      });
      expect(repo.updateDayMeal).toHaveBeenCalledWith(
        'plan-me',
        1,
        'lunch',
        'old-lunch',
        undefined,
        0,
        false,
      );
    });

    it('a stale Undo (the slot changed since) is a no-op', async () => {
      const repo = makeRepo();
      repo.findByIdForUser.mockResolvedValue(WEEK); // slot 1 holds old-lunch, not my-copy
      await expect(
        serviceWith(repo).undoAddToSlot(ME, {
          planId: 'plan-me',
          dayOfWeek: 1,
          mealType: 'lunch',
          slotIndex: 1,
          addedRecipeId: 'my-copy',
          previousRecipeId: 'old-lunch',
        }),
      ).resolves.toEqual({ ok: true });
      expect(repo.updateDayMeal).not.toHaveBeenCalled();
    });

    it("Undo can't smuggle a recipe you can't see into your plan", async () => {
      const repo = makeRepo();
      repo.findByIdForUser.mockResolvedValue({
        ...WEEK,
        days: [{ dayOfWeek: 1, meals: [{ type: 'lunch', recipeId: 'my-copy' }] }],
      });
      repo.findRecipeById.mockResolvedValue({
        ...THEIRS,
        id: 'victim-private',
        creatorId: 'victim',
      });
      await expect(
        serviceWith(repo, copiesStub(), socialStub(false)).undoAddToSlot(ME, {
          planId: 'plan-me',
          dayOfWeek: 1,
          mealType: 'lunch',
          slotIndex: 0,
          addedRecipeId: 'my-copy',
          previousRecipeId: 'victim-private',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repo.updateDayMeal).not.toHaveBeenCalled();
    });
  });

  it("replaceRecipe (INV-5): another user's recipe is written as your copy", async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(WEEK);
    repo.findRecipeById.mockResolvedValue(THEIRS);
    const dto = await serviceWith(repo).replaceRecipe(ME, 'plan-me', 1, 'lunch', 'theirs', 1);
    expect(repo.updateDayMeal).toHaveBeenCalledWith('plan-me', 1, 'lunch', 'my-copy', 1.5, 1, true);
    expect(dto).toMatchObject({ id: 'my-copy', previousRecipeId: 'old-lunch' });
  });

  it('generate (INV-5): a pinned favourite of someone you follow is placed as your copy', async () => {
    const repo = makeRepo();
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([
      { recipe: THEIRS } as never,
    ]);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);
    const copies = copiesStub();

    await serviceWith(repo, copies).generate(ME, 0, true);

    expect(copies.ownedRecipeFor).toHaveBeenCalledWith(ME, THEIRS);
    const created = vi.mocked(repo.createPlan).mock.calls[0]![0] as {
      days: { meals: { recipeId: string }[] }[];
    };
    const ids = created.days.flatMap((d) => d.meals.map((m) => m.recipeId));
    expect(ids).toContain('my-copy');
    expect(ids).not.toContain('theirs');
  });

  it('F3.1 generate: a pin on an auto-hidden recipe (hearted before the hide) is skipped, never copied', async () => {
    const repo = makeRepo();
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(CHEF_PROFILE as never);
    vi.mocked(favouriteRecipeRepository.findPinnedForNextPlan).mockResolvedValue([
      { recipe: { ...THEIRS, hiddenAt: new Date('2026-09-30'), hiddenReason: 'REPORTS' } } as never,
    ]);
    vi.mocked(aiService.generateMealPlan).mockResolvedValue(AI_WEEK_PLAN as never);
    const copies = copiesStub();
    const social = socialStub();
    social.hasHearted.mockResolvedValue(true); // the heart still opens it

    await serviceWith(repo, copies, social).generate(ME, 0, true);

    expect(copies.ownedRecipeFor).not.toHaveBeenCalled();
    const created = vi.mocked(repo.createPlan).mock.calls[0]![0] as {
      days: { meals: { recipeId: string }[] }[];
    };
    const ids = created.days.flatMap((d) => d.meals.map((m) => m.recipeId));
    expect(ids).not.toContain('my-copy');
    expect(ids).not.toContain('theirs');
  });

  it('assemblePlanDto: a slot whose recipe row is gone is dropped, the week still loads', async () => {
    const repo = makeRepo();
    repo.findForWeek.mockResolvedValue({
      id: 'plan-me',
      weekStartDate: new Date('2026-09-28'),
      days: [
        {
          dayOfWeek: 0,
          meals: [
            { type: 'lunch', recipeId: 'deleted-with-its-owner' },
            { type: 'dinner', recipeId: 'ai-r1' },
          ],
        },
      ],
    });
    repo.findRecipesByIds.mockResolvedValue([{ ...AI_RECIPE, imageStatus: 'DONE' }]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const week = await new MealPlanService(repo).getForWeek(ME, 0);

    expect(week?.days[0]?.meals.map((m) => m.recipe.id)).toEqual(['ai-r1']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('deleted-with-its-owner'));
    warn.mockRestore();
  });

  describe('getRecipe attribution (additive, plan §4.2)', () => {
    const MARIA = { id: 'maria', firstName: 'Maria', lastName: 'Pop', name: null };
    const people = vi.fn();
    beforeEach(() => {
      people.mockReset().mockResolvedValue([MARIA]);
      (favouriteRecipeRepository as unknown as Record<string, unknown>)['findPeopleByIds'] = people;
    });

    it("another user's recipe: creator + sourceUrl", async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(THEIRS);
      const dto = await serviceWith(repo).getRecipe(ME, 'theirs');
      expect(dto.creator).toEqual({ id: 'maria', displayName: 'Maria Pop', firstName: 'Maria' });
      expect(dto.sourceUrl).toBe('https://www.bbcgoodfood.com/recipes/dal');
      expect(dto).not.toHaveProperty('origin');
      expect(dto).not.toHaveProperty('hidden');
    });

    it('your copy: origin with the original creator’s first name', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue(MY_COPY);
      const dto = await serviceWith(repo).getRecipe(ME, 'my-copy');
      expect(dto.origin).toEqual({ creatorFirstName: 'Maria' });
      expect(dto).not.toHaveProperty('creator');
    });

    it('your own auto-hidden recipe: hidden { reason }', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue({
        ...THEIRS,
        creatorId: ME,
        hiddenAt: new Date(),
        hiddenReason: 'REPORTS',
      });
      const dto = await serviceWith(repo).getRecipe(ME, 'theirs');
      expect(dto.hidden).toEqual({ reason: 'REPORTS' });
      expect(people).not.toHaveBeenCalled();
    });

    it('an open recipe gets no new key and no extra query', async () => {
      const repo = makeRepo();
      repo.findRecipeById.mockResolvedValue({
        ...AI_RECIPE,
        source: 'AI',
        creatorId: null,
        sourceUrl: null,
      });
      const dto = await serviceWith(repo).getRecipe(ME, 'ai-r1');
      for (const k of ['creator', 'origin', 'hidden', 'sourceUrl'])
        expect(dto).not.toHaveProperty(k);
      expect(people).not.toHaveBeenCalled();
    });
  });
});
