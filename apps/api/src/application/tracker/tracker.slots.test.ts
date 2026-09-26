import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, type LoggedMealEntry } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { trackerService } from './tracker.service.js';

// Two identical snacks used to tick together: log entries were keyed by
// recipe + meal type. Entries now carry the plan slot they came from.

const YOGURT = {
  id: 'yogurt',
  name: 'Greek Yogurt',
  imageUrl: null,
  nutritionInfo: { calories: 150, protein: 15, carbs: 10, fat: 5 },
};

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findActiveWithDays: vi.fn().mockResolvedValue({
      id: 'plan1',
      days: [
        {
          // 2026-09-26 is a Saturday → 5
          dayOfWeek: 5,
          meals: [
            { type: 'snack', recipeId: 'yogurt' },
            { type: 'lunch', recipeId: 'gone' },
            { type: 'snack', recipeId: 'yogurt' },
          ],
        },
      ],
    }),
    findRecipesByIds: vi.fn().mockResolvedValue([
      {
        id: 'yogurt',
        name: 'Greek Yogurt',
        imageUrl: null,
        nutritionInfo: { calories: 150, protein: 15, carbs: 10, fat: 5 },
      },
    ]),
  },
  dailyLogRepository: { findByDate: vi.fn().mockResolvedValue(null), mutateDay: vi.fn() },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../recipe/recipe-access.js', () => ({
  findRecipeVisibleTo: vi.fn(() => Promise.resolve(YOGURT)),
}));

const FREE: UserProfile = {
  id: 'u1',
  email: 'ana@chefer.dev',
  name: null,
  firstName: 'Ana',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

/** Runs logRecipe against `stored` and returns the day it would write. */
async function logOnto(
  stored: LoggedMealEntry[],
  input: { recipeId: string; mealType: string; portionMultiplier: number; slotIndex?: number },
): Promise<LoggedMealEntry[]> {
  let written: LoggedMealEntry[] = [];
  vi.mocked(dailyLogRepository.mutateDay).mockImplementation((_u, _d, mutate) => {
    written = mutate(stored);
    return Promise.resolve({} as never);
  });
  await trackerService.logRecipe(FREE, '2026-09-26', input);
  return written;
}

const entry = (slotIndex?: number): LoggedMealEntry => ({
  recipeId: 'yogurt',
  mealType: 'snack',
  ...(slotIndex !== undefined && { slotIndex }),
  portionMultiplier: 1,
  kcal: 150,
  protein: 15,
  carbs: 10,
  fat: 5,
});

describe('tracker — two identical snacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDay gives each planned meal its plan slot index (skipped slots keep theirs)', async () => {
    const day = await trackerService.getDay('u1', '2026-09-26');
    expect(day.plannedMeals.map((m) => m.slotIndex)).toEqual([0, 2]);
  });

  it('logRecipe with a slotIndex keeps the other snack’s entry', async () => {
    const day = await logOnto([entry(0)], {
      recipeId: 'yogurt',
      mealType: 'snack',
      portionMultiplier: 1,
      slotIndex: 2,
    });
    expect(day.map((e) => e.slotIndex)).toEqual([0, 2]);
  });

  it('logRecipe with a slotIndex is still idempotent for that slot', async () => {
    const day = await logOnto([entry(0), entry(2)], {
      recipeId: 'yogurt',
      mealType: 'snack',
      portionMultiplier: 1,
      slotIndex: 2,
    });
    expect(day.map((e) => e.slotIndex)).toEqual([0, 2]);
  });

  it('logRecipe without a slotIndex (cook mode, older apps) keeps the old rule', async () => {
    const day = await logOnto([entry(0), entry(2)], {
      recipeId: 'yogurt',
      mealType: 'snack',
      portionMultiplier: 1,
    });
    expect(day).toHaveLength(1);
    expect(day[0]).not.toHaveProperty('slotIndex');
  });
});
