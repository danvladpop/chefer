import { describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dailyLogRepository } from '@chefer/database';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { dashboardService } from './dashboard.service.js';

// ADR 0004: Today's date line ("Friday, September 26") is written on the
// server, so it follows the viewer's language.

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

describe("dashboard summary — the date line in the viewer's language", () => {
  const viewer = (locale: string | null) => ({ id: 'u1', locale, deviceLocale: null }) as never;

  it('stays US English for English readers and for callers without a viewer', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(profile());
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const anonymous = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(anonymous.today.date).toBe('Saturday, September 26');
    const english = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-26' },
      viewer('en'),
    );
    expect(english.today.date).toBe('Saturday, September 26');
  });

  it('is Romanian for a Romanian reader', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(profile());
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-26' },
      viewer('ro'),
    );
    expect(s.today.date).toBe('sâmbătă, 26 septembrie');
  });
});
