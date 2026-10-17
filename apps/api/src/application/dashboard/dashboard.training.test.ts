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
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  favouriteRecipeRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  dailyLogRepository: {
    findByDate: vi.fn().mockResolvedValue(null),
    findLastN: vi.fn().mockResolvedValue([]),
  },
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
  // UX-06 (T-06.3): the refuel snacks run through the safety filter, which
  // reads the owner's rules, the household and reported recipes.
  dietaryPreferencesRepository: {
    findByUserId: vi.fn().mockResolvedValue({
      allergies: ['dairy'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
      excludeLabelDependent: false,
      safetyReviewedAt: null,
    }),
  },
  householdMemberRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  safetyReportRepository: { findRecipeIdsByUser: vi.fn().mockResolvedValue([]) },
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

  it('free, training day: the bump is applied too (WP-07: training-day targets are free)', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-28' },
      user('FREE'),
    );
    expect(s.nutrition.trainingDay).toMatchObject({ isTrainingDay: true, applied: true });
    expect(s.nutrition.trainingDay!.kcalBonus).toBeGreaterThanOrEqual(150);
    expect(s.nutrition.adjustedTargets).toBeDefined();
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

  it('T-06.3: a lifter gets a 7-column week glance with the routine days marked', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-30' },
      user('FREE'),
    );
    expect(s.weekGlance).toHaveLength(7);
    expect(s.weekGlance?.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const trained = s.weekGlance?.filter((d) => d.training).map((d) => d.dayOfWeek);
    expect(trained).toEqual([0, 2]);
    expect(s.weekGlance?.[0]?.training).toMatchObject({
      kind: 'lift',
      status: 'planned',
      workoutName: 'Full Body A',
    });
  });

  it('T-06.3 / AC4: refuel snacks are two, and none is dairy for a dairy allergy', async () => {
    const s = await dashboardService.getSummary(
      'u1',
      'Ana',
      { localDate: '2026-09-30' },
      user('FREE'),
    );
    expect(s.refuelSnacks).toHaveLength(2);
    const ids = s.refuelSnacks?.map((x) => x.id) ?? [];
    expect(ids).not.toContain('greek-yogurt');
    expect(ids).not.toContain('cottage-cheese');
    expect(ids).not.toContain('protein-shake');
  });
});
