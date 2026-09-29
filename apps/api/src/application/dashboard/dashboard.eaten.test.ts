import { describe, expect, it, vi } from 'vitest';
import { dailyLogRepository } from '@chefer/database';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { dashboardService } from './dashboard.service.js';

// UX-06: the training-week read (routine, sessions, pauses) is out of scope
// here — these users have no training days, so the summary has no extras.
vi.spyOn(trainingNutritionService, 'trainingWeek').mockResolvedValue({
  trainingDays: [],
  basis: null,
});

// Audit F-DASH-1-2: the home ring showed planned food only ("540 remaining"
// with 6,070 kcal eaten). The summary now carries what was logged today.
vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  favouriteRecipeRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  dailyLogRepository: {
    findByDate: vi.fn().mockResolvedValue({
      totalKcal: 6070,
      totalProtein: 210.4,
      totalCarbs: 640.2,
      totalFat: 280.6,
    }),
    findLastN: vi.fn().mockResolvedValue([]),
  },
  MealPlanOrigin: { WEEKLY_AUTO: 'WEEKLY_AUTO' },
}));

describe('dashboard summary — eaten today', () => {
  it("reports the day's logged totals for the client's local date", async () => {
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.nutrition.eatenKcal).toBe(6070);
    expect(s.nutrition.protein.eaten).toBe(210);
    expect(s.nutrition.fat.eaten).toBe(281);
    const [, date] = vi.mocked(dailyLogRepository.findByDate).mock.calls[0]!;
    expect(date.toISOString().slice(0, 10)).toBe('2026-09-26');
  });
});
