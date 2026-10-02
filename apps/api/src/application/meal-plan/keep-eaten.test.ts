import { describe, expect, it } from 'vitest';
import { mergeKeptSlots, selectKeptSlots } from './keep-eaten.js';

const days = [
  { dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'mon-d' }] },
  { dayOfWeek: 1, meals: [] },
  {
    dayOfWeek: 2,
    meals: [
      { type: 'breakfast', recipeId: 'wed-b' },
      { type: 'dinner', recipeId: 'wed-d' },
    ],
  },
  { dayOfWeek: 3, meals: [{ type: 'dinner', recipeId: 'thu-d' }] },
];

describe('selectKeptSlots', () => {
  it("keeps past days whole (even an unplanned one) and today's logged slots only", () => {
    const kept = selectKeptSlots(days, 2, new Set(['wed-d']));
    expect(kept).toEqual([
      { dayOfWeek: 0, whole: true, slots: [{ type: 'dinner', recipeId: 'mon-d' }] },
      { dayOfWeek: 1, whole: true, slots: [] },
      { dayOfWeek: 2, whole: false, slots: [{ type: 'dinner', recipeId: 'wed-d' }] },
    ]);
  });

  it('keeps nothing of today when nothing was logged', () => {
    expect(selectKeptSlots(days, 2, new Set()).map((k) => k.dayOfWeek)).toEqual([0, 1]);
  });

  it('keeps all of today when the log is unknown', () => {
    const kept = selectKeptSlots(days, 2, null);
    expect(kept.find((k) => k.dayOfWeek === 2)!.slots).toHaveLength(2);
  });

  it('keeps nothing when today is Monday and nothing is logged', () => {
    expect(selectKeptSlots(days, 0, new Set())).toEqual([]);
  });
});

describe('mergeKeptSlots', () => {
  const fresh = [
    { dayOfWeek: 0, meals: [{ type: 'dinner', id: 'new-mon-d' }] },
    { dayOfWeek: 2, meals: [{ type: 'breakfast', id: 'new-wed-b' }] },
    { dayOfWeek: 3, meals: [{ type: 'dinner', id: 'new-thu-d' }] },
  ];
  const toMeal = (slot: { type: string; recipeId: string }) => ({
    type: slot.type,
    id: slot.recipeId,
  });

  it("a whole kept day replaces the new day; today's kept slot is added in day order", () => {
    const kept = selectKeptSlots(days, 2, new Set(['wed-d']));
    const { days: merged, wholeKept } = mergeKeptSlots(fresh, kept, toMeal);
    expect(merged[0]!.meals).toEqual([{ type: 'dinner', id: 'mon-d' }]);
    expect(merged[1]!.meals.map((m) => m.id)).toEqual(['new-wed-b', 'wed-d']);
    expect(merged[2]!.meals.map((m) => m.id)).toEqual(['new-thu-d']);
    expect([...wholeKept]).toEqual([0]);
  });

  it('a kept slot REPLACES the new slot of its type, so there is never a second dinner', () => {
    const withDinner = [{ dayOfWeek: 2, meals: [{ type: 'dinner', id: 'new-wed-d' }] }];
    const kept = selectKeptSlots(days, 2, new Set(['wed-d']));
    const { days: merged } = mergeKeptSlots(withDinner, kept, toMeal);
    expect(merged[0]!.meals).toEqual([{ type: 'dinner', id: 'wed-d' }]);
  });

  it('a slot whose recipe row is gone is simply not kept', () => {
    const kept = selectKeptSlots(days, 2, new Set(['wed-d']));
    const { days: merged } = mergeKeptSlots(fresh, kept, (slot) =>
      slot.recipeId === 'wed-d' ? null : toMeal(slot),
    );
    expect(merged[1]!.meals.map((m) => m.id)).toEqual(['new-wed-b']);
  });
});
