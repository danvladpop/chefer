import type { PlanShape } from '@chefer/types';

// The "how you cook" edits and their validation, shared by the HowYouCookForm
// (onboarding, the old Plan settings sheet) and the new shell's Meal settings
// screen — one rule set, never forked: at least one meal, at least one day,
// days kept in week order, "No limit" stored as a null time cap.

export type TimeCapValue = '15' | '30' | '45' | 'none';

/** The shape with these meals, or null when none is left (pick at least one meal). */
export function withSlots(shape: PlanShape, slots: PlanShape['slots']): PlanShape | null {
  if (slots.length === 0) return null;
  return { ...shape, slots };
}

/** The shape with these days in week order, or null when none is left (pick at least one day). */
export function withDays(shape: PlanShape, days: readonly number[]): PlanShape | null {
  if (days.length === 0) return null;
  return { ...shape, days: [...days].sort((a, b) => a - b) };
}

/** The segmented control's value for the shape's time cap. */
export function timeCapValue(shape: Pick<PlanShape, 'timeCapMins'>): TimeCapValue {
  return shape.timeCapMins == null ? 'none' : (String(shape.timeCapMins) as TimeCapValue);
}

/** The shape with the time cap the segmented control picked. */
export function withTimeCap(shape: PlanShape, value: TimeCapValue): PlanShape {
  return { ...shape, timeCapMins: value === 'none' ? null : (Number(value) as 15 | 30 | 45) };
}
