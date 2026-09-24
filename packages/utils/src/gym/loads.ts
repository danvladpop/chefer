// Load arithmetic — research §1.3. Every weight the engine outputs must come
// from achievableLoads() for the slot's equipment and the user's inventory.
import type { EquipmentProfile, ExerciseSlot, WeightUnit } from '@chefer/types';
import { notImplemented } from './_stub';

export type LoadSlot = Pick<ExerciseSlot, 'exercise' | 'stepOverrideKg'>;

/** All achievable loads (kg, ascending) for this slot. ASSISTED = assistance values. */
export function achievableLoads(slot: LoadSlot, profile: EquipmentProfile): number[] {
  return notImplemented(`achievableLoads(${slot.exercise.id}, ${profile.unit})`);
}

/** n-th achievable load strictly harder than `kg` (for ASSISTED: less assistance). */
export function stepUp(kg: number, slot: LoadSlot, profile: EquipmentProfile, steps = 1): number {
  return notImplemented(`stepUp(${kg}, ${slot.exercise.id}, ${profile.unit}, ${steps})`);
}

/** n-th achievable load strictly easier than `kg`. */
export function stepDown(kg: number, slot: LoadSlot, profile: EquipmentProfile, steps = 1): number {
  return notImplemented(`stepDown(${kg}, ${slot.exercise.id}, ${profile.unit}, ${steps})`);
}

export function roundToAchievable(
  kg: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
  mode: 'down' | 'nearest' | 'up',
): number {
  return notImplemented(`roundToAchievable(${kg}, ${slot.exercise.id}, ${profile.unit}, ${mode})`);
}

/** Plate calculator: plates per side (kg, heaviest first) for a barbell total. */
export function platesPerSide(
  totalKg: number,
  profile: EquipmentProfile,
): { plates: number[]; remainderKg: number } {
  return notImplemented(`platesPerSide(${totalKg}, ${profile.unit})`);
}

/** kg → display number in the user's unit (lb rounded to 0.1). */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return notImplemented(`kgToUnit(${kg}, ${unit})`);
}

/** Display number in the user's unit → kg (0.01 precision). */
export function unitToKg(value: number, unit: WeightUnit): number {
  return notImplemented(`unitToKg(${value}, ${unit})`);
}

/** "62.5 kg", "135 lb", "BW + 10 kg", "BW", "−25 kg assist". */
export function formatLoad(
  kg: number,
  unit: WeightUnit,
  loadType: 'WEIGHTED' | 'BODYWEIGHT' | 'BODYWEIGHT_PLUS' | 'ASSISTED' = 'WEIGHTED',
): string {
  return notImplemented(`formatLoad(${kg}, ${unit}, ${loadType})`);
}
