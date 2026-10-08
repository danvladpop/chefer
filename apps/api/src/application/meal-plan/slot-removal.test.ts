import { describe, expect, it } from 'vitest';
import type { DayState, LoggedMealEntry } from '@chefer/database';
import { reindexDayStateAfterSlotRemoval } from './slot-removal.js';

const entry = (over: Partial<LoggedMealEntry>): LoggedMealEntry => ({
  mealType: 'lunch',
  portionMultiplier: 1,
  kcal: 500,
  protein: 30,
  carbs: 40,
  fat: 15,
  ...over,
});

describe('reindexDayStateAfterSlotRemoval (FB7-04)', () => {
  it('moves entries, replacements and skips of LATER slots down by one', () => {
    const state: DayState = {
      entries: [
        entry({ recipeId: 'r-dinner', mealType: 'dinner', slotIndex: 3 }),
        entry({
          custom: { name: 'Pizza', estimatedBy: 'manual' },
          mealType: 'dinner',
          replacesSlot: { mealType: 'dinner', slotIndex: 4 },
        }),
      ],
      skippedSlots: [{ mealType: 'snack', slotIndex: 5 }],
    };
    const next = reindexDayStateAfterSlotRemoval(state, 2);
    expect(next.entries[0]?.slotIndex).toBe(2);
    expect(next.entries[1]?.replacesSlot).toEqual({ mealType: 'dinner', slotIndex: 3 });
    expect(next.skippedSlots).toEqual([{ mealType: 'snack', slotIndex: 4 }]);
  });

  it('leaves state of EARLIER slots alone and returns the same object when nothing changed', () => {
    const state: DayState = {
      entries: [entry({ recipeId: 'r1', slotIndex: 0 }), entry({ recipeId: 'r2' })],
      skippedSlots: [{ mealType: 'breakfast', slotIndex: 1 }],
    };
    expect(reindexDayStateAfterSlotRemoval(state, 2)).toBe(state);
  });

  it('keeps an eaten removed dish in the totals but unlinks it from the slot', () => {
    const state: DayState = {
      entries: [entry({ recipeId: 'side', slotIndex: 2, kcal: 150 })],
      skippedSlots: [],
    };
    const next = reindexDayStateAfterSlotRemoval(state, 2);
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).not.toHaveProperty('slotIndex');
    expect(next.entries[0]?.kcal).toBe(150);
  });

  it('drops the skip of the removed slot and the link of an "ate something else" entry', () => {
    const state: DayState = {
      entries: [
        entry({
          custom: { name: 'Salad', estimatedBy: 'manual' },
          replacesSlot: { mealType: 'lunch', slotIndex: 1 },
        }),
      ],
      skippedSlots: [{ mealType: 'lunch', slotIndex: 1 }],
    };
    const next = reindexDayStateAfterSlotRemoval(state, 1);
    expect(next.skippedSlots).toEqual([]);
    expect(next.entries[0]).not.toHaveProperty('replacesSlot');
    expect(next.entries[0]?.custom?.name).toBe('Salad');
  });
});
