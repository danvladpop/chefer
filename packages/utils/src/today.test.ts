import { describe, expect, it } from 'vitest';
import {
  isSlotEaten,
  matchLoggedToSlots,
  MEAL_ORDER,
  MEAL_WINDOW_END,
  resolveTodayMeals,
} from './today';

const breakfast = { type: 'breakfast', recipeId: 'oats' };
const lunch = { type: 'lunch', recipeId: 'salad' };
const snack = { type: 'snack', recipeId: 'nuts' };
const dinner = { type: 'dinner', recipeId: 'curry' };
const threeMeals = [breakfast, lunch, dinner];
const fourMeals = [breakfast, lunch, snack, dinner];

describe('resolveTodayMeals — clock only (nothing logged)', () => {
  it('surfaces breakfast in the morning, the rest later', () => {
    const r = resolveTodayMeals(threeMeals, 7);
    expect(r.next).toBe(breakfast);
    expect(r.later).toEqual([lunch, dinner]);
    expect(r.eaten).toEqual([]);
  });

  it('window ends are exclusive: 10:00 is lunch', () => {
    expect(resolveTodayMeals(threeMeals, 10).next).toBe(lunch);
  });

  it('skips an absent snack and surfaces dinner at 15:00 on a 3-meal plan', () => {
    expect(resolveTodayMeals(threeMeals, 15).next).toBe(dinner);
  });

  it('surfaces the snack at 15:00 on a 4-meal plan', () => {
    const r = resolveTodayMeals(fourMeals, 15);
    expect(r.next).toBe(snack);
    expect(r.later).toEqual([dinner]);
  });

  it('returns no next meal once every window has closed', () => {
    expect(resolveTodayMeals(threeMeals, 21).next).toBeNull();
  });

  it('orders slots by the day, whatever order the plan stores them in', () => {
    expect(resolveTodayMeals([dinner, breakfast, lunch], 7).later).toEqual([lunch, dinner]);
  });

  it('handles an empty day', () => {
    expect(resolveTodayMeals([], 9)).toEqual({ next: null, later: [], eaten: [] });
  });
});

describe('resolveTodayMeals — advancing past logged meals (F-PM-10)', () => {
  it('breakfast eaten at 7:00 moves the spotlight to lunch at once', () => {
    const r = resolveTodayMeals(threeMeals, 7, [{ recipeId: 'oats', mealType: 'breakfast' }]);
    expect(r.next).toBe(lunch);
    expect(r.later).toEqual([dinner]);
    expect(r.eaten).toEqual([breakfast]);
  });

  it('"Made it!" on dinner leaves nothing next today (the audit repro)', () => {
    const logged = [
      { recipeId: 'oats', mealType: 'breakfast' },
      { recipeId: 'salad', mealType: 'lunch' },
      { recipeId: 'curry', mealType: 'dinner' },
    ];
    const r = resolveTodayMeals(threeMeals, 19, logged);
    expect(r.next).toBeNull();
    expect(r.later).toEqual([]);
  });

  it('dinner cooked early (logged as a snack by cook mode) still counts', () => {
    const r = resolveTodayMeals(threeMeals, 16, [{ recipeId: 'curry', mealType: 'snack' }]);
    expect(r.next).toBeNull();
    expect(r.eaten).toEqual([dinner]);
  });

  it('keeps a later meal next when an earlier one was skipped unlogged', () => {
    const r = resolveTodayMeals(threeMeals, 12, [{ recipeId: 'curry', mealType: 'dinner' }]);
    expect(r.next).toBe(lunch);
    expect(r.later).toEqual([]);
  });

  it('a scanned lunch replaces the planned one', () => {
    const r = resolveTodayMeals(threeMeals, 11, [
      { custom: { name: 'Burrito', estimatedBy: 'vision' }, mealType: 'lunch' },
    ]);
    expect(r.next).toBe(dinner);
  });

  it('a quick-add snack does not swallow the planned snack', () => {
    const r = resolveTodayMeals(fourMeals, 15, [
      { custom: { name: 'Cake', estimatedBy: 'manual' }, mealType: 'snack' },
    ]);
    expect(r.next).toBe(snack);
  });
});

