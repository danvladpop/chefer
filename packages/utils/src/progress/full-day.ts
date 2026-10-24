import type { PlanSlotMealType } from '@chefer/types';

export type SlotRef = { mealType: PlanSlotMealType; slotIndex: number };

const slotKey = (s: SlotRef) => `${s.mealType}:${s.slotIndex}`;

/**
 * Full day (idea 29). With a plan: every plan slot is logged, replaced or
 * skipped (`handledSlots`) and at least two entries were logged. Without a
 * plan: at least three logged entries. Skipping a slot never lowers anything.
 */
export function isFullDay(input: {
  planSlots: SlotRef[];
  handledSlots: SlotRef[];
  loggedCount: number;
}): boolean {
  const { planSlots, handledSlots, loggedCount } = input;
  if (planSlots.length === 0) return loggedCount >= 3;
  const handled = new Set(handledSlots.map(slotKey));
  return planSlots.every((s) => handled.has(slotKey(s))) && loggedCount >= 2;
}
