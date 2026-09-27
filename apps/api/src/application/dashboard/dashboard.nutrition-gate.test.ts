import { describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dailyLogRepository } from '@chefer/database';
import { dashboardService } from './dashboard.service.js';

// B-31 interim (T-00.12): the ring, weight card, profile nudge and Snap-to-log
// assume a goal. A user who never set one and never logs anything is shown a
// blank slate instead of a meaningless/zeroed ring.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn() },
  mealPlanRepository: { findForWeek: vi.fn().mockResolvedValue(null), findRecipesByIds: vi.fn() },
  favouriteRecipeRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  dailyLogRepository: { findByDate: vi.fn().mockResolvedValue(null), findLastN: vi.fn() },
  MealPlanOrigin: { WEEKLY_AUTO: 'WEEKLY_AUTO' },
}));

describe('dashboard summary — showNutritionCards (B-31 interim, T-00.12)', () => {
  it('is false for a goal-less user who has not logged in the last 7 days', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({ goal: null } as never);
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(false);
  });

  it('is true once a goal is set, even with no tracking history', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      goal: 'LOSE_WEIGHT',
    } as never);
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(true);
  });

  it('is true for a goal-less user who logged on 3 of the last 7 days (rev 2: the ring stays home)', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({ goal: null } as never);
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([{}, {}, {}] as never);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(true);
  });

  it('is false for a goal-less user who logged only 2 of the last 7 days', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({ goal: null } as never);
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([{}, {}] as never);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(false);
  });
});
