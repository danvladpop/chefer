import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dailyLogRepository,
  mealPlanRepository,
  SavedMealNameTakenError,
  type ISavedMealRepository,
  type SavedMeal,
} from '@chefer/database';
import { SavedMealsService } from './saved-meals.service.js';

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  dailyLogRepository: { findByDate: vi.fn() },
  mealPlanRepository: { findRecipesByIds: vi.fn().mockResolvedValue([]) },
}));

function setup(count = 0) {
  const repo = {
    listByUser: vi.fn(),
    findById: vi.fn(),
    countByUser: vi.fn().mockResolvedValue(count),
    create: vi.fn(
      async (userId: string, name: string, items: unknown): Promise<SavedMeal> => ({
        id: 's1',
        userId,
        name,
        items: items as never,
        lastLoggedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    delete: vi.fn(),
    markLogged: vi.fn(),
  } satisfies ISavedMealRepository;
  return { repo, service: new SavedMealsService(repo) };
}

const day = (entries: unknown[]) => ({ loggedMeals: entries }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavedMealsService.createFromDay', () => {
  it('snapshots the chosen meal with recipe names and totals', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(
      day([
        {
          recipeId: 'r1',
          mealType: 'breakfast',
          portionMultiplier: 1,
          kcal: 400,
          protein: 20,
          carbs: 50,
          fat: 10,
        },
        {
          custom: { name: 'Coffee', estimatedBy: 'manual' },
          mealType: 'breakfast',
          portionMultiplier: 1,
          kcal: 40,
          protein: 2,
          carbs: 4,
          fat: 1.5,
        },
        {
          custom: { name: 'Soup', estimatedBy: 'manual' },
          mealType: 'lunch',
          portionMultiplier: 1,
          kcal: 300,
          protein: 10,
          carbs: 30,
          fat: 10,
        },
      ]),
    );
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { id: 'r1', name: 'Porridge' },
    ] as never);
    const { service } = setup();
    const view = await service.createFromDay('u1', {
      name: 'Weekday breakfast',
      date: '2026-10-22',
      mealType: 'breakfast',
    });
    expect(view.items.map((i) => i.name)).toEqual(['Porridge', 'Coffee']);
    expect(view.totals).toEqual({ kcal: 440, protein: 22, carbs: 54, fat: 11.5 });
  });

  it('refuses an empty meal, a full list and a taken name', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(day([]));
    await expect(
      setup().service.createFromDay('u1', { name: 'X', date: '2026-10-22', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(
      day([
        {
          custom: { name: 'Soup', estimatedBy: 'manual' },
          mealType: 'lunch',
          portionMultiplier: 1,
          kcal: 300,
          protein: 10,
          carbs: 30,
          fat: 10,
        },
      ]),
    );
    await expect(
      setup(50).service.createFromDay('u1', { name: 'X', date: '2026-10-22', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /up to 50/ });

    const taken = setup();
    taken.repo.create.mockRejectedValue(new SavedMealNameTakenError());
    await expect(
      taken.service.createFromDay('u1', { name: 'X', date: '2026-10-22', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
