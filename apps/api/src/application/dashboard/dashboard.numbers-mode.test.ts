import { describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dailyLogRepository } from '@chefer/database';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { dashboardService } from './dashboard.service.js';

// WP-08: numbersMode + the per-meal protein guide ride on dashboard.summary
// so a protein-only Today needs no extra round trip. Additive: the fields
// older clients read are unchanged.

vi.spyOn(trainingNutritionService, 'trainingWeek').mockResolvedValue({
  trainingDays: [],
  basis: null,
});

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn() },
  mealPlanRepository: { findForWeek: vi.fn().mockResolvedValue(null), findRecipesByIds: vi.fn() },
  favouriteRecipeRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  dailyLogRepository: { findByDate: vi.fn().mockResolvedValue(null), findLastN: vi.fn() },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
  MealPlanOrigin: { WEEKLY_AUTO: 'WEEKLY_AUTO' },
}));

const profile = (over: Record<string, unknown> = {}) =>
  ({
    goal: 'MAINTAIN',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 75,
    activityLevel: 'MODERATELY_ACTIVE',
    ...over,
  }) as never;

describe('dashboard summary — numbersMode and proteinGuide (WP-08)', () => {
  it('defaults to FULL and still carries a guide (no plan = 3 meals)', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(profile());
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.numbersMode).toBe('FULL');
    expect(s.proteinGuide.meals).toBe(3);
    expect(s.proteinGuide.proteinG).toBe(s.nutrition.protein.targetG);
    expect(s.proteinGuide.label).toMatch(/^\d+–\d+ g per meal$/);
  });

  it('returns PROTEIN_ONLY from the stored profile without changing showNutrition', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(
      profile({ numbersMode: 'PROTEIN_ONLY', showNutritionOnToday: true }),
    );
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.numbersMode).toBe('PROTEIN_ONLY');
    expect(s.showNutrition).toBe(true);
    expect(s.nutrition.dailyCalorieTarget).toBeGreaterThan(0);
  });

  it('keeps the reserved NONE as stored (clients map it to FULL)', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(
      profile({ numbersMode: 'NONE' }),
    );
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.numbersMode).toBe('NONE');
  });
});
