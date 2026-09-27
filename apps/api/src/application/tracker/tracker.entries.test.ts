import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, mealPlanRepository } from '@chefer/database';
import type { LoggedMealEntry } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { trackerService } from './tracker.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// T-19.1/T-19.2/T-19.3, bug B-33/B-34: entryId edit/undo, copyDay, recents,
// and the local-day summary anchor.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findActiveWithDays: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: {
    findByDate: vi.fn(),
    findLastN: vi.fn(),
    mutateDay: vi.fn(),
  },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
}));

const FREE_USER: UserProfile = {
  id: 'u1',
  email: 'entries-test@chefer.dev',
  name: null,
  firstName: 'Test',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

/** A stored custom entry fixture. */
function customEntry(overrides: Partial<LoggedMealEntry> = {}): LoggedMealEntry {
  return {
    entryId: 'e1',
    custom: { name: 'Toast', estimatedBy: 'manual' },
    mealType: 'breakfast',
    portionMultiplier: 1,
    kcal: 300,
    protein: 10,
    carbs: 40,
    fat: 8,
    ...overrides,
  };
}

/** Wires dailyLogRepository.mutateDay to actually run `mutate` against `stored`. */
function mockMutateDay(stored: LoggedMealEntry[]) {
  vi.mocked(dailyLogRepository.mutateDay).mockImplementation(async (_userId, _date, mutate) => {
    const next = mutate(stored);
    return {
      id: 'log1',
      userId: 'u1',
      date: new Date('2026-09-27T00:00:00Z'),
      loggedMeals: next as never,
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      updatedAt: new Date(),
    };
  });
}

describe('trackerService.updateCustomMeal (bug B-34, T-19.2)', () => {
  it('edits a custom entry found by its entryId', async () => {
    mockMutateDay([
      customEntry(),
      customEntry({ entryId: 'e2', custom: { name: 'Eggs', estimatedBy: 'manual' } }),
    ]);

    const log = await trackerService.updateCustomMeal('u1', '2026-09-27', 'e1', {
      kcal: 350,
      protein: 12,
      carbs: 45,
      fat: 9,
      name: 'Toast with butter',
    });

    const meals = log.loggedMeals as unknown as LoggedMealEntry[];
    const edited = meals.find((m) => m.entryId === 'e1')!;
    expect(edited.kcal).toBe(350);
    expect(edited.custom?.name).toBe('Toast with butter');
    // The other entry is untouched.
    expect(meals.find((m) => m.entryId === 'e2')?.custom?.name).toBe('Eggs');
  });

  it('404s an unknown entryId', async () => {
    mockMutateDay([customEntry()]);
    await expect(
      trackerService.updateCustomMeal('u1', '2026-09-27', 'missing', {
        kcal: 100,
        protein: 1,
        carbs: 1,
        fat: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('404s an entryId that names a planned-recipe entry, not a custom one', async () => {
    mockMutateDay([
      {
        entryId: 'r1',
        recipeId: 'oats',
        mealType: 'breakfast',
        portionMultiplier: 1,
        kcal: 1,
        protein: 1,
        carbs: 1,
        fat: 1,
      },
    ]);
    await expect(
      trackerService.updateCustomMeal('u1', '2026-09-27', 'r1', {
        kcal: 100,
        protein: 1,
        carbs: 1,
        fat: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('trackerService.restoreCustomMeal (bug B-34, T-19.2 — the Undo snackbar)', () => {
  it('re-adds the exact entry that was deleted (AC2: restore reproduces it exactly)', async () => {
    mockMutateDay([customEntry({ entryId: 'kept' })]);
    const deleted = customEntry({ entryId: 'e1', kcal: 412 });

    const log = await trackerService.restoreCustomMeal('u1', '2026-09-27', deleted);

    const meals = log.loggedMeals as unknown as LoggedMealEntry[];
    expect(meals).toHaveLength(2);
    expect(meals.find((m) => m.entryId === 'e1')).toEqual(deleted);
  });

  it('is idempotent — restoring the same entryId twice never duplicates it', async () => {
    const stored = [customEntry({ entryId: 'e1' })];
    mockMutateDay(stored);
    const log = await trackerService.restoreCustomMeal(
      'u1',
      '2026-09-27',
      customEntry({ entryId: 'e1' }),
    );
    const meals = log.loggedMeals as unknown as LoggedMealEntry[];
    expect(meals.filter((m) => m.entryId === 'e1')).toHaveLength(1);
  });
});

describe('trackerService.copyDay (T-19.3)', () => {
  it('copies every entry from the source day, with fresh entryIds and no slotIndex', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
      id: 'log0',
      userId: 'u1',
      date: new Date('2026-09-26T00:00:00Z'),
      loggedMeals: [
        {
          recipeId: 'oats',
          slotIndex: 0,
          mealType: 'breakfast',
          portionMultiplier: 1,
          kcal: 300,
          protein: 10,
          carbs: 40,
          fat: 8,
          entryId: 'old-1',
        },
        customEntry({ entryId: 'old-2' }),
      ] as never,
      totalKcal: 500,
      totalProtein: 20,
      totalCarbs: 60,
      totalFat: 15,
      updatedAt: new Date(),
    });
    mockMutateDay([]);

    const result = await trackerService.copyDay(FREE_USER, '2026-09-26', '2026-09-27');

    expect(result.copiedEntryIds).toHaveLength(2);
    const meals = result.log.loggedMeals as unknown as LoggedMealEntry[];
    expect(meals).toHaveLength(2);
    for (const m of meals) {
      expect(m.slotIndex).toBeUndefined();
      expect(m.entryId).toBeTruthy();
      expect(['old-1', 'old-2']).not.toContain(m.entryId);
    }
  });

  it('copying an empty day is a no-op that returns no ids', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(null);
    mockMutateDay([]);
    const result = await trackerService.copyDay(FREE_USER, '2026-09-26', '2026-09-27');
    expect(result.copiedEntryIds).toEqual([]);
  });
});

describe('trackerService.recents (T-19.1)', () => {
  it('returns distinct recipe + custom entries with names/images resolved, most frequent first', async () => {
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([
      {
        id: 'l1',
        userId: 'u1',
        date: new Date('2026-09-20T00:00:00Z'),
        loggedMeals: [
          {
            recipeId: 'oats',
            mealType: 'breakfast',
            portionMultiplier: 1,
            kcal: 300,
            protein: 10,
            carbs: 40,
            fat: 8,
          },
        ] as never,
        totalKcal: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        updatedAt: new Date(),
      },
      {
        id: 'l2',
        userId: 'u1',
        date: new Date('2026-09-21T00:00:00Z'),
        loggedMeals: [
          {
            recipeId: 'oats',
            mealType: 'breakfast',
            portionMultiplier: 1,
            kcal: 300,
            protein: 10,
            carbs: 40,
            fat: 8,
          },
          customEntry({ entryId: 'c1' }),
        ] as never,
        totalKcal: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        updatedAt: new Date(),
      },
    ] as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { id: 'oats', name: 'Overnight Oats', imageUrl: 'https://x/oats.png' } as never,
    ]);

    const result = await trackerService.recents('u1');

    expect(result).toHaveLength(2);
    const oats = result.find((r) => r.recipeId === 'oats')!;
    expect(oats.name).toBe('Overnight Oats');
    expect(oats.count).toBe(2);
    const toast = result.find((r) => r.name === 'Toast')!;
    expect(toast.count).toBe(1);
  });

  it('an empty history returns an empty list', async () => {
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    expect(await trackerService.recents('u1')).toEqual([]);
    expect(mealPlanRepository.findRecipesByIds).not.toHaveBeenCalled();
  });
});

describe('trackerService.weeklySummary — local-day anchor (bug B-33, T-21.1)', () => {
  it('with no localDate, keeps the old server-UTC-anchored behaviour', async () => {
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const result = await trackerService.weeklySummary('u1');
    expect(result.days).toHaveLength(7);
    // Last day is "today" per server UTC.
    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(result.days.at(-1)!.date).toBe(todayUtc);
  });

  it('with a localDate, anchors the window there instead of the server clock', async () => {
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    const result = await trackerService.weeklySummary('u1', '2026-01-15');
    expect(result.days).toHaveLength(7);
    expect(result.days.at(-1)!.date).toBe('2026-01-15');
    expect(result.days[0]!.date).toBe('2026-01-09');
  });

  it('queries one extra day of history as a timezone-skew buffer when localDate is given', async () => {
    const findLastN = vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([]);
    await trackerService.weeklySummary('u1', '2026-01-15');
    expect(findLastN).toHaveBeenCalledWith('u1', 8);
    findLastN.mockClear();
    await trackerService.weeklySummary('u1');
    expect(findLastN).toHaveBeenCalledWith('u1', 7);
  });
});
