import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dietaryPreferencesRepository } from '@chefer/database';
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
  };
}

const AI_RECIPE = {
  id: 'ai-r1',
  name: 'Miso Salmon',
  description: 'd',
  ingredients: [{ name: 'salmon', quantity: 200, unit: 'g' }],
  instructions: ['cook'],
  nutritionInfo: { calories: 600, protein: 40, carbs: 30, fat: 25, fiber: 4 },
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
