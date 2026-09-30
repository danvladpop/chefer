import { describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dailyLogRepository } from '@chefer/database';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { dashboardService } from './dashboard.service.js';

// UX-06: the training-week read (routine, sessions, pauses) is out of scope
// here — these users have no training days, so the summary has no extras.
vi.spyOn(trainingNutritionService, 'trainingWeek').mockResolvedValue({
  trainingDays: [],
  basis: null,
});

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
  // A set goal makes the summary compute targets, which reads the gym profile
  // and latest weight — mocked so the test never touches a real database (CI).
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
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
    const loggedDay = { loggedMeals: [{ mealType: 'breakfast', kcal: 400 }] };
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([
      loggedDay,
      loggedDay,
      loggedDay,
    ] as never);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(true);
  });

  it('is false for a goal-less user who logged only 2 of the last 7 days', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({ goal: null } as never);
    const loggedDay = { loggedMeals: [{ mealType: 'breakfast', kcal: 400 }] };
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([loggedDay, loggedDay] as never);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(false);
  });

  it('is false for a goal-less user with 3 empty log rows in the last 7 days (B-31)', async () => {
    // A DailyLog row survives with an empty loggedMeals after the user
    // removes every entry for that day (mutateDay upserts, never deletes) —
    // logged-then-cleared days must not count as "tracks".
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({ goal: null } as never);
    const emptyDay = { loggedMeals: [] };
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([
      emptyDay,
      emptyDay,
      emptyDay,
    ] as never);
    const s = await dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26' });
    expect(s.showNutritionCards).toBe(false);
  });
});
