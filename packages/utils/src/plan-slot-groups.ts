// FB7-04: a plan day is a flat list of slots (`MealPlanDay.meals`) and several
// slots may share a meal type — a main plus a side dish, or two snacks. The
// Plan renders those as ONE meal group: a single type header, the first slot
// as the main card, the rest as compact side cards. Pure, so mobile and web
// group identically.

export type DaySlotEntry<T> = {
  meal: T;
  /** The slot's index in the day's `meals` — what every slot API call takes. */
  slotIndex: number;
};

export type DaySlotGroup<T> = {
  mealType: string;
  /** The first slot of the type (lowest index). */
  main: DaySlotEntry<T>;
  /** Every later slot of the same type, in plan order. */
  sides: DaySlotEntry<T>[];
  /** Main then sides — what the group total sums. */
  entries: DaySlotEntry<T>[];
};

/**
 * Groups a day's slots by meal type. Groups come in the order each type first
 * appears; inside a group slots keep plan order. Every entry keeps its ORIGINAL
 * `slotIndex`, so swapping, pinning or removing a side still addresses the
 * right slot after grouping reorders the display.
 */
export function groupDaySlots<T extends { type: string }>(meals: readonly T[]): DaySlotGroup<T>[] {
  const byType = new Map<string, DaySlotEntry<T>[]>();
  meals.forEach((meal, slotIndex) => {
    const entries = byType.get(meal.type);
    if (entries) entries.push({ meal, slotIndex });
    else byType.set(meal.type, [{ meal, slotIndex }]);
  });
  return [...byType.entries()].flatMap(([mealType, entries]) => {
    const [main, ...sides] = entries;
    return main ? [{ mealType, main, sides, entries }] : [];
  });
}

/** Whether removing the slot would leave its meal type on the day (the API's rule). */
export function canRemoveSlot(meals: readonly { type: string }[], slotIndex: number): boolean {
  const type = meals[slotIndex]?.type;
  if (type === undefined) return false;
  return meals.filter((m) => m.type === type).length > 1;
}
