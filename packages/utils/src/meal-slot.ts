import type { PlanSlot } from '@chefer/types';

// ─── Default meal slot by time of day (bug B-36, T-19.1) ──────────────────────
// Shared by Quick add and Snap-to-log so a log entered at any hour lands in a
// sensible slot instead of always defaulting to Lunch.

/** The slot a meal logged at this local hour (0-23) most likely belongs to. */
export function defaultMealSlot(localHour: number): PlanSlot {
  if (localHour < 5) return 'dinner'; // late night — treat as last night's dinner
  if (localHour < 11) return 'breakfast';
  if (localHour < 15) return 'lunch';
  if (localHour < 21) return 'dinner';
  return 'snack';
}
