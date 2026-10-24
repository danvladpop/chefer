import { describe, expect, it } from 'vitest';
import type { LoggedMealEntry } from '@chefer/database';
import { dayCandidates } from '@chefer/utils';
import { buildDayFacts } from './day-facts.js';

const entry = (over: Partial<LoggedMealEntry>): LoggedMealEntry => ({
  mealType: 'lunch',
  portionMultiplier: 1,
  kcal: 500,
  protein: 25,
  carbs: 50,
  fat: 15,
  ...over,
});

const base = {
  date: '2026-10-22',
  skippedSlots: [],
  totals: { kcal: 1500, proteinG: 80, carbsG: 150, fatG: 50 },
  proteinTargetG: null,
};

describe('buildDayFacts', () => {
  it('keys a planned slot by its index and a custom entry by its entry id', () => {
    const facts = buildDayFacts({
      ...base,
      entries: [
        entry({ recipeId: 'r1', mealType: 'dinner', slotIndex: 2 }),
        entry({ entryId: 'abc', custom: { name: 'Toast', estimatedBy: 'manual' } }),
        entry({ recipeId: 'r9', mealType: 'snack' }), // cook mode: no slot index
      ],
      planMeals: [{ type: 'dinner', recipeId: 'r1', slotIndex: 2 }],
    });
    expect(facts.entries.map((e) => e.sourceId)).toEqual([
      '2026-10-22:dinner:2',
      '2026-10-22:custom:abc',
      '2026-10-22:snack:r9',
    ]);
    expect(facts.entries.map((e) => e.onPlan)).toEqual([true, false, false]);
  });

  it('counts replaced and skipped slots as handled, so a day can be full without logging them', () => {
    const facts = buildDayFacts({
      ...base,
      entries: [
        entry({ recipeId: 'r1', mealType: 'breakfast', slotIndex: 0 }),
        entry({
          entryId: 'swap',
          custom: { name: 'Shawarma', estimatedBy: 'manual' },
          mealType: 'lunch',
          replacesSlot: { mealType: 'lunch', slotIndex: 1 },
        }),
      ],
      skippedSlots: [{ mealType: 'dinner', slotIndex: 2 }],
      planMeals: [
        { type: 'breakfast', recipeId: 'r1', slotIndex: 0 },
        { type: 'lunch', recipeId: 'r2', slotIndex: 1 },
        { type: 'dinner', recipeId: 'r3', slotIndex: 2 },
      ],
    });
    expect(facts.planSlots).toHaveLength(3);
    expect(facts.handledSlots).toHaveLength(3);
    expect(dayCandidates(facts).map((c) => c.kind)).toContain('FULL_DAY');
  });

  it('leaves a planned slot that is still open unhandled', () => {
    const facts = buildDayFacts({
      ...base,
      entries: [entry({ entryId: 'a', custom: { name: 'x', estimatedBy: 'manual' } })],
      planMeals: [{ type: 'dinner', recipeId: 'r3', slotIndex: 0 }],
    });
    expect(facts.handledSlots).toEqual([]);
  });
});
