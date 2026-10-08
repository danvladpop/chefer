import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, mealPlanRepository } from '@chefer/database';
import type { LoggedMealEntry, SlotRefJson } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { rebalanceWeek } from '../meal-plan/rebalance.js';
import { trackerService } from './tracker.service.js';

// WP-06 "Flexible eating": "Ate something else" (replacesSlot) and
// "Skipped it" (the day's separate skippedSlots list).

const CURRY = {
  id: 'curry',
  name: 'Chickpea Curry',
  imageUrl: null,
  nutritionInfo: { calories: 600, protein: 30, carbs: 70, fat: 20 },
};

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn(),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: {
    findByDate: vi.fn().mockResolvedValue(null),
    mutateDay: vi.fn(),
    mutateDayState: vi.fn(),
  },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../meal-plan/rebalance.js', () => ({
  rebalanceWeek: vi.fn().mockResolvedValue({ rebalanced: false, swaps: [], projectedDeviation: 0 }),
}));

vi.mock('../recipe/recipe-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recipe/recipe-access.js')>()),
  findRecipeVisibleTo: vi.fn(() => Promise.resolve(CURRY)),
}));

vi.mock('../recipe/recipe-copy.service.js', () => ({
  recipeCopyService: {
    ownedRecipeFor: vi.fn(() =>
      Promise.resolve({ recipe: CURRY, copiedFromId: 'curry', created: false }),
    ),
  },
}));

const user = (planTier: 'FREE' | 'PREMIUM'): UserProfile => ({
  id: 'u1',
  email: 'flex@chefer.dev',
  name: null,
  firstName: 'Flo',
  role: 'USER',
  planTier,
  image: null,
});

const DATE = '2026-10-02';
const DINNER: SlotRefJson = { mealType: 'dinner', slotIndex: 2 };
const LUNCH: SlotRefJson = { mealType: 'lunch', slotIndex: 1 };

const ticked = (over: Partial<LoggedMealEntry> = {}): LoggedMealEntry => ({
  entryId: 't1',
  recipeId: 'curry',
  mealType: 'dinner',
  slotIndex: 2,
  portionMultiplier: 1,
  kcal: 600,
  protein: 30,
  carbs: 70,
  fat: 20,
  ...over,
});

const replacement = (over: Partial<LoggedMealEntry> = {}): LoggedMealEntry => ({
  entryId: 'r1',
  custom: { name: 'Shawarma', estimatedBy: 'manual' },
  mealType: 'dinner',
  replacesSlot: DINNER,
  portionMultiplier: 1,
  kcal: 775,
  protein: 40,
  carbs: 0,
  fat: 0,
  ...over,
});

/** Runs a mutation against a stored day; returns what would be written. */
function wireDay(entries: LoggedMealEntry[], skippedSlots: SlotRefJson[] = []) {
  const written: { entries: LoggedMealEntry[]; skippedSlots: SlotRefJson[] } = {
    entries,
    skippedSlots,
  };
  vi.mocked(dailyLogRepository.mutateDayState).mockImplementation(async (_u, _d, mutate) => {
    const next = mutate({ entries, skippedSlots });
    written.entries = next.entries;
    written.skippedSlots = next.skippedSlots;
    return {
      id: 'log1',
      userId: 'u1',
      date: new Date(`${DATE}T00:00:00Z`),
      loggedMeals: next.entries as never,
      skippedSlots: next.skippedSlots as never,
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      updatedAt: new Date(),
    };
  });
  vi.mocked(dailyLogRepository.mutateDay).mockImplementation(async (u, d, mutate) =>
    dailyLogRepository.mutateDayState(u, d, (s) => ({ ...s, entries: mutate(s.entries) })),
  );
  return written;
}

const manual = {
  name: 'Shawarma',
  estimatedBy: 'manual' as const,
  mealType: 'dinner',
  kcal: 775,
  protein: 40,
  carbs: 0,
  fat: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mealPlanRepository.findForWeek).mockResolvedValue({ id: 'plan1', days: [] } as never);
});

