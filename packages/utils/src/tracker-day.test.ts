import { describe, expect, it } from 'vitest';
import {
  tickStateFromLog,
  withEntriesRemoved,
  withEntryRestored,
  withRecipeEntryEdited,
  withRecipeLogged,
  withRecipeUnlogged,
  withSlotReplaced,
  withSlotSkipped,
  withSlotUnskipped,
  type DayEntry,
  type DayLike,
} from './tracker-day';

const entry = (over: Partial<DayEntry> = {}): DayEntry => ({
  entryId: 'e1',
  recipeId: 'oats',
  mealType: 'breakfast',
  slotIndex: 0,
  portionMultiplier: 1,
  kcal: 400,
  protein: 20,
  carbs: 50,
  fat: 10,
  ...over,
});
const day = (...meals: DayEntry[]): DayLike => ({
  log: { loggedMeals: meals, totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 },
});
/** The day's logged entries (an empty array when nothing is logged). */
const entries = (d: DayLike): DayEntry[] => d.log?.loggedMeals ?? [];
const planned = [
  { mealType: 'breakfast', recipeId: 'oats', slotIndex: 0 },
  { mealType: 'dinner', recipeId: 'curry', slotIndex: 1 },
];

describe('tickStateFromLog', () => {
  it('ticks exactly the planned slots the log holds, at the logged portion', () => {
    expect(tickStateFromLog(planned, [entry({ portionMultiplier: 1.5 })])).toEqual({
      '0': { checked: true, portion: 1.5 },
    });
  });

  it('nothing logged → nothing ticked', () => {
    expect(tickStateFromLog(planned, [])).toEqual({});
  });
});

describe('optimistic edits keep ticks and totals in step with the log (UX-FOOD-01)', () => {
  it('logging a slot ticks it and adds it to the totals; unlogging (Undo) reverses both', () => {
    const logged = withRecipeLogged(day(), entry());
    expect(tickStateFromLog(planned, entries(logged))['0']?.checked).toBe(true);
    expect(logged.log).toMatchObject({ totalKcal: 400, totalProtein: 20 });

    const undone = withRecipeUnlogged(logged, {
      recipeId: 'oats',
      mealType: 'breakfast',
      slotIndex: 0,
    });
    expect(tickStateFromLog(planned, entries(undone))).toEqual({});
    expect(undone.log?.totalKcal).toBe(0);
  });

  it('re-logging a slot at another portion replaces its entry instead of doubling it', () => {
    const once = withRecipeLogged(day(), entry());
    const twice = withRecipeLogged(once, entry({ portionMultiplier: 2, kcal: 800 }));
    expect(twice.log?.loggedMeals).toHaveLength(1);
    expect(twice.log?.totalKcal).toBe(800);
  });

  it('a log made elsewhere (not in local state) still shows once the cache has it', () => {
    // Derived on every read: no once-a-day copy to go stale.
    const fromServer = day(
      entry({ entryId: 'x', recipeId: 'curry', mealType: 'dinner', slotIndex: 1 }),
    );
    expect(tickStateFromLog(planned, entries(fromServer))).toEqual({
      '1': { checked: true, portion: 1 },
    });
  });

  it('unlogging a slot with no entry is a no-op', () => {
    const empty = day();
    expect(
      withRecipeUnlogged(empty, { recipeId: 'oats', mealType: 'breakfast' }).log?.loggedMeals,
    ).toEqual([]);
  });
});

