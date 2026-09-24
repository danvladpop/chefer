// Shared fixtures for the gym engine tests (not exported from the package index).
import {
  DEFAULT_DUMBBELLS_KG,
  DEFAULT_PLATE_PAIRS_KG,
  EXERCISE_BY_ID,
  type EquipmentProfile,
  type ExerciseMeta,
  type ExerciseSlot,
  type Exposure,
  type Rir,
} from '@chefer/types';
import type { ExerciseLookup } from './volume';

export const KG_PROFILE: EquipmentProfile = {
  unit: 'KG',
  barWeightKg: 20,
  platePairsKg: [...DEFAULT_PLATE_PAIRS_KG],
  dumbbellsKg: [...DEFAULT_DUMBBELLS_KG],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
};

export const lookup: ExerciseLookup = (id) => EXERCISE_BY_ID.get(id);

export function meta(id: string): ExerciseMeta {
  const m = EXERCISE_BY_ID.get(id);
  if (!m) {
    throw new Error(`unknown exercise ${id}`);
  }
  return m;
}

export function slotFor(
  id: string,
  sets: number,
  repMin: number,
  repMax: number,
  extra: Partial<ExerciseSlot> = {},
): ExerciseSlot {
  const exercise = meta(id);
  return {
    exercise,
    sets,
    repMin,
    repMax,
    targetRir: exercise.category === 'ISOLATION' ? 1 : 2,
    restSec: exercise.restSec,
    ...extra,
  };
}

let counter = 0;

/** An exposure of `slot` on `localDate` with straight sets at `weightKg`. */
export function exposureOf(
  slot: ExerciseSlot,
  localDate: string,
  weightKg: number,
  reps: number[],
  rir: Rir | null = null,
  opts: Partial<Exposure> & { sets?: number } = {},
): Exposure {
  counter += 1;
  return {
    sessionId: opts.sessionId ?? `s-${localDate}-${counter}`,
    localDate,
    performedAt: opts.performedAt ?? `${localDate}T18:00:00.000Z`,
    sets: opts.sets ?? slot.sets,
    repMin: slot.repMin,
    repMax: slot.repMax,
    targetRir: slot.targetRir,
    loggedSets: opts.loggedSets ?? [
      { weightKg: weightKg * 0.5, reps: 8, isWarmup: true, completed: true },
      ...reps.map((r) => ({ weightKg, reps: r, isWarmup: false, completed: true })),
    ],
    lastSetRir: rir,
    wasDeload: opts.wasDeload ?? false,
    skipped: opts.skipped ?? false,
  };
}
