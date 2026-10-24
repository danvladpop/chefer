import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import {
  noopProgressRecorder,
  setProgressRecorder,
  type IProgressRecorder,
} from '../progress/progress-hooks.js';
import { trackerService } from './tracker.service.js';

// Kitchen progress hooks (tech-plan §4.2): every tracker write re-reads its day
// through the recorder, awaited and best-effort. A progress failure never fails
// the log.

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: {
    findByDate: vi.fn().mockResolvedValue(null),
    mutateDay: vi.fn().mockResolvedValue({ id: 'log' }),
    mutateDayState: vi.fn().mockResolvedValue({ id: 'log', skippedSlots: [] }),
  },
}));
vi.mock('../recipe/recipe-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recipe/recipe-access.js')>()),
  findRecipeVisibleTo: vi.fn(() =>
    Promise.resolve({ id: 'r1', name: 'Oats', nutritionInfo: { calories: 300 } }),
  ),
}));

const FREE: UserProfile = {
  id: 'u1',
  email: 'ana@chefer.dev',
  name: null,
  firstName: 'Ana',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

const recorder = (over: Partial<IProgressRecorder> = {}): IProgressRecorder => ({
  ...noopProgressRecorder,
  onDayChanged: vi.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  setProgressRecorder(noopProgressRecorder);
});

describe('tracker progress hooks', () => {
  it('logRecipe records the day it wrote', async () => {
    const spy = recorder();
    setProgressRecorder(spy);
    await trackerService.logRecipe(FREE, '2026-10-22', {
      recipeId: 'r1',
      mealType: 'breakfast',
      portionMultiplier: 1,
    });
    expect(spy.onDayChanged).toHaveBeenCalledWith('u1', '2026-10-22');
  });

  it.each([
    ['upsertDay', () => trackerService.upsertDay(FREE, '2026-10-22', [])],
    [
      'logCustomMeal',
      () =>
        trackerService.logCustomMeal(FREE, '2026-10-22', {
          name: 'Toast',
          estimatedBy: 'manual',
          mealType: 'breakfast',
          kcal: 200,
          protein: 6,
          carbs: 30,
          fat: 5,
        }),
    ],
    [
      'skipSlot',
      () => trackerService.skipSlot(FREE, '2026-10-22', { mealType: 'lunch', slotIndex: 1 }),
    ],
    [
      'unskipSlot',
      () => trackerService.unskipSlot('u1', '2026-10-22', { mealType: 'lunch', slotIndex: 1 }),
    ],
    [
      'unlogRecipe',
      () =>
        trackerService.unlogRecipe('u1', '2026-10-22', { recipeId: 'r1', mealType: 'breakfast' }),
    ],
    ['deleteEntries', () => trackerService.deleteEntries('u1', '2026-10-22', ['a'])],
    ['copyDay', () => trackerService.copyDay(FREE, '2026-10-21', '2026-10-22')],
  ])('%s records its day, and a hook failure never fails it', async (_name, run) => {
    const spy = recorder({ onDayChanged: vi.fn().mockRejectedValue(new Error('ledger down')) });
    setProgressRecorder(spy);
    await expect(run()).resolves.toBeDefined();
    expect(spy.onDayChanged).toHaveBeenCalledTimes(1);
    expect(spy.onDayChanged).toHaveBeenCalledWith('u1', '2026-10-22');
  });

  it('deleteCustomMeal records the day too (a removal can complete a full day through skips)', async () => {
    const spy = recorder();
    setProgressRecorder(spy);
    vi.mocked(dailyLogRepository.mutateDay).mockImplementationOnce((_u, _d, mutate) => {
      mutate([{ entryId: 'e1', custom: { name: 'x', estimatedBy: 'manual' } } as never]);
      return Promise.resolve({ id: 'log' } as never);
    });
    await trackerService.deleteCustomMeal('u1', '2026-10-22', { entryId: 'e1' });
    expect(spy.onDayChanged).toHaveBeenCalledWith('u1', '2026-10-22');
  });
});
