import type { DayState, LoggedMealEntry, SlotRefJson } from '@chefer/database';

/**
 * FB7-04: tracker state is keyed by the plan slot's index in the day's
 * `meals` (`LoggedMealEntry.slotIndex`, `replacesSlot`, `skippedSlots`).
 * Removing a slot shifts every later slot down by one, so the day's state has
 * to follow or a logged lunch would tick the wrong dish.
 *
 * - state pointing at a LATER slot moves down by one;
 * - a skip of the removed slot is dropped (the slot is gone);
 * - an entry logged from the removed slot stays (the food was eaten and the
 *   totals keep counting it) but loses its slot link — it becomes an ordinary
 *   unslotted entry;
 * - an "Ate something else" entry that replaced the removed slot keeps its
 *   numbers and loses `replacesSlot`.
 *
 * Pure: returns a new state (the same object when nothing needed to change).
 */
export function reindexDayStateAfterSlotRemoval(state: DayState, removedIndex: number): DayState {
  let changed = false;

  const entries = state.entries.map((entry): LoggedMealEntry => {
    let next = entry;
    if (entry.slotIndex !== undefined) {
      if (entry.slotIndex === removedIndex) {
        const { slotIndex: _drop, ...rest } = next;
        next = rest;
      } else if (entry.slotIndex > removedIndex) {
        next = { ...next, slotIndex: entry.slotIndex - 1 };
      }
    }
    const replaces = entry.replacesSlot;
    if (replaces) {
      if (replaces.slotIndex === removedIndex) {
        const { replacesSlot: _drop, ...rest } = next;
        next = rest;
      } else if (replaces.slotIndex > removedIndex) {
        next = {
          ...next,
          replacesSlot: { ...replaces, slotIndex: replaces.slotIndex - 1 },
        };
      }
    }
    if (next !== entry) changed = true;
    return next;
  });

  const skippedSlots = state.skippedSlots.flatMap((s): SlotRefJson[] => {
    if (s.slotIndex === removedIndex) {
      changed = true;
      return [];
    }
    if (s.slotIndex > removedIndex) {
      changed = true;
      return [{ ...s, slotIndex: s.slotIndex - 1 }];
    }
    return [s];
  });

  return changed ? { entries, skippedSlots } : state;
}
