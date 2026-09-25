import type { WeightUnit } from '@chefer/types';
import { unitToKg } from '@chefer/utils';
import type { RouterInputs } from '../../../lib/trpc';

export type SetOverrideInput = RouterInputs['gym']['progression']['setOverride'];

/** Override sheet form values (display unit, one rep target for every set) → the
 * `progression.setOverride` payload (kg, one rep target per set). Pure so the
 * unit conversion is unit-testable without mounting the sheet. */
export function buildOverridePayload(params: {
  exerciseId: string;
  repBucket: string;
  unit: WeightUnit;
  weightDisplay: number;
  repsDisplay: number;
  sets: number;
}): SetOverrideInput {
  const sets = Math.max(1, Math.round(params.sets));
  return {
    exerciseId: params.exerciseId,
    repBucket: params.repBucket,
    weightKg: unitToKg(params.weightDisplay, params.unit),
    reps: Array.from({ length: sets }, () => Math.round(params.repsDisplay)),
  };
}
