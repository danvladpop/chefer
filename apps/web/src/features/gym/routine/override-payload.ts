// D5c target-level edit (gym_plan.md §0): the override sheet collects weight
// and reps in the user's display unit, but `gym.progression.setOverride`
// always takes kg (schemas.ts weightKgSchema) and a reps array — one entry per
// working set. Kept as a pure function so the kg conversion is unit-testable
// without mounting the sheet.
import type { WeightUnit } from '@chefer/types';
import { unitToKg } from '@chefer/utils';

export interface OverridePayloadInput {
  /** Weight in the user's display unit (kg or lb), as typed into the sheet. */
  weightDisplay: number;
  /** Reps (or seconds, for timed exercises) per working set, as typed into the sheet. */
  repsDisplay: number;
  unit: WeightUnit;
  /** Number of working sets the override applies to — one identical target per set. */
  sets: number;
}

export interface OverridePayload {
  weightKg: number;
  reps: number[];
}

/** Returns null for input that can't be saved (matches setOverrideInputSchema's bounds). */
export function buildOverridePayload({
  weightDisplay,
  repsDisplay,
  unit,
  sets,
}: OverridePayloadInput): OverridePayload | null {
  if (!Number.isFinite(weightDisplay) || weightDisplay < 0) return null;
  if (!Number.isFinite(repsDisplay) || repsDisplay < 0) return null;

  const weightKg = unitToKg(weightDisplay, unit);
  const repsPerSet = Math.round(repsDisplay);
  const setCount = Math.max(1, Math.min(10, Math.round(sets)));
  return { weightKg, reps: Array.from({ length: setCount }, () => repsPerSet) };
}
