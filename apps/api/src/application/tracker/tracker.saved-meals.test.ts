import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, savedMealRepository } from '@chefer/database';
import type { DailyLog, LoggedMealEntry } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { trackerService } from './tracker.service.js';

// Lane A2: logSavedMeal and copyMeal append fresh entries and return their
// ids for Undo; copying a meal onto itself is refused.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: { findByDate: vi.fn(), mutateDay: vi.fn() },
  savedMealRepository: { findById: vi.fn(), markLogged: vi.fn() },
}));

const USER = { id: 'u1', planTier: 'FREE', role: 'USER' } as UserProfile;
let stored: LoggedMealEntry[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  stored = [];
  vi.mocked(dailyLogRepository.mutateDay).mockImplementation(async (_u, _d, mutate) => {
    stored = mutate(stored);
    return { loggedMeals: stored } as unknown as DailyLog;
  });
});

describe('trackerService.logSavedMeal', () => {
  it('appends the items for the chosen meal, returns their ids and marks the meal used', async () => {
    vi.mocked(savedMealRepository.findById).mockResolvedValue({
      id: 's1',
      items: [
        {
          recipeId: 'r1',
          name: 'Oats',
          portionMultiplier: 1,
          kcal: 400,
          protein: 20,
          carbs: 50,
          fat: 10,
        },
        {
          name: 'Coffee',
          estimatedBy: 'manual',
          portionMultiplier: 1,
          kcal: 40,
          protein: 2,
          carbs: 4,
          fat: 1.5,
        },
      ],
    } as never);
    const result = await trackerService.logSavedMeal(USER, '2026-10-22', {
      savedMealId: 's1',
      mealType: 'snack',
    });
    expect(result.entryIds).toHaveLength(2);
    expect(stored.map((e) => [e.mealType, e.recipeId ?? e.custom?.name])).toEqual([
      ['snack', 'r1'],
      ['snack', 'Coffee'],
    ]);
    expect(savedMealRepository.markLogged).toHaveBeenCalledWith('u1', 's1');
  });

  it("answers NOT_FOUND for a missing or someone else's saved meal", async () => {
    vi.mocked(savedMealRepository.findById).mockResolvedValue(null);
    await expect(
      trackerService.logSavedMeal(USER, '2026-10-22', { savedMealId: 'x', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('trackerService.copyMeal', () => {
  it('copies only that meal, to the target day and meal, and returns the copy ids', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
      loggedMeals: [
        {
          entryId: 'a',
          custom: { name: 'Soup', estimatedBy: 'manual' },
          mealType: 'lunch',
          portionMultiplier: 1,
          kcal: 300,
          protein: 10,
          carbs: 30,
          fat: 10,
        },
        {
          entryId: 'b',
          custom: { name: 'Toast', estimatedBy: 'manual' },
          mealType: 'breakfast',
          portionMultiplier: 1,
          kcal: 200,
          protein: 5,
          carbs: 30,
          fat: 5,
        },
      ],
    } as never);
    const result = await trackerService.copyMeal(USER, {
      fromDate: '2026-10-21',
      fromMealType: 'lunch',
      toDate: '2026-10-22',
      toMealType: 'dinner',
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ mealType: 'dinner', custom: { name: 'Soup' } });
    expect(result.copiedEntryIds).toEqual([stored[0]!.entryId]);
    expect(stored[0]!.entryId).not.toBe('a');
  });

  it('refuses copying a meal onto itself', async () => {
    await expect(
      trackerService.copyMeal(USER, {
        fromDate: '2026-10-22',
        fromMealType: 'lunch',
        toDate: '2026-10-22',
        toMealType: 'lunch',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
