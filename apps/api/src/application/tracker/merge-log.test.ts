import { describe, expect, it } from 'vitest';
import type { LoggedMealEntry } from '@chefer/database';
import {
  aggregateRecents,
  ensureEntryIds,
  mergeLoggedMeals,
  needsEntryIdBackfill,
} from './merge-log.js';

const recipe = (recipeId: string, mealType = 'dinner', kcal = 500): LoggedMealEntry => ({
  recipeId,
  mealType,
  portionMultiplier: 1,
  kcal,
  protein: 20,
  carbs: 50,
  fat: 15,
});
const custom = (name: string): LoggedMealEntry => ({
  custom: { name, estimatedBy: 'manual' },
  mealType: 'snack',
  portionMultiplier: 1,
  kcal: 200,
  protein: 5,
  carbs: 20,
  fat: 8,
});

describe('mergeLoggedMeals', () => {
  it('keeps a cooked meal whose recipe left the plan (F-PM-1)', () => {
    const stored = [recipe('curry')]; // cooked, then the plan was regenerated
    const merged = mergeLoggedMeals(stored, [recipe('oats', 'breakfast')], new Set(['oats']));
    expect(merged.map((m) => m.recipeId)).toEqual(['oats', 'curry']);
  });

  it("keeps custom entries the client didn't send, ignoring echoed ones (F-TRK-1-2)", () => {
    const stored = [custom('Tab-B snack'), custom('pizza scan')];
    const stale = [custom('pizza scan')]; // a stale tab only knew one of them
    const merged = mergeLoggedMeals(stored, [recipe('oats'), ...stale], new Set(['oats']));
    expect(merged.filter((m) => m.custom).map((m) => m.custom?.name)).toEqual([
      'Tab-B snack',
      'pizza scan',
    ]);
  });

  it('lets the client untick a planned meal, including sending an empty list (F-TRK-1-3)', () => {
    const stored = [recipe('oats', 'breakfast'), recipe('salad', 'lunch'), custom('apple')];
    const merged = mergeLoggedMeals(stored, [], new Set(['oats', 'salad']));
    expect(merged).toEqual([custom('apple')]);
  });

  it('replaces a planned entry with the client version (portion change)', () => {
    const stored = [recipe('oats', 'breakfast', 300)];
    const incoming = [{ ...recipe('oats', 'breakfast', 450), portionMultiplier: 1.5 }];
    const merged = mergeLoggedMeals(stored, incoming, new Set(['oats']));
    expect(merged).toEqual(incoming);
  });
});

// Bug B-34, T-19.2: stable entryId, backfilled lazily.
describe('ensureEntryIds / needsEntryIdBackfill', () => {
  it('assigns an id only to entries missing one, leaving existing ids untouched', () => {
    const withId = { ...recipe('oats'), entryId: 'keep-me' };
    const withoutId = custom('snack');
    expect(needsEntryIdBackfill([withId])).toBe(false);
    expect(needsEntryIdBackfill([withoutId])).toBe(true);

    const backfilled = ensureEntryIds([withId, withoutId]);
    expect(backfilled[0]!.entryId).toBe('keep-me');
    expect(backfilled[1]!.entryId).toBeTruthy();
    expect(backfilled[1]!.entryId).not.toBe('keep-me');
  });

  it('is idempotent — running it twice keeps the same ids', () => {
    const once = ensureEntryIds([custom('snack')]);
    const twice = ensureEntryIds(once);
    expect(twice).toEqual(once);
  });
});

// T-19.1: the search-first Log sheet's "Recent" group.
describe('aggregateRecents', () => {
  it('dedupes by recipe id and by normalized custom name, counting occurrences', () => {
    const days = [
      { dateStr: '2026-09-20', entries: [recipe('oats', 'breakfast')] },
      { dateStr: '2026-09-21', entries: [recipe('oats', 'breakfast'), custom('Protein Shake')] },
      { dateStr: '2026-09-22', entries: [custom('protein shake')] }, // same custom, different case
    ];
    const result = aggregateRecents(days, 15);
    expect(result).toHaveLength(2);
    const oats = result.find((r) => r.recipeId === 'oats')!;
    expect(oats.count).toBe(2);
    const shake = result.find((r) => r.customName)!;
    expect(shake.count).toBe(2);
  });

  it('sorts most frequent first, ties broken by most recent', () => {
    const days = [
      { dateStr: '2026-09-18', entries: [recipe('rare')] },
      { dateStr: '2026-09-19', entries: [recipe('common')] },
      { dateStr: '2026-09-20', entries: [recipe('common')] },
      { dateStr: '2026-09-21', entries: [recipe('tied-a')] },
      { dateStr: '2026-09-22', entries: [recipe('tied-b')] },
    ];
    const result = aggregateRecents(days, 15);
    expect(result[0]!.recipeId).toBe('common'); // count 2, highest
    // tied-b (logged 09-22) ranks above tied-a (09-21) among count-1 entries
    const tiedIndexA = result.findIndex((r) => r.recipeId === 'tied-a');
    const tiedIndexB = result.findIndex((r) => r.recipeId === 'tied-b');
    expect(tiedIndexB).toBeLessThan(tiedIndexA);
  });

  it('respects the limit', () => {
    const days = [
      {
        dateStr: '2026-09-20',
        entries: Array.from({ length: 20 }, (_, i) => recipe(`r${i}`)),
      },
    ];
    expect(aggregateRecents(days, 15)).toHaveLength(15);
  });

  it('uses the most recent occurrence for the displayed macros/mealType', () => {
    const days = [
      { dateStr: '2026-09-20', entries: [recipe('oats', 'breakfast', 300)] },
      { dateStr: '2026-09-21', entries: [recipe('oats', 'snack', 350)] },
    ];
    const result = aggregateRecents(days, 15);
    expect(result[0]!.mealType).toBe('snack');
    expect(result[0]!.kcal).toBe(350);
    expect(result[0]!.lastLoggedAt).toBe('2026-09-21');
  });

  it('ignores entries with neither a recipeId nor a custom name (defensive)', () => {
    const bare: LoggedMealEntry = {
      mealType: 'lunch',
      portionMultiplier: 1,
      kcal: 100,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    expect(aggregateRecents([{ dateStr: '2026-09-20', entries: [bare] }], 15)).toEqual([]);
  });
});