describe('withEntriesRemoved / withEntryRestored', () => {
  const custom = (id: string, kcal: number): DayEntry => ({
    entryId: id,
    custom: { name: id, estimatedBy: 'manual' },
    mealType: 'snack',
    portionMultiplier: 1,
    kcal,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  it('removes by entryId, leaving the rest and recomputing totals', () => {
    const d = withEntriesRemoved(day(custom('a', 100), custom('b', 200), custom('c', 300)), {
      entryIds: ['b'],
    });
    expect(d.log?.loggedMeals.map((m) => m.entryId)).toEqual(['a', 'c']);
    expect(d.log?.totalKcal).toBe(400);
  });

  it('removes by index for an entry without an id (old data)', () => {
    const d = withEntriesRemoved(day(custom('a', 100), custom('b', 200)), { entryIndex: 0 });
    expect(d.log?.loggedMeals.map((m) => m.entryId)).toEqual(['b']);
  });

  it('an off-plan row leaves "Also eaten" with its entry', () => {
    const base = {
      ...day(entry({ entryId: 'off', recipeId: 'pad-thai', mealType: 'dinner' })),
      offPlanLogged: [
        { entryId: 'off', mealType: 'dinner', kcal: 400, protein: 20, carbs: 50, fat: 10 },
      ],
    };
    const d = withEntriesRemoved(base, { entryIds: ['off'] });
    expect(d.offPlanLogged).toEqual([]);
    expect(d.log?.loggedMeals).toEqual([]);
  });

  it('restore re-adds the entry once (idempotent on entryId)', () => {
    const base = day(custom('a', 100));
    const once = withEntryRestored(base, custom('b', 200));
    expect(withEntryRestored(once, custom('b', 200)).log?.loggedMeals).toHaveLength(2);
    expect(once.log?.totalKcal).toBe(300);
  });
});

describe('withRecipeEntryEdited', () => {
  it('rescales the entry and its off-plan row from the per-serving macros', () => {
    const base = {
      ...day(entry({ entryId: 'off', recipeId: 'pad-thai', mealType: 'dinner', kcal: 600 })),
      offPlanLogged: [
        {
          entryId: 'off',
          mealType: 'dinner',
          portionMultiplier: 1,
          kcal: 600,
          protein: 20,
          carbs: 80,
          fat: 20,
        },
      ],
    };
    const d = withRecipeEntryEdited(
      base,
      'off',
      { portionMultiplier: 1.5, mealType: 'lunch' },
      { kcal: 600, protein: 20, carbs: 80, fat: 20 },
    );
    expect(d.log?.loggedMeals[0]).toMatchObject({
      mealType: 'lunch',
      portionMultiplier: 1.5,
      kcal: 900,
    });
    expect(d.offPlanLogged[0]).toMatchObject({
      mealType: 'lunch',
      portionMultiplier: 1.5,
      kcal: 900,
    });
    expect(d.log?.totalKcal).toBe(900);
  });
});

// ─── WP-06: optimistic replace / skip edits ──────────────────────────────────

describe('withSlotReplaced / withSlotSkipped (WP-06)', () => {
  const shawarma = {
    entryId: 'x1',
    custom: { name: 'Shawarma', estimatedBy: 'manual' as const },
    mealType: 'dinner',
    replacesSlot: { mealType: 'dinner', slotIndex: 2 },
    portionMultiplier: 1,
    kcal: 775,
    protein: 40,
    carbs: 0,
    fat: 0,
  };
  const ticked = {
    recipeId: 'curry',
    mealType: 'dinner',
    slotIndex: 2,
    portionMultiplier: 1,
    kcal: 600,
    protein: 30,
    carbs: 50,
    fat: 20,
  };
  const day = (): DayLike => ({
    log: {
      loggedMeals: [ticked],
      totalKcal: 600,
      totalProtein: 30,
      totalCarbs: 50,
      totalFat: 20,
    },
    skippedSlots: [{ mealType: 'dinner', slotIndex: 2 }],
  });

  it('a replacement takes the slot: drops the ticked recipe, clears the skip, re-totals', () => {
    const next = withSlotReplaced(day(), shawarma);
    expect(next.log?.loggedMeals).toEqual([shawarma]);
    expect(next.log?.totalKcal).toBe(775);
    expect(next.skippedSlots).toEqual([]);
  });

  it('replacing again swaps the earlier replacement instead of adding a second', () => {
    const once = withSlotReplaced(day(), shawarma);
    const twice = withSlotReplaced(once, { ...shawarma, entryId: 'x2', kcal: 500 });
    expect(twice.log?.loggedMeals.map((m) => m.entryId)).toEqual(['x2']);
    expect(twice.log?.totalKcal).toBe(500);
  });

  it('skip is idempotent and unskip removes it', () => {
    const slot = { mealType: 'lunch', slotIndex: 1 };
    const empty: DayLike = { log: null };
    const once = withSlotSkipped(empty, slot);
    expect(withSlotSkipped(once, slot).skippedSlots).toEqual([slot]);
    expect(withSlotUnskipped(once, slot).skippedSlots).toEqual([]);
  });

  it('ticking a skipped slot un-skips it', () => {
    const skippedDay: DayLike = { log: null, skippedSlots: [{ mealType: 'dinner', slotIndex: 2 }] };
    expect(withRecipeLogged(skippedDay, ticked).skippedSlots).toEqual([]);
  });
});
