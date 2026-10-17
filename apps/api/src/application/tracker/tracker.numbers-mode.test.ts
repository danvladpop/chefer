import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, mealPlanRepository } from '@chefer/database';
import { trackerService } from './tracker.service.js';

// WP-08: tracker.getDay carries numbersMode and the per-meal protein guide.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: { findByDate: vi.fn().mockResolvedValue(null), mutateDay: vi.fn() },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
}));

const recipe = (id: string, protein: number) => ({
  id,
  name: id,
  imageUrl: null,
  nutritionInfo: { calories: 500, protein, carbs: 50, fat: 15 },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(null);
  vi.mocked(mealPlanRepository.findForWeek).mockResolvedValue(null);
});

describe('trackerService.getDay — numbersMode and proteinGuide (WP-08)', () => {
  it('defaults to FULL with a 3-meal guide when there is no plan', async () => {
    const day = await trackerService.getDay('u1', '2026-10-02');
    expect(day.numbersMode).toBe('FULL');
    expect(day.proteinGuide).toMatchObject({ meals: 3, proteinG: day.targets.proteinG });
    // The shape older clients read is untouched.
    expect(day.targets).toEqual(
      expect.objectContaining({
        dailyCalorieTarget: expect.any(Number),
        proteinG: expect.any(Number),
      }),
    );
  });

  it('divides the target across the planned meals and returns PROTEIN_ONLY', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      numbersMode: 'PROTEIN_ONLY',
    } as never);
    vi.mocked(mealPlanRepository.findForWeek).mockResolvedValue({
      id: 'plan1',
      days: [
        {
          dayOfWeek: 4, // 2026-10-02 is a Friday
          meals: [
            { type: 'breakfast', recipeId: 'a' },
            { type: 'lunch', recipeId: 'b' },
          ],
        },
      ],
    } as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      recipe('a', 30),
      recipe('b', 40),
    ] as never);
    const day = await trackerService.getDay('u1', '2026-10-02');
    expect(day.numbersMode).toBe('PROTEIN_ONLY');
    expect(day.plannedMeals).toHaveLength(2);
    expect(day.proteinGuide?.meals).toBe(2);
  });
});
