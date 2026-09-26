import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { dashboardService } from './dashboard.service.js';

// Audit P2-4: training-aware targets on the dashboard summary. 2026-09-28 is
// a Monday; the routine plans "Full Body A" on Monday (weekday 0).
vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: {
    findByUserId: vi.fn().mockResolvedValue({
      goal: 'GAIN_MUSCLE',
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activityLevel: 'MODERATELY_ACTIVE',
      biologicalSex: 'MALE',
      dailyCalorieTarget: null,
      targetAdjustmentKcal: 0,
      displayName: null,
    }),
  },
  mealPlanRepository: {
    findActiveWithDays: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  favouriteRecipeRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  dailyLogRepository: { findByDate: vi.fn().mockResolvedValue(null) },
  gymProfileRepository: {
    findByUserId: vi.fn().mockResolvedValue({ setupCompletedAt: new Date('2026-09-01') }),
  },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue({ weightKg: 80 }) },
  routineRepository: {
    findActive: vi.fn().mockResolvedValue({
      days: [
        { plannedWeekday: 0, name: 'Full Body A' },
        { plannedWeekday: 2, name: 'Full Body B' },
      ],
    }),
  },
  workoutSessionRepository: { findCompleted: vi.fn().mockResolvedValue([]) },
  trainingPauseRepository: { listForUser: vi.fn().mockResolvedValue([]) },
  MealPlanOrigin: { WEEKLY_AUTO: 'WEEKLY_AUTO' },
}));

const user = (planTier: 'FREE' | 'PREMIUM'): UserProfile => ({
  id: 'u1',
  email: 'lifter@chefer.dev',
  name: null,
  firstName: 'Ana',
  role: 'USER',
  planTier,
  image: null,
});

describe('dashboard summary — training-aware nutrition', () => {
  it('bases a lifter protein target on 1.8 g/kg for every tier', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-30' },
      user('FREE'),
    );
    expect(s.nutrition.protein.targetG).toBe(144);
  });

  it('premium, training day: the bump is applied as adjusted targets', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-28' },
      user('PREMIUM'),
    );
    const t = s.nutrition.trainingDay!;
    expect(t).toMatchObject({
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: 'Full Body A',
      proteinBonus: 32,
      applied: true,
    });
    expect(s.nutrition.adjustedTargets).toEqual({
      dailyCalorieTarget: s.nutrition.dailyCalorieTarget + t.kcalBonus,
      proteinG: 144 + 32,
      carbsG: s.nutrition.carbs.targetG + Math.round((t.kcalBonus - 32 * 4) / 4),
      fatG: s.nutrition.fat.targetG,
    });
  });

  it('free, training day: a preview only — no adjusted targets', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-28' },
      user('FREE'),
    );
    expect(s.nutrition.trainingDay).toMatchObject({ isTrainingDay: true, applied: false });
    expect(s.nutrition.trainingDay!.kcalBonus).toBeGreaterThanOrEqual(150);
    expect(s.nutrition.adjustedTargets).toBeUndefined();
  });

  it('rest day: flagged, nothing added', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-29' },
      user('PREMIUM'),
    );
    expect(s.nutrition.trainingDay).toMatchObject({ isTrainingDay: false, kcalBonus: 0 });
    expect(s.nutrition.adjustedTargets).toBeUndefined();
  });
});
