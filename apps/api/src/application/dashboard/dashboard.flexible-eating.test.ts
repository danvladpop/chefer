import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository } from '@chefer/database';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { dashboardService } from './dashboard.service.js';

vi.spyOn(trainingNutritionService, 'trainingWeek').mockResolvedValue({
  trainingDays: [],
  basis: null,
});

// WP-06: a replaced slot ("Ate something else") is eaten with the
// replacement's numbers and leaves the day's planned totals; a skipped slot is
// neither eaten nor remaining. Today reads both from the day log.

const { recipe } = vi.hoisted(() => ({
  recipe: (id: string, name: string, kcal: number) => ({
    id,
    name,
    description: `${name} description`,
    imageUrl: null,
    servings: 1,
    prepTimeMins: 10,
    cookTimeMins: 30,
    nutritionInfo: { calories: kcal, protein: 20, carbs: 30, fat: 10 },
  }),
}));

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    // 2026-09-26 is a Saturday → dayOfWeek 5.
    findForWeek: vi.fn().mockResolvedValue({
      id: 'plan1',
      origin: 'MANUAL',
      createdAt: new Date('2026-09-21T08:00:00Z'),
      days: [
        {
          dayOfWeek: 5,
          meals: [
            { type: 'breakfast', recipeId: 'oats' },
            { type: 'lunch', recipeId: 'salad' },
            { type: 'dinner', recipeId: 'curry' },
          ],
        },
        { dayOfWeek: 6, meals: [{ type: 'breakfast', recipeId: 'pancakes' }] },
      ],
    }),
    findRecipesByIds: vi
      .fn()
      .mockResolvedValue([
        recipe('oats', 'Overnight Oats', 400),
        recipe('salad', 'Greek Salad', 550),
        recipe('curry', 'Lentil Curry', 700),
        recipe('pancakes', 'Pancakes', 500),
      ]),
  },
  favouriteRecipeRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
  mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  dailyLogRepository: { findByDate: vi.fn(), findLastN: vi.fn().mockResolvedValue([]) },
  MealPlanOrigin: { WEEKLY_AUTO: 'WEEKLY_AUTO' },
}));

const shawarma = {
  entryId: 'r1',
  custom: { name: 'Shawarma', estimatedBy: 'manual' },
  mealType: 'dinner',
  replacesSlot: { mealType: 'dinner', slotIndex: 2 },
  portionMultiplier: 1,
  kcal: 775,
  protein: 40,
  carbs: 0,
  fat: 0,
};

const logWith = (loggedMeals: unknown[], skippedSlots: unknown[] = [], totalKcal = 0) =>
  vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
    totalKcal,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    loggedMeals,
    skippedSlots,
  } as never);

const summary = (hour: number) =>
  dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26', localHour: hour });

describe('dashboard summary — flexible eating', () => {
  beforeEach(() => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(null);
  });

  it('with nothing replaced or skipped every slot is planned and the totals are the whole plan', async () => {
    const s = await summary(7);
    expect(s.today.slots?.map((x) => x.status)).toEqual(['planned', 'planned', 'planned']);
    expect(s.nutrition.plannedKcal).toBe(1650);
  });

  it('a replaced dinner is eaten with the replacement’s numbers, out of the planned totals', async () => {
    logWith([shawarma], [], 775);
    const s = await summary(18);
    expect(s.nutrition.eatenKcal).toBe(775);
    expect(s.nutrition.plannedKcal).toBe(950); // oats + salad: the curry left the plan
    expect(s.nextMeal).toBeNull();
    expect(s.restOfToday).toEqual([]);
    const dinner = s.today.slots?.find((x) => x.slotIndex === 2);
    expect(dinner).toMatchObject({
      status: 'replaced',
      replacedBy: { entryId: 'r1', name: 'Shawarma', kcal: 775, protein: 40 },
    });
  });

  it('Tonight reads a replaced dinner as done', async () => {
    logWith([shawarma], [], 775);
    const s = await dashboardService.getSummary('u1', 'Ana', {
      localDate: '2026-09-26',
      localHour: 18,
      include: ['tonight'],
    });
    expect(s.tonight?.done).toBe(true);
  });

  it('a skipped lunch is neither next, remaining nor eaten, and leaves the planned totals', async () => {
    logWith([], [{ mealType: 'lunch', slotIndex: 1 }]);
    const s = await summary(11);
    expect(s.nextMeal?.recipe.id).toBe('curry');
    expect(s.restOfToday).toEqual([]);
    expect(s.nutrition.eatenKcal).toBe(0);
    expect(s.nutrition.plannedKcal).toBe(1100); // oats + curry
    expect(s.today.slots?.map((x) => x.status)).toEqual(['planned', 'skipped', 'planned']);
  });

  it('a row written before the skippedSlots column existed still reads fine', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      loggedMeals: [],
    } as never);
    const s = await summary(7);
    expect(s.today.slots?.every((x) => x.status === 'planned')).toBe(true);
  });
});