describe('isSlotEaten', () => {
  it('matches by recipe, not by meal type alone', () => {
    expect(isSlotEaten(lunch, [{ recipeId: 'other', mealType: 'lunch' }])).toBe(false);
    expect(isSlotEaten(lunch, [{ recipeId: 'salad', mealType: 'dinner' }])).toBe(true);
  });

  it('ignores entries that are neither a recipe nor a custom meal', () => {
    expect(isSlotEaten(lunch, [{ mealType: 'lunch' }])).toBe(false);
  });
});

describe('meal windows', () => {
  it('every meal type in MEAL_ORDER has a window', () => {
    for (const type of MEAL_ORDER) expect(MEAL_WINDOW_END[type]).toBeGreaterThan(0);
  });
});

describe('resolveTodayMeals — two-snack days (curated planner)', () => {
  const snack1 = { type: 'snack', recipeId: 'apple' };
  const snack2 = { type: 'snack', recipeId: 'hummus' };
  const day = [breakfast, lunch, dinner, snack1, snack2];

  it('keeps both snacks, in plan order, ahead of dinner', () => {
    const r = resolveTodayMeals(day, 15);
    expect(r.next).toBe(snack1);
    expect(r.later).toEqual([snack2, dinner]);
  });

  it('eating the first snack puts the second one next', () => {
    const r = resolveTodayMeals(day, 15, [{ recipeId: 'apple', mealType: 'snack' }]);
    expect(r.next).toBe(snack2);
    expect(r.eaten).toEqual([snack1]);
  });
});

describe('two identical snacks (slotIndex on logged meals)', () => {
  // Plan day: breakfast 0, snack 1, lunch 2, snack 3 — both snacks the same recipe.
  const day = [
    { type: 'breakfast', recipeId: 'oats' },
    { type: 'snack', recipeId: 'yogurt' },
    { type: 'lunch', recipeId: 'salad' },
    { type: 'snack', recipeId: 'yogurt' },
  ];

  it('one logged snack marks only one of the two', () => {
    const r = resolveTodayMeals(day, 15, [{ recipeId: 'yogurt', mealType: 'snack' }]);
    expect(r.eaten).toEqual([day[1]]);
    expect(r.next).toBe(day[3]);
  });

  it('an entry with a slotIndex marks exactly that slot', () => {
    const r = resolveTodayMeals(day, 15, [{ recipeId: 'yogurt', mealType: 'snack', slotIndex: 3 }]);
    expect(r.eaten).toEqual([day[3]]);
    expect(r.next).toBe(day[1]);
  });

  it('two entries mark both', () => {
    const r = resolveTodayMeals(day, 15, [
      { recipeId: 'yogurt', mealType: 'snack', slotIndex: 1 },
      { recipeId: 'yogurt', mealType: 'snack' },
    ]);
    expect(r.eaten).toEqual([day[1], day[3]]);
    expect(r.next).toBeNull();
  });

  it('matchLoggedToSlots: indexed entries first, then the first free slot of that type', () => {
    const a = { recipeId: 'yogurt', mealType: 'snack', slotIndex: 3 };
    const b = { recipeId: 'yogurt', mealType: 'snack' };
    expect(matchLoggedToSlots(day, [b, a])).toEqual([undefined, b, undefined, a]);
  });

  it('a stale slotIndex (slot swapped since) falls back to recipe matching', () => {
    const e = { recipeId: 'yogurt', mealType: 'snack', slotIndex: 2 };
    expect(matchLoggedToSlots(day, [e])).toEqual([undefined, e, undefined, undefined]);
  });

  it('cross-type matching only with crossType', () => {
    const e = { recipeId: 'salad', mealType: 'dinner' };
    expect(matchLoggedToSlots(day, [e])).toEqual([undefined, undefined, undefined, undefined]);
    expect(matchLoggedToSlots(day, [e], { crossType: true })[2]).toBe(e);
  });

  it('slotIndex on the slots overrides list position', () => {
    const slots = [
      { type: 'snack', recipeId: 'yogurt', slotIndex: 1 },
      { type: 'snack', recipeId: 'yogurt', slotIndex: 3 },
    ];
    const e = { recipeId: 'yogurt', mealType: 'snack', slotIndex: 3 };
    expect(matchLoggedToSlots(slots, [e])).toEqual([undefined, e]);
  });
});
