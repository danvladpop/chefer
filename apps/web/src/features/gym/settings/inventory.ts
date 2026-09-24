import {
  DEFAULT_DUMBBELLS_KG,
  DEFAULT_DUMBBELLS_LB,
  DEFAULT_PLATE_PAIRS_KG,
  DEFAULT_PLATE_PAIRS_LB,
  type EquipmentProfile,
  type SaveGymProfileInput,
  type WeightUnit,
} from '@chefer/types';
import { kgToUnit, unitToKg } from '@chefer/utils';
import { parseWeightInput } from '../setup/setup-payload';

// Equipment inventory editing, in the user's unit (stored in kg). Same
// defaults as the API's defaultInventory so "reset" and a unit switch agree.

export function defaultInventory(unit: WeightUnit): Omit<EquipmentProfile, 'unit'> {
  if (unit === 'LB') {
    return {
      barWeightKg: unitToKg(45, 'LB'),
      platePairsKg: DEFAULT_PLATE_PAIRS_LB.map((p) => unitToKg(p, 'LB')),
      dumbbellsKg: DEFAULT_DUMBBELLS_LB.map((p) => unitToKg(p, 'LB')),
      machineStepKg: unitToKg(10, 'LB'),
      cableStepKg: unitToKg(5, 'LB'),
      hasDipBelt: false,
      microPlates: false,
    };
  }
  return {
    barWeightKg: 20,
    platePairsKg: [...DEFAULT_PLATE_PAIRS_KG],
    dumbbellsKg: [...DEFAULT_DUMBBELLS_KG],
    machineStepKg: 5,
    cableStepKg: 2.5,
    hasDipBelt: false,
    microPlates: false,
  };
}

/** Plate sizes offered as toggles, in the unit (the standard set plus any the user has). */
export function plateChoices(unit: WeightUnit, current: number[]): number[] {
  const base: number[] = unit === 'LB' ? [...DEFAULT_PLATE_PAIRS_LB] : [...DEFAULT_PLATE_PAIRS_KG];
  const mine = current.map((kg) => kgToUnit(kg, unit));
  return [...new Set([...base, ...mine].map((v) => Math.round(v * 100) / 100))].sort(
    (a, b) => b - a,
  );
}

/** "2, 4, 6.5" (unit) → sorted unique kg list; junk entries are dropped. */
export function parseWeightList(text: string, unit: WeightUnit): number[] {
  const values = text
    .split(/[\s,;]+/)
    .map((t) => parseWeightInput(t))
    .filter((v): v is number => v !== null && v <= 1000)
    .map((v) => unitToKg(v, unit));
  return [...new Set(values)].sort((a, b) => a - b);
}

export function formatWeightList(kg: number[], unit: WeightUnit): string {
  return kg.map((v) => String(kgToUnit(v, unit))).join(', ');
}

export interface InventoryDraft {
  barWeight: string;
  plates: number[]; // in unit
  dumbbells: string;
  machineStep: string;
  cableStep: string;
  hasDipBelt: boolean;
  microPlates: boolean;
}

export function draftFrom(
  profile: Omit<EquipmentProfile, 'unit'>,
  unit: WeightUnit,
): InventoryDraft {
  return {
    barWeight: String(kgToUnit(profile.barWeightKg, unit)),
    plates: profile.platePairsKg.map((kg) => kgToUnit(kg, unit)),
    dumbbells: formatWeightList(profile.dumbbellsKg, unit),
    machineStep: String(kgToUnit(profile.machineStepKg, unit)),
    cableStep: String(kgToUnit(profile.cableStepKg, unit)),
    hasDipBelt: profile.hasDipBelt,
    microPlates: profile.microPlates,
  };
}

/** Draft → profile.save fields (kg). Invalid numbers keep the saved value (omitted). */
export function inventoryPayload(draft: InventoryDraft, unit: WeightUnit): SaveGymProfileInput {
  const out: SaveGymProfileInput = {
    platePairsKg: [...new Set(draft.plates)].map((p) => unitToKg(p, unit)).sort((a, b) => b - a),
    dumbbellsKg: parseWeightList(draft.dumbbells, unit),
    hasDipBelt: draft.hasDipBelt,
    microPlates: draft.microPlates,
  };
  const bar = parseWeightInput(draft.barWeight);
  if (bar !== null && bar <= 1000) out.barWeightKg = unitToKg(bar, unit);
  const machine = parseWeightInput(draft.machineStep);
  if (machine !== null) out.machineStepKg = Math.min(50, Math.max(0.5, unitToKg(machine, unit)));
  const cable = parseWeightInput(draft.cableStep);
  if (cable !== null) out.cableStepKg = Math.min(50, Math.max(0.5, unitToKg(cable, unit)));
  return out;
}
