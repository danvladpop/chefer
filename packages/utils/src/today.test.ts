import { describe, expect, it } from 'vitest';
import {
  isSlotEaten,
  matchLoggedToSlots,
  MEAL_ORDER,
  MEAL_WINDOW_END,
  plannedTotals,
  remainingTotals,
  resolveTodayMeals,
  slotStates,
  slotStatus,
  type SlotRef,
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
    expect(resolveTodayMeals([], 9)).toEqual({
      next: null,
      later: [],
      eaten: [],
      replaced: [],
      skipped: [],
    });
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

describe('resolveTodayMeals — dinner done follows the log (UX-PLAN-01)', () => {
  it('a different dinner logged earlier (plan regenerated since) still counts as dinner done', () => {
    const r = resolveTodayMeals(threeMeals, 19, [{ recipeId: 'pad-thai', mealType: 'dinner' }]);
    expect(r.next).toBeNull();
    expect(r.eaten).toEqual([dinner]);
  });

  it('one stray entry covers one slot of its type only', () => {
    const twoLunches = [lunch, { type: 'lunch', recipeId: 'soup' }, dinner];
    const r = resolveTodayMeals(twoLunches, 11, [{ recipeId: 'ramen', mealType: 'lunch' }]);
    expect(r.eaten).toEqual([lunch]);
    expect(r.next).toEqual({ type: 'lunch', recipeId: 'soup' });
  });

  it('an entry that matches a slot is not also counted as a stray', () => {
    const r = resolveTodayMeals(threeMeals, 12, [{ recipeId: 'oats', mealType: 'lunch' }]);
    // The breakfast recipe logged under lunch claims breakfast (cross-type),
    // so lunch is still open.
    expect(r.eaten).toEqual([breakfast]);
    expect(r.next).toBe(lunch);
  });

  it('a stray snack does not swallow the planned snack', () => {
    const r = resolveTodayMeals(fourMeals, 15, [{ recipeId: 'chips', mealType: 'snack' }]);
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

// ─── WP-06: replaced and skipped slots ───────────────────────────────────────

describe('slot status — replaced ("Ate something else") and skipped', () => {
  const day = [
    { type: 'breakfast', recipeId: 'oats', slotIndex: 0 },
    { type: 'lunch', recipeId: 'salad', slotIndex: 1 },
    { type: 'snack', recipeId: 'nuts', slotIndex: 2 },
    { type: 'snack', recipeId: 'nuts', slotIndex: 3 },
    { type: 'dinner', recipeId: 'curry', slotIndex: 4 },
  ];
  const shawarma = {
    custom: { name: 'Shawarma', estimatedBy: 'manual' as const },
    mealType: 'dinner',
    replacesSlot: { mealType: 'dinner', slotIndex: 4 },
  };
  const slotAt = (i: number) => {
    const slot = day[i];
    if (!slot) throw new Error(`no slot ${i}`);
    return slot;
  };
  const status = (logged: Parameters<typeof slotStates>[1], skipped: SlotRef[] = []) =>
    slotStates(day, logged, skipped).map((s) => s.status);

  it('everything is planned with nothing logged', () => {
    expect(status([])).toEqual(['planned', 'planned', 'planned', 'planned', 'planned']);
  });

  it('a replacement marks only its slot as replaced and exposes the entry', () => {
    const states = slotStates(day, [shawarma]);
    expect(states[4]).toEqual({ status: 'replaced', entry: shawarma });
    expect(states.slice(0, 4).map((s) => s.status)).toEqual([
      'planned',
      'planned',
      'planned',
      'planned',
    ]);
  });

  it('replacing one snack leaves the other snack planned', () => {
    const entry = {
      custom: { name: 'Croissant', estimatedBy: 'manual' as const },
      mealType: 'snack',
      replacesSlot: { mealType: 'snack', slotIndex: 3 },
    };
    expect(status([entry])).toEqual(['planned', 'planned', 'planned', 'replaced', 'planned']);
  });

  it('a skipped slot is skipped, not eaten', () => {
    expect(status([], [{ mealType: 'lunch', slotIndex: 1 }])).toEqual([
      'planned',
      'skipped',
      'planned',
      'planned',
      'planned',
    ]);
  });

  it('precedence: replaced > eaten > skipped when stored data disagrees', () => {
    const skipDinner = [{ mealType: 'dinner', slotIndex: 4 }];
    expect(status([shawarma], skipDinner)[4]).toBe('replaced');
    const ticked = { recipeId: 'curry', mealType: 'dinner', slotIndex: 4 };
    expect(status([ticked], skipDinner)[4]).toBe('eaten');
  });

  it('a skip names the meal type too: a stale index of another type does not match', () => {
    expect(status([], [{ mealType: 'dinner', slotIndex: 1 }])[1]).toBe('planned');
  });

  it('slotStatus (single slot) agrees', () => {
    expect(slotStatus(slotAt(4), [shawarma])).toBe('replaced');
    expect(slotStatus(slotAt(1), [], [{ mealType: 'lunch', slotIndex: 1 }])).toBe('skipped');
    expect(slotStatus(slotAt(0), [{ recipeId: 'oats', mealType: 'breakfast' }])).toBe('eaten');
    expect(slotStatus(slotAt(0))).toBe('planned');
  });

  it('isSlotEaten: a replacement covers its slot only; a plain custom entry still covers its meal type', () => {
    expect(isSlotEaten(slotAt(4), [shawarma])).toBe(true);
    expect(isSlotEaten(slotAt(1), [shawarma])).toBe(false);
    const plain = { custom: { name: 'Pizza', estimatedBy: 'manual' as const }, mealType: 'dinner' };
    expect(isSlotEaten(slotAt(4), [plain])).toBe(true);
  });

  it('a replacement of one dinner does not eat a SECOND dinner slot (explicit beats the type rule)', () => {
    const twoDinners = [
      { type: 'dinner', recipeId: 'a', slotIndex: 0 },
      { type: 'dinner', recipeId: 'b', slotIndex: 1 },
    ];
    const entry = {
      custom: { name: 'Pizza', estimatedBy: 'manual' as const },
      mealType: 'dinner',
      replacesSlot: { mealType: 'dinner', slotIndex: 0 },
    };
    expect(slotStates(twoDinners, [entry]).map((s) => s.status)).toEqual(['replaced', 'planned']);
    const r = resolveTodayMeals(twoDinners, 18, [entry]);
    expect(r.replaced.map((s) => s.recipeId)).toEqual(['a']);
    expect(r.next?.recipeId).toBe('b');
  });
});

describe('resolveTodayMeals — replaced and skipped slots', () => {
  const slots = [
    { type: 'breakfast', recipeId: 'oats', slotIndex: 0 },
    { type: 'lunch', recipeId: 'salad', slotIndex: 1 },
    { type: 'dinner', recipeId: 'curry', slotIndex: 2 },
  ];

  it('a replaced dinner is eaten (and listed as replaced); the spotlight moves on', () => {
    const entry = {
      custom: { name: 'Shawarma', estimatedBy: 'manual' as const },
      mealType: 'dinner',
      replacesSlot: { mealType: 'dinner', slotIndex: 2 },
    };
    const r = resolveTodayMeals(slots, 18, [entry]);
    expect(r.eaten.map((s) => s.recipeId)).toEqual(['curry']);
    expect(r.replaced.map((s) => s.recipeId)).toEqual(['curry']);
    expect(r.next).toBeNull();
    expect(r.later).toEqual([]);
  });

  it('a skipped lunch is neither next, later, nor eaten', () => {
    const r = resolveTodayMeals(slots, 11, [], [{ mealType: 'lunch', slotIndex: 1 }]);
    expect(r.skipped.map((s) => s.recipeId)).toEqual(['salad']);
    expect(r.eaten.map((s) => s.recipeId)).toEqual([]);
    expect(r.next?.recipeId).toBe('curry');
    expect(r.later).toEqual([]);
  });

  it('a skipped slot is not swallowed by a stray recipe entry of its meal type', () => {
    const stray = { recipeId: 'other', mealType: 'lunch' };
    const r = resolveTodayMeals(slots, 11, [stray], [{ mealType: 'lunch', slotIndex: 1 }]);
    expect(r.skipped.map((s) => s.recipeId)).toEqual(['salad']);
  });

  it('with nothing replaced or skipped the result is unchanged (empty extras)', () => {
    const r = resolveTodayMeals(slots, 7);
    expect(r.replaced).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.next?.recipeId).toBe('oats');
  });
});

describe('plannedTotals / remainingTotals', () => {
  const meals = [
    { kcal: 400, protein: 20, carbs: 40, fat: 10 },
    { kcal: 600, protein: 30, carbs: 60, fat: 20 },
    { kcal: 500, protein: 25, carbs: 50, fat: 15, portion: 1.5 },
  ];
  const states = [
    { status: 'eaten' as const },
    { status: 'replaced' as const },
    { status: 'planned' as const },
  ];

  it('planned excludes the replaced recipe but keeps the eaten and planned ones', () => {
    expect(plannedTotals(meals, states)).toEqual({
      kcal: 400 + 750,
      protein: 20 + 37.5,
      carbs: 40 + 75,
      fat: 10 + 22.5,
    });
  });

  it('remaining counts only planned slots, scaled by portion', () => {
    expect(remainingTotals(meals, states)).toEqual({
      kcal: 750,
      protein: 37.5,
      carbs: 75,
      fat: 22.5,
    });
  });

  it('a skipped slot leaves both', () => {
    const skipped = [{ status: 'skipped' as const }, ...states.slice(1)];
    expect(plannedTotals(meals, skipped).kcal).toBe(750);
    expect(remainingTotals(meals, skipped).kcal).toBe(750);
  });
});