describe('logCustomMeal — replacesSlot ("Ate something else")', () => {
  it('stores the slot on the entry and takes the slot’s meal type', async () => {
    const day = wireDay([]);
    await trackerService.logCustomMeal(user('FREE'), DATE, {
      ...manual,
      mealType: 'snack', // wrong on purpose: the slot decides
      replacesSlot: DINNER,
    });
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]).toMatchObject({
      custom: { name: 'Shawarma', estimatedBy: 'manual' },
      mealType: 'dinner',
      replacesSlot: DINNER,
      kcal: 775,
    });
  });

  it('without replacesSlot the stored entry is exactly what it always was', async () => {
    const day = wireDay([]);
    await trackerService.logCustomMeal(user('FREE'), DATE, manual);
    expect(day.entries[0]).not.toHaveProperty('replacesSlot');
  });

  it('swaps an earlier replacement of the same slot instead of double counting', async () => {
    const day = wireDay([replacement()]);
    await trackerService.logCustomMeal(user('FREE'), DATE, {
      ...manual,
      name: 'Pizza',
      kcal: 900,
      replacesSlot: DINNER,
    });
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]?.custom?.name).toBe('Pizza');
  });

  it('drops the recipe ticked for that slot, but keeps entries of other slots', async () => {
    const lunchTick = ticked({ entryId: 't2', recipeId: 'salad', mealType: 'lunch', slotIndex: 1 });
    const day = wireDay([ticked(), lunchTick]);
    await trackerService.logCustomMeal(user('FREE'), DATE, { ...manual, replacesSlot: DINNER });
    expect(day.entries.map((m) => m.entryId).filter(Boolean)).toContain('t2');
    expect(day.entries.some((m) => m.recipeId === 'curry')).toBe(false);
    expect(day.entries.filter((m) => m.replacesSlot)).toHaveLength(1);
  });

  it('clears a skip on that slot and keeps skips on other slots', async () => {
    const day = wireDay([], [DINNER, LUNCH]);
    await trackerService.logCustomMeal(user('FREE'), DATE, { ...manual, replacesSlot: DINNER });
    expect(day.skippedSlots).toEqual([LUNCH]);
  });

  it('runs the rebalance hook like any other log (premium)', async () => {
    wireDay([]);
    await trackerService.logCustomMeal(user('PREMIUM'), DATE, { ...manual, replacesSlot: DINNER });
    expect(rebalanceWeek).toHaveBeenCalledTimes(1);
  });

  it('removing the replacement (existing delete path) leaves the slot unfilled again', async () => {
    const day = wireDay([replacement()]);
    await trackerService.deleteCustomMeal('u1', DATE, { entryId: 'r1' });
    expect(day.entries).toEqual([]);
  });

  it('deleteEntries (Undo by id) removes it too', async () => {
    const day = wireDay([replacement(), ticked({ slotIndex: 0, mealType: 'breakfast' })]);
    await trackerService.deleteEntries('u1', DATE, ['r1']);
    expect(day.entries).toHaveLength(1);
  });
});

describe('logRecipe — a replaced slot cannot be ticked a second time', () => {
  const input = { recipeId: 'curry', mealType: 'dinner', portionMultiplier: 1, slotIndex: 2 };

  it('answers CONFLICT in plain words and writes nothing', async () => {
    wireDay([replacement()]);
    await expect(trackerService.logRecipe(user('FREE'), DATE, input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('already logged something else'),
    });
    expect(rebalanceWeek).not.toHaveBeenCalled();
  });

  it('still ticks a different slot of the same day', async () => {
    const day = wireDay([replacement()]);
    await trackerService.logRecipe(user('FREE'), DATE, {
      recipeId: 'curry',
      mealType: 'lunch',
      portionMultiplier: 1,
      slotIndex: 1,
    });
    expect(day.entries.map((m) => m.recipeId).filter(Boolean)).toEqual(['curry']);
  });

  it('works again once the replacement is removed', async () => {
    wireDay([]);
    await expect(trackerService.logRecipe(user('FREE'), DATE, input)).resolves.toBeDefined();
  });

  it('cook mode (no slot) is not blocked: it cannot say which slot it means', async () => {
    wireDay([replacement()]);
    await expect(
      trackerService.logRecipe(user('FREE'), DATE, {
        recipeId: 'curry',
        mealType: 'dinner',
        portionMultiplier: 1,
      }),
    ).resolves.toBeDefined();
  });

  it('eating a skipped slot un-skips it', async () => {
    const day = wireDay([], [DINNER, LUNCH]);
    await trackerService.logRecipe(user('FREE'), DATE, input);
    expect(day.skippedSlots).toEqual([LUNCH]);
  });
});

