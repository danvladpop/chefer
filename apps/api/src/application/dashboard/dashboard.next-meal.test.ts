import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, mealPlanRepository } from '@chefer/database';
import { dashboardService } from './dashboard.service.js';

// Audit F-PM-10: after "Made it!" on dinner the dashboard still offered the
// same dinner as "NEXT MEAL · Start cooking". Logged meals are now skipped.

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

// 2026-09-26 is a Saturday → dayOfWeek 5 (Mon = 0).
const SATURDAY = 5;

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findActiveWithDays: vi.fn().mockResolvedValue({
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
  dailyLogRepository: { findByDate: vi.fn() },
  MealPlanOrigin: { WEEKLY_AUTO: 'WEEKLY_AUTO' },
}));

const logWith = (entries: { recipeId?: string; mealType: string; slotIndex?: number }[]) =>
  vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
    totalKcal: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    loggedMeals: entries,
  } as never);

const summaryAt = (hour: number) =>
  dashboardService.getSummary('u1', 'Ana', { localDate: '2026-09-26', localHour: hour });

describe('dashboard summary — next meal skips logged meals', () => {
  beforeEach(() => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(null);
  });

  it('by clock alone: breakfast at 7:00 (and today is Saturday)', async () => {
    const s = await summaryAt(7);
    expect(s.today.dayOfWeek).toBe(SATURDAY);
    expect(s.nextMeal?.recipe.id).toBe('oats');
    expect(s.restOfToday.map((m) => m.recipeId)).toEqual(['salad', 'curry']);
  });

  it('breakfast logged at 7:00 moves the spotlight to lunch', async () => {
    logWith([{ recipeId: 'oats', mealType: 'breakfast' }]);
    const s = await summaryAt(7);
    expect(s.nextMeal?.recipe.id).toBe('salad');
    expect(s.restOfToday.map((m) => m.recipeId)).toEqual(['curry']);
  });

  it('dinner logged via "Made it!" → tomorrow’s first meal, not the same dinner', async () => {
    logWith([{ recipeId: 'curry', mealType: 'dinner' }]);
    const s = await summaryAt(19);
    expect(s.nextMeal).toBeNull();
    expect(s.tomorrowFirstMeal?.recipe.id).toBe('pancakes');
  });

  it('carries the real cooking time (prep + cook) additively', async () => {
    const s = await summaryAt(12);
    expect(s.nextMeal?.recipe.prepTimeMins).toBe(10);
    expect(s.nextMeal?.recipe.cookTimeMins).toBe(30);
  });

  it('carries the plan slot index of today’s next meal', async () => {
    const s = await summaryAt(12);
    expect(s.nextMeal?.slotIndex).toBe(1);
  });

  describe('two identical snacks', () => {
    beforeEach(() => {
      vi.mocked(mealPlanRepository.findActiveWithDays).mockResolvedValueOnce({
        origin: 'MANUAL',
        createdAt: new Date('2026-09-21T08:00:00Z'),
        days: [
          {
            dayOfWeek: 5,
            meals: [
              { type: 'breakfast', recipeId: 'oats' },
              { type: 'snack', recipeId: 'salad' },
              { type: 'dinner', recipeId: 'curry' },
              { type: 'snack', recipeId: 'salad' },
            ],
          },
        ],
      } as never);
    });

    it('logging the first leaves the second next, with its own slot index', async () => {
      logWith([{ recipeId: 'salad', mealType: 'snack', slotIndex: 1 }]);
      const s = await summaryAt(15);
      expect(s.nextMeal?.recipe.id).toBe('salad');
      expect(s.nextMeal?.slotIndex).toBe(3);
    });

    it('a legacy entry without a slot index counts for one snack only', async () => {
      logWith([{ recipeId: 'salad', mealType: 'snack' }]);
      const s = await summaryAt(15);
      expect(s.nextMeal?.slotIndex).toBe(3);
    });
  });
});
