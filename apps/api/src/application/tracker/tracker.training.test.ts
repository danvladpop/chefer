import { describe, expect, it, vi } from 'vitest';
import { chefProfileRepository } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { dashboardService } from '../dashboard/dashboard.service.js';
import { trackerService } from './tracker.service.js';

// Audit P2-4 follow-up: the tracker shows the same training-day targets as
// Today. 2026-09-28 is a Monday; the routine plans "Full Body A" on Monday.
const LIFTER = {
  goal: 'GAIN_MUSCLE',
  weightKg: 80,
  heightCm: 180,
  age: 30,
  activityLevel: 'MODERATELY_ACTIVE',
  biologicalSex: 'MALE',
  dailyCalorieTarget: null,
  targetAdjustmentKcal: 0,
  displayName: null,
};

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn() },
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
        { plannedWeekday: 3, name: 'Full Body B' },
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

function profile(goal: string) {
  vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({ ...LIFTER, goal } as never);
}

describe('tracker.getDay — training-day targets', () => {
  it('premium, training day: the same adjusted targets as the dashboard', async () => {
    profile('GAIN_MUSCLE');
    const day = await trackerService.getDay('u1', '2026-09-28', user('PREMIUM'));
    const summary = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-28' },
      user('PREMIUM'),
    );
    expect(day.trainingDay).toMatchObject({
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: 'Full Body A',
      applied: true,
    });
    expect(day.adjustedTargets).toEqual(summary.nutrition.adjustedTargets);
    expect(day.targets.proteinG).toBe(144); // base stays 1.8 g/kg
    expect(day.adjustedTargets!.proteinG).toBe(144 + 32);
  });

  it('free, training day: the line is a locked preview and targets stay at the base', async () => {
    profile('GAIN_MUSCLE');
    const day = await trackerService.getDay('u1', '2026-09-28', user('FREE'));
    expect(day.trainingDay).toMatchObject({ isTrainingDay: true, applied: false });
    expect(day.trainingDay!.kcalBonus).toBeGreaterThanOrEqual(150);
    expect(day.adjustedTargets).toBeUndefined();
  });

  it('rest day: flagged, nothing added', async () => {
    profile('GAIN_MUSCLE');
    const day = await trackerService.getDay('u1', '2026-09-29', user('PREMIUM'));
    expect(day.trainingDay).toMatchObject({ isTrainingDay: false, kcalBonus: 0 });
    expect(day.adjustedTargets).toBeUndefined();
  });

  it('a cutting lifter gets 2.0 g/kg protein but no training-day bump', async () => {
    profile('LOSE_WEIGHT');
    const day = await trackerService.getDay('u1', '2026-09-28', user('PREMIUM'));
    expect(day.targets.proteinG).toBe(160);
    expect(day.trainingDay).toBeUndefined();
    expect(day.adjustedTargets).toBeUndefined();
  });

  it('a maintaining lifter gets 1.6 g/kg, calories unchanged', async () => {
    profile('MAINTAIN');
    const lifter = await trackerService.getDay('u1', '2026-09-29', user('FREE'));
    expect(lifter.targets.proteinG).toBe(128);
    const summary = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-29' },
      user('FREE'),
    );
    expect(summary.nutrition.protein.targetG).toBe(128);
    expect(summary.nutrition.dailyCalorieTarget).toBe(lifter.targets.dailyCalorieTarget);
  });
});