describe('skipSlot / unskipSlot ("Skipped it")', () => {
  it('records the skip in skippedSlots and never touches the entries', async () => {
    const lunchTick = ticked({ recipeId: 'oats', mealType: 'breakfast', slotIndex: 0 });
    const day = wireDay([lunchTick]);
    const result = await trackerService.skipSlot(user('FREE'), DATE, LUNCH);
    expect(day.skippedSlots).toEqual([LUNCH]);
    expect(day.entries).toEqual([lunchTick]);
    expect(result.skippedSlots).toEqual([LUNCH]);
  });

  it('is idempotent', async () => {
    const day = wireDay([], [LUNCH]);
    await trackerService.skipSlot(user('FREE'), DATE, LUNCH);
    expect(day.skippedSlots).toEqual([LUNCH]);
  });

  it('refuses (CONFLICT) to skip a slot that is already ticked or replaced', async () => {
    wireDay([ticked()]);
    await expect(trackerService.skipSlot(user('FREE'), DATE, DINNER)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    wireDay([replacement()]);
    await expect(trackerService.skipSlot(user('FREE'), DATE, DINNER)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('runs the rebalance hook after a skip, for every tier (WP-07)', async () => {
    wireDay([]);
    await trackerService.skipSlot(user('PREMIUM'), DATE, LUNCH);
    expect(rebalanceWeek).toHaveBeenCalledTimes(1);
    vi.mocked(rebalanceWeek).mockClear();
    await trackerService.skipSlot(user('FREE'), DATE, LUNCH);
    expect(rebalanceWeek).toHaveBeenCalledTimes(1);
  });

  it('unskip removes it and is a no-op when it is not skipped', async () => {
    const day = wireDay([], [LUNCH, DINNER]);
    const result = await trackerService.unskipSlot('u1', DATE, LUNCH);
    expect(day.skippedSlots).toEqual([DINNER]);
    expect(result.skippedSlots).toEqual([DINNER]);
    await trackerService.unskipSlot('u1', DATE, LUNCH);
    expect(day.skippedSlots).toEqual([DINNER]);
  });
});

describe('other writes keep a day’s skips and drop replacesSlot where it no longer applies', () => {
  it('copyDay copies the entries without replacesSlot (another day’s slots) and no skips', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
      id: 'l0',
      userId: 'u1',
      date: new Date('2026-10-01T00:00:00Z'),
      loggedMeals: [replacement()] as never,
      skippedSlots: [LUNCH] as never,
      totalKcal: 775,
      totalProtein: 40,
      totalCarbs: 0,
      totalFat: 0,
      updatedAt: new Date(),
    });
    const day = wireDay([]);
    await trackerService.copyDay(user('FREE'), '2026-10-01', DATE);
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]).not.toHaveProperty('replacesSlot');
    expect(day.skippedSlots).toEqual([]);
  });

  it('upsertDay (older clients’ save) preserves skips and refuses to re-tick a replaced slot', async () => {
    const day = wireDay([replacement()], [LUNCH]);
    await trackerService.upsertDay(user('FREE'), DATE, [ticked()]);
    expect(day.skippedSlots).toEqual([LUNCH]);
    expect(day.entries.some((m) => m.recipeId === 'curry')).toBe(false);
    expect(day.entries.some((m) => m.replacesSlot)).toBe(true);
  });
});

describe('getDay — exposes skips and replacements additively', () => {
  const row = (extra: Record<string, unknown>) => ({
    id: 'l1',
    userId: 'u1',
    date: new Date(`${DATE}T00:00:00Z`),
    loggedMeals: [replacement()] as never,
    totalKcal: 775,
    totalProtein: 40,
    totalCarbs: 0,
    totalFat: 0,
    updatedAt: new Date(),
    ...extra,
  });

  it('returns skippedSlots top-level and on log, and the replacement entry with replacesSlot', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(
      row({ skippedSlots: [LUNCH] }) as never,
    );
    const day = await trackerService.getDay('u1', DATE);
    expect(day.skippedSlots).toEqual([LUNCH]);
    expect(day.log?.skippedSlots).toEqual([LUNCH]);
    expect(day.log?.loggedMeals[0]?.replacesSlot).toEqual(DINNER);
    // The replacement is a custom entry: it never shows up as an off-plan recipe.
    expect(day.offPlanLogged).toEqual([]);
  });

  it('a row written before the column existed reads as no skips', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(row({}) as never);
    const day = await trackerService.getDay('u1', DATE);
    expect(day.skippedSlots).toEqual([]);
  });

  it('a day with no log has an empty skip list', async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue(null);
    const day = await trackerService.getDay('u1', DATE);
    expect(day.skippedSlots).toEqual([]);
    expect(day.log).toBeNull();
  });
});
