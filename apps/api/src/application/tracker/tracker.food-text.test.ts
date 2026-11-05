import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository } from '@chefer/database';
import type { DailyLog, LoggedMealEntry } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { trackerService } from './tracker.service.js';

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: { mutateDay: vi.fn() },
}));

const USER = { id: 'u1', planTier: 'FREE', role: 'USER' } as UserProfile;

describe('trackerService.logItems (lane A4)', () => {
  let stored: LoggedMealEntry[] = [];
  beforeEach(() => {
    stored = [];
    vi.mocked(dailyLogRepository.mutateDay).mockImplementation(async (_u, _d, mutate) => {
      stored = mutate(stored);
      return { loggedMeals: stored } as unknown as DailyLog;
    });
  });

  it('appends every reviewed item as a custom entry and returns their ids', async () => {
    const result = await trackerService.logItems(USER, '2026-10-23', {
      mealType: 'breakfast',
      items: [
        {
          name: 'Egg, 100 g',
          estimatedBy: 'manual',
          kcal: 143,
          protein: 12.6,
          carbs: 0.7,
          fat: 9.5,
        },
        {
          name: 'Mystery stew, 300 g',
          estimatedBy: 'vision',
          kcal: 360,
          protein: 0,
          carbs: 40,
          fat: 12,
          unknownMacros: ['protein'],
        },
        {
          name: 'Mills Granola, 45 g',
          estimatedBy: 'manual',
          kcal: 203,
          protein: 4.5,
          carbs: 27,
          fat: 8.1,
          product: { id: 'p1', grams: 45 },
        },
      ],
    });
    expect(result.entryIds).toHaveLength(3);
    expect(stored.map((e) => [e.mealType, e.custom?.estimatedBy])).toEqual([
      ['breakfast', 'manual'],
      ['breakfast', 'vision'],
      ['breakfast', 'manual'],
    ]);
    expect(stored[1]!.unknownMacros).toEqual(['protein']);
    expect(stored[2]!.product).toEqual({ id: 'p1', grams: 45 });
  });
});
