import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, mealPlanRepository } from '@chefer/database';
import type { LoggedMealEntry, SlotRefJson } from '@chefer/database';
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
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: {
    findByDate: vi.fn(),
    findLastN: vi.fn(),
    mutateDay: vi.fn(),
    mutateDayState: vi.fn(),
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

/**
 * Wires dailyLogRepository.mutateDay AND mutateDayState to actually run
 * `mutate` against `stored` (and `skipped`, for the state variant).
 */
function mockMutateDay(stored: LoggedMealEntry[], skipped: SlotRefJson[] = []) {
  const row = (next: LoggedMealEntry[], skippedSlots: SlotRefJson[]) => ({
    id: 'log1',
    userId: 'u1',
    date: new Date('2026-09-27T00:00:00Z'),
    loggedMeals: next as never,
    skippedSlots: skippedSlots as never,
    totalKcal: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    updatedAt: new Date(),
  });
  vi.mocked(dailyLogRepository.mutateDay).mockImplementation(async (_userId, _date, mutate) =>
    row(mutate(stored), skipped),
  );
  vi.mocked(dailyLogRepository.mutateDayState).mockImplementation(
    async (_userId, _date, mutate) => {
      const next = mutate({ entries: stored, skippedSlots: skipped });
      return row(next.entries, next.skippedSlots);
    },
  );
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
      skippedSlots: [],
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

/** A stored planned-recipe entry fixture. */
function recipeEntry(overrides: Partial<LoggedMealEntry> = {}): LoggedMealEntry {
  return {
    recipeId: 'curry',
    mealType: 'dinner',
    portionMultiplier: 1,
    kcal: 500,
    protein: 20,
    carbs: 50,
    fat: 15,
    ...overrides,
  };
}

describe('trackerService.unlogRecipe (T-19.4, one-save model)', () => {
  it('bug B-23: removes exactly the slot logRecipe would have written (by slotIndex)', async () => {
    const stored = [
      recipeEntry({ slotIndex: 0 }),
      recipeEntry({ slotIndex: 1, mealType: 'lunch' }),
    ];
    mockMutateDay(stored);
    const log = await trackerService.unlogRecipe('u1', '2026-09-27', {
      recipeId: 'curry',
      mealType: 'dinner',
      slotIndex: 0,
    });
    expect(log.loggedMeals as unknown as LoggedMealEntry[]).toHaveLength(1);
    expect((log.loggedMeals as unknown as LoggedMealEntry[])[0]!.slotIndex).toBe(1);
  });

  it('falls back to recipeId + mealType when no slotIndex is given (cook mode)', async () => {
    mockMutateDay([recipeEntry(), customEntry()]);
    const log = await trackerService.unlogRecipe('u1', '2026-09-27', {
      recipeId: 'curry',
      mealType: 'dinner',
    });
    const remaining = log.loggedMeals as unknown as LoggedMealEntry[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.custom?.name).toBe('Toast');
  });

  it('is a no-op (not an error) when nothing matches — an already-unticked row', async () => {
    mockMutateDay([customEntry()]);
    const log = await trackerService.unlogRecipe('u1', '2026-09-27', {
      recipeId: 'nope',
      mealType: 'dinner',
    });
    expect(log.loggedMeals as unknown as LoggedMealEntry[]).toHaveLength(1);
  });
});

describe('trackerService.deleteEntries (T-19.3 — undoes copyDay by id)', () => {
  it('removes exactly the entries named, recipe or custom alike', async () => {
    const stored = [
      recipeEntry({ entryId: 'a' }),
      customEntry({ entryId: 'b' }),
      customEntry({ entryId: 'c', custom: { name: 'kept', estimatedBy: 'manual' } }),
    ];
    mockMutateDay(stored);
    const log = await trackerService.deleteEntries('u1', '2026-09-27', ['a', 'b']);
    const remaining = log.loggedMeals as unknown as LoggedMealEntry[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.entryId).toBe('c');
  });

  it('is idempotent — an id that matches nothing is silently ignored', async () => {
    mockMutateDay([customEntry({ entryId: 'a' })]);
    const log = await trackerService.deleteEntries('u1', '2026-09-27', ['does-not-exist']);
    expect(log.loggedMeals as unknown as LoggedMealEntry[]).toHaveLength(1);
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

describe('trackerService.deleteCustomMeal (UX-FOOD-17 — by entryId, index for old clients)', () => {
  const stored = () => [
    customEntry({ entryId: 'a', custom: { name: 'A', estimatedBy: 'manual' } }),
    {
      entryId: 'r1',
      recipeId: 'curry',
      mealType: 'dinner',
      portionMultiplier: 1,
      kcal: 500,
      protein: 0,
      carbs: 0,
      fat: 0,
    } as LoggedMealEntry,
    customEntry({ entryId: 'b', custom: { name: 'B', estimatedBy: 'manual' } }),
  ];
  const idsOf = (log: { loggedMeals: unknown }) =>
    (log.loggedMeals as LoggedMealEntry[]).map((m) => m.entryId);

  it('by entryId deletes exactly that entry', async () => {
    mockMutateDay(stored());
    const log = await trackerService.deleteCustomMeal('u1', '2026-09-27', { entryId: 'b' });
    expect(idsOf(log)).toEqual(['a', 'r1']);
  });

  it('by entryId still deletes the right one when the array has shifted since render', async () => {
    // The client rendered "B" at index 2, but a recipe entry was unticked
    // elsewhere in the meantime, so B is now at index 1.
    const shifted = stored().filter((m) => m.entryId !== 'r1');
    mockMutateDay(shifted);
    const log = await trackerService.deleteCustomMeal('u1', '2026-09-27', {
      entryId: 'b',
      entryIndex: 2,
    });
    expect(idsOf(log)).toEqual(['a']);
  });

  it('the legacy index path (1.0.1 clients) still works', async () => {
    mockMutateDay(stored());
    const log = await trackerService.deleteCustomMeal('u1', '2026-09-27', { entryIndex: 2 });
    expect(idsOf(log)).toEqual(['a', 'r1']);
  });

  it('404s an unknown entryId and an entryId that names a recipe entry', async () => {
    mockMutateDay(stored());
    await expect(
      trackerService.deleteCustomMeal('u1', '2026-09-27', { entryId: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      trackerService.deleteCustomMeal('u1', '2026-09-27', { entryId: 'r1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('404s an index that names a recipe entry', async () => {
    mockMutateDay(stored());
    await expect(
      trackerService.deleteCustomMeal('u1', '2026-09-27', { entryIndex: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('trackerService.updateRecipeEntry (UX-FOOD-03 — off-plan rows are editable)', () => {
  const recipeEntry = (): LoggedMealEntry => ({
    entryId: 'r1',
    recipeId: 'pad-thai',
    mealType: 'dinner',
    portionMultiplier: 1,
    kcal: 600,
    protein: 20,
    carbs: 80,
    fat: 20,
  });

  function withStored(entries: LoggedMealEntry[]) {
    mockMutateDay(entries);
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
      loggedMeals: entries as never,
    } as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { id: 'pad-thai', nutritionInfo: { calories: 600, protein: 20, carbs: 80, fat: 20 } },
    ] as never);
  }

  it('changes the portion and recomputes the macros from the recipe', async () => {
    withStored([recipeEntry()]);
    const log = await trackerService.updateRecipeEntry('u1', '2026-09-27', 'r1', {
      portionMultiplier: 1.5,
    });
    const meal = (log.loggedMeals as unknown as LoggedMealEntry[])[0]!;
    expect(meal).toMatchObject({ portionMultiplier: 1.5, kcal: 900, protein: 30, carbs: 120 });
    expect(meal.mealType).toBe('dinner');
  });

  it('can move the entry to another meal without touching the portion', async () => {
    withStored([recipeEntry()]);
    const log = await trackerService.updateRecipeEntry('u1', '2026-09-27', 'r1', {
      mealType: 'lunch',
    });
    expect((log.loggedMeals as unknown as LoggedMealEntry[])[0]).toMatchObject({
      mealType: 'lunch',
      portionMultiplier: 1,
      kcal: 600,
    });
  });

  it('404s a stale id and a custom entry', async () => {
    withStored([recipeEntry(), customEntry()]);
    await expect(
      trackerService.updateRecipeEntry('u1', '2026-09-27', 'gone', { portionMultiplier: 2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      trackerService.updateRecipeEntry('u1', '2026-09-27', 'e1', { portionMultiplier: 2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// UX-FOOD-11: blank macros are stored as 0 g but flagged unknown (additive —
// shipped clients keep reading plain numbers).
describe('trackerService unknownMacros (UX-FOOD-11)', () => {
  it('logCustomMeal stores the flag next to the zeroed macros, and omits it when empty', async () => {
    mockMutateDay([]);
    const base = {
      name: 'Soup',
      estimatedBy: 'manual' as const,
      mealType: 'lunch',
      kcal: 400,
      protein: 20,
      carbs: 0,
      fat: 0,
    };
    const partial = await trackerService.logCustomMeal(FREE_USER, '2026-09-27', {
      ...base,
      unknownMacros: ['carbs', 'fat'],
    });
    const [stored] = partial.log.loggedMeals as unknown as LoggedMealEntry[];
    expect(stored).toMatchObject({
      protein: 20,
      carbs: 0,
      fat: 0,
      unknownMacros: ['carbs', 'fat'],
    });

    const full = await trackerService.logCustomMeal(FREE_USER, '2026-09-27', base);
    const [plain] = full.log.loggedMeals as unknown as LoggedMealEntry[];
    expect(plain).not.toHaveProperty('unknownMacros');
  });

  it('updateCustomMeal replaces the flag, clears it with [] and keeps it when omitted', async () => {
    const edit = { kcal: 300, protein: 10, carbs: 40, fat: 8 };
    mockMutateDay([customEntry({ unknownMacros: ['fat'] })]);
    const kept = await trackerService.updateCustomMeal('u1', '2026-09-27', 'e1', edit);
    expect((kept.loggedMeals as unknown as LoggedMealEntry[])[0]!.unknownMacros).toEqual(['fat']);

    mockMutateDay([customEntry({ unknownMacros: ['fat'] })]);
    const cleared = await trackerService.updateCustomMeal('u1', '2026-09-27', 'e1', {
      ...edit,
      unknownMacros: [],
    });
    expect((cleared.loggedMeals as unknown as LoggedMealEntry[])[0]).not.toHaveProperty(
      'unknownMacros',
    );

    mockMutateDay([customEntry()]);
    const set = await trackerService.updateCustomMeal('u1', '2026-09-27', 'e1', {
      ...edit,
      unknownMacros: ['carbs'],
    });
    expect((set.loggedMeals as unknown as LoggedMealEntry[])[0]!.unknownMacros).toEqual(['carbs']);
  });

  it('recents carries the flag so "log again" does not turn unknown into a typed 0', async () => {
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([
      {
        id: 'l1',
        userId: 'u1',
        date: new Date('2026-09-26T00:00:00Z'),
        loggedMeals: [customEntry({ unknownMacros: ['carbs', 'fat'] })] as never,
        skippedSlots: [],
        totalKcal: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        updatedAt: new Date(),
      },
    ]);
    const [recent] = await trackerService.recents('u1');
    expect(recent?.unknownMacros).toEqual(['carbs', 'fat']);
  });
});
