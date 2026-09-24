// Load arithmetic — research §1.3. Every weight the engine outputs must come
// from achievableLoads() for the slot's equipment and the user's inventory.
//
// Decisions (documented in the G1-A handoff):
// - BARBELL/SMITH: subset sums of the listed plate pairs (each listed pair used
//   at most once — list a plate twice to own two pairs) PLUS any number of extra
//   pairs of the heaviest plate (commercial gyms never run out of 20s/25s).
//   Micro plates add two 0.5 kg pairs (kg) or one 1.25 lb pair (lb).
// - LB users: plate/bar/step values are converted back to native pounds
//   (quarter-lb precision), summed in pounds, then stored as kg (0.01).
// - CABLE/MACHINE: multiples of the profile step (or the slot's override). The
//   catalog's incrementKg is ignored for stacks — the user's inventory is the
//   truth; a per-slot override covers odd machines.
// - EZ_BAR/KETTLEBELL/BAND: multiples of stepOverride ?? exercise.incrementKg.
// - BODYWEIGHT_PLUS: added load on a belt [0, 1.25, 2.5, 5, …] only with a dip
//   belt, else [0]. Plain BODYWEIGHT load type (push-up, plank) is always [0].
// - ASSISTED: multiples of the machine step including 0 (= unassisted). LESS
//   assistance is harder, so stepUp goes DOWN numerically.
import {
  LB_PER_KG,
  type EquipmentProfile,
  type ExerciseSlot,
  type WeightUnit,
} from '@chefer/types';

export type LoadSlot = Pick<ExerciseSlot, 'exercise' | 'stepOverrideKg'>;

export type LoadModel = 'PLATES' | 'LIST' | 'STACK' | 'BELT' | 'NONE' | 'ASSISTED';

/** Tolerance for comparing kg values stored at 0.01 precision. */
export const KG_EPS = 0.005;

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function round1(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

export function sameKg(a: number, b: number): boolean {
  return Math.abs(a - b) < KG_EPS;
}

/** Which arithmetic applies to this slot. */
export function loadModel(slot: LoadSlot): LoadModel {
  const { equipment, loadType } = slot.exercise;
  if (loadType === 'ASSISTED' || equipment === 'ASSISTED') {
    return 'ASSISTED';
  }
  if (loadType === 'BODYWEIGHT') {
    return 'NONE';
  }
  if (loadType === 'BODYWEIGHT_PLUS' || equipment === 'BODYWEIGHT') {
    return 'BELT';
  }
  if (equipment === 'BARBELL' || equipment === 'SMITH') {
    return 'PLATES';
  }
  if (equipment === 'DUMBBELL') {
    return 'LIST';
  }
  return 'STACK';
}

export function isAssisted(slot: LoadSlot): boolean {
  return loadModel(slot) === 'ASSISTED';
}

// ─── Unit space ──────────────────────────────────────────────────────────────

/** kg → the user's unit, at the precision equipment is labelled in. */
function toUnitSpace(kg: number, unit: WeightUnit): number {
  return unit === 'LB' ? Math.round(kg * LB_PER_KG * 4) / 4 : round2(kg);
}

/** kg → display number in the user's unit (lb rounded to 0.1). */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'LB' ? round1(kg * LB_PER_KG) : round2(kg);
}

/** Display number in the user's unit → kg (0.01 precision). */
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'LB' ? round2(value / LB_PER_KG) : round2(value);
}

// ─── Achievable loads ────────────────────────────────────────────────────────

const PLATE_SIDE_CAP = { KG: 250, LB: 550 } as const;
const STACK_CAP = { MACHINE: 500, OTHER: 250 } as const;
const BELT_CAP_KG = 100;
const ASSIST_CAP_KG = 120;
const MICRO_PLATES = { KG: [0.5, 0.5], LB: [1.25] } as const;

function platePairsInUnit(profile: EquipmentProfile): number[] {
  const plates = profile.platePairsKg.map((p) => toUnitSpace(p, profile.unit)).filter((p) => p > 0);
  if (profile.microPlates) {
    plates.push(...MICRO_PLATES[profile.unit]);
  }
  return plates.sort((a, b) => b - a);
}

function plateTotals(profile: EquipmentProfile): number[] {
  const bar = toUnitSpace(profile.barWeightKg, profile.unit);
  const plates = platePairsInUnit(profile).map((p) => Math.round(p * 100));
  const cap = PLATE_SIDE_CAP[profile.unit] * 100;
  let sums = new Set<number>([0]);
  for (const p of plates) {
    const next = new Set(sums);
    for (const s of sums) {
      if (s + p <= cap) {
        next.add(s + p);
      }
    }
    sums = next;
  }
  const heaviest = plates[0];
  if (heaviest !== undefined) {
    const withExtra = new Set(sums);
    for (const s of sums) {
      for (let v = s + heaviest; v <= cap; v += heaviest) {
        withExtra.add(v);
      }
    }
    sums = withExtra;
  }
  return [...sums].map((side) => unitToKg(bar + (2 * side) / 100, profile.unit));
}

function multiples(stepKg: number, fromZero: boolean, capKg: number, unit: WeightUnit): number[] {
  const stepU = Math.max(toUnitSpace(stepKg, unit), 0.25);
  const capU = toUnitSpace(capKg, unit);
  const out: number[] = fromZero ? [0] : [];
  for (let i = 1; i * stepU <= capU + 1e-9; i++) {
    out.push(unitToKg(i * stepU, unit));
  }
  return out;
}

function beltLoads(unit: WeightUnit): number[] {
  if (unit === 'LB') {
    const out = [0, 2.5];
    for (let v = 5; v <= BELT_CAP_KG * LB_PER_KG; v += 5) {
      out.push(v);
    }
    return out.map((v) => unitToKg(v, 'LB'));
  }
  const out = [0, 1.25];
  for (let v = 2.5; v <= BELT_CAP_KG; v += 2.5) {
    out.push(v);
  }
  return out;
}

function computeLoads(slot: LoadSlot, profile: EquipmentProfile): number[] {
  const override = slot.stepOverrideKg ?? null;
  switch (loadModel(slot)) {
    case 'ASSISTED':
      return multiples(override ?? profile.machineStepKg, true, ASSIST_CAP_KG, profile.unit);
    case 'NONE':
      return [0];
    case 'BELT':
      return profile.hasDipBelt ? beltLoads(profile.unit) : [0];
    case 'PLATES':
      return plateTotals(profile);
    case 'LIST': {
      const list = profile.dumbbellsKg.filter((d) => d > 0).map(round2);
      return list.length > 0 ? list : [round2(slot.exercise.incrementKg)];
    }
    case 'STACK': {
      const { equipment } = slot.exercise;
      if (equipment === 'MACHINE') {
        return multiples(override ?? profile.machineStepKg, false, STACK_CAP.MACHINE, profile.unit);
      }
      if (equipment === 'CABLE') {
        return multiples(override ?? profile.cableStepKg, false, STACK_CAP.OTHER, profile.unit);
      }
      return multiples(override ?? slot.exercise.incrementKg, false, STACK_CAP.OTHER, profile.unit);
    }
  }
}

const cache = new Map<string, readonly number[]>();

/** Cached, sorted, de-duplicated loads (internal: never mutate the result). */
export function loadsFor(slot: LoadSlot, profile: EquipmentProfile): readonly number[] {
  const model = loadModel(slot);
  const key = JSON.stringify([
    model,
    slot.exercise.equipment,
    model === 'STACK' || model === 'LIST' ? slot.exercise.incrementKg : 0,
    slot.stepOverrideKg ?? null,
    profile.unit,
    model === 'PLATES' ? [profile.barWeightKg, profile.platePairsKg, profile.microPlates] : null,
    model === 'LIST' ? profile.dumbbellsKg : null,
    profile.machineStepKg,
    profile.cableStepKg,
    profile.hasDipBelt,
  ]);
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const sorted = [...new Set(computeLoads(slot, profile))].sort((a, b) => a - b);
  const deduped = sorted.filter((v, i) => i === 0 || !sameKg(v, sorted[i - 1] ?? Number.NaN));
  if (cache.size > 256) {
    cache.clear();
  }
  cache.set(key, deduped);
  return deduped;
}

/** All achievable loads (kg, ascending) for this slot. ASSISTED = assistance values. */
export function achievableLoads(slot: LoadSlot, profile: EquipmentProfile): number[] {
  return [...loadsFor(slot, profile)];
}

export function isAchievable(kg: number, slot: LoadSlot, profile: EquipmentProfile): boolean {
  return loadsFor(slot, profile).some((v) => sameKg(v, kg));
}

function first(list: readonly number[]): number {
  return list[0] ?? 0;
}

function lastOf(list: readonly number[]): number {
  return list[list.length - 1] ?? 0;
}

function pick(list: readonly number[], steps: number, fallback: number): number {
  if (list.length === 0) {
    return fallback;
  }
  return list[Math.min(Math.max(steps, 1), list.length) - 1] ?? fallback;
}

/** Loads strictly above `kg`, ascending. */
function above(list: readonly number[], kg: number): number[] {
  return list.filter((v) => v > kg + KG_EPS);
}

/** Loads strictly below `kg`, descending. */
function below(list: readonly number[], kg: number): number[] {
  return list.filter((v) => v < kg - KG_EPS).reverse();
}

/** n-th achievable load strictly harder than `kg` (for ASSISTED: less assistance). */
export function stepUp(kg: number, slot: LoadSlot, profile: EquipmentProfile, steps = 1): number {
  const list = loadsFor(slot, profile);
  if (isAssisted(slot)) {
    return pick(below(list, kg), steps, first(list));
  }
  return pick(above(list, kg), steps, lastOf(list));
}

/** n-th achievable load strictly easier than `kg`. */
export function stepDown(kg: number, slot: LoadSlot, profile: EquipmentProfile, steps = 1): number {
  const list = loadsFor(slot, profile);
  if (isAssisted(slot)) {
    return pick(above(list, kg), steps, lastOf(list));
  }
  return pick(below(list, kg), steps, first(list));
}

/** Numeric rounding onto the achievable list ('down' = numerically lower, also for ASSISTED). */
export function roundToAchievable(
  kg: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
  mode: 'down' | 'nearest' | 'up',
): number {
  const list = loadsFor(slot, profile);
  if (mode === 'down') {
    return below(list, kg + 2 * KG_EPS)[0] ?? first(list);
  }
  if (mode === 'up') {
    return above(list, kg - 2 * KG_EPS)[0] ?? lastOf(list);
  }
  let best = first(list);
  for (const v of list) {
    if (Math.abs(v - kg) < Math.abs(best - kg) - KG_EPS) {
      best = v;
    }
  }
  return best;
}

// ─── Difficulty-aware helpers (ASSISTED inverts the axis) ────────────────────

/** Larger = harder. */
export function difficulty(kg: number, slot: LoadSlot): number {
  return isAssisted(slot) ? -kg : kg;
}

export function isHarder(a: number, b: number, slot: LoadSlot): boolean {
  return difficulty(a, slot) > difficulty(b, slot) + KG_EPS;
}

export function harderOf(a: number, b: number, slot: LoadSlot): number {
  return isHarder(b, a, slot) ? b : a;
}

export function easierOf(a: number, b: number, slot: LoadSlot): number {
  return isHarder(a, b, slot) ? b : a;
}

/** Can the engine prescribe anything harder than `kg`? */
export function canGoHarder(kg: number, slot: LoadSlot, profile: EquipmentProfile): boolean {
  return isHarder(stepUp(kg, slot, profile), kg, slot);
}

/**
 * A load `factor` × as hard (e.g. 0.9 = 10 % easier), rounded toward easier.
 * ASSISTED: divide the assistance (more help), rounded up.
 */
export function scaleEasier(
  kg: number,
  factor: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
): number {
  if (isAssisted(slot)) {
    return roundToAchievable(kg / factor, slot, profile, 'up');
  }
  return roundToAchievable(kg * factor, slot, profile, 'down');
}

/**
 * The standard progression increment (research §1.3 table), one step up from `kg`.
 * Barbell upper body: +2.5 kg (+5 lb), +1 kg (+2.5 lb) with micro plates at ≥ 60 kg
 * (135 lb). Barbell lower body: +5 kg (+10 lb) while `bigLowerStep` (beginner who
 * progressed last exposure), else +2.5 kg. Belt: +2.5 kg (+5 lb). Everything else:
 * the next achievable load. Returns `kg` unchanged when nothing harder exists.
 */
export function incrementLoad(
  kg: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
  opts: { bigLowerStep?: boolean; steps?: number } = {},
): number {
  const steps = Math.max(1, opts.steps ?? 1);
  let current = kg;
  for (let i = 0; i < steps; i++) {
    const next = oneIncrement(current, slot, profile, opts.bigLowerStep ?? false);
    if (!isHarder(next, current, slot)) {
      break;
    }
    current = next;
  }
  return current;
}

function oneIncrement(
  kg: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
  bigLowerStep: boolean,
): number {
  const model = loadModel(slot);
  const lb = profile.unit === 'LB';
  let incU: number | null = null;
  if (model === 'PLATES') {
    if (slot.exercise.isLowerBody) {
      incU = bigLowerStep ? (lb ? 10 : 5) : lb ? 5 : 2.5;
    } else if (profile.microPlates && kgToUnit(kg, profile.unit) >= (lb ? 135 : 60)) {
      incU = lb ? 2.5 : 1;
    } else {
      incU = lb ? 5 : 2.5;
    }
  } else if (model === 'BELT') {
    incU = lb ? 5 : 2.5;
  }
  if (incU === null) {
    return stepUp(kg, slot, profile);
  }
  const target = unitToKg(kgToUnit(kg, profile.unit) + incU, profile.unit);
  const rounded = roundToAchievable(target, slot, profile, 'up');
  return isHarder(rounded, kg, slot) ? rounded : stepUp(kg, slot, profile);
}

/**
 * Safety cap (research §1.3): a normal increase from `fromKg` is never more than
 * max(one standard step, 10 %). Calibration jumps are the only exception.
 */
export function capIncrease(
  candidateKg: number,
  fromKg: number,
  oneStepKg: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
): number {
  const tenPct = isAssisted(slot)
    ? roundToAchievable(fromKg - Math.abs(fromKg) * 0.1, slot, profile, 'up')
    : roundToAchievable(fromKg * 1.1, slot, profile, 'down');
  const limit = harderOf(oneStepKg, tenPct, slot);
  return easierOf(candidateKg, limit, slot);
}

/** Nearest achievable to `targetKg`, but at least one step harder than `fromKg` (calibration). */
export function roundNearestUp(
  targetKg: number,
  fromKg: number,
  slot: LoadSlot,
  profile: EquipmentProfile,
): number {
  const nearest = roundToAchievable(targetKg, slot, profile, 'nearest');
  return harderOf(nearest, stepUp(fromKg, slot, profile), slot);
}

// ─── Plate calculator & display ──────────────────────────────────────────────

/**
 * Plate calculator: plates per side (kg, heaviest first) for a barbell total,
 * greedy over the user's plate pairs (heaviest plate unlimited, as in
 * achievableLoads). `remainderKg` is what could not be loaded, per side.
 */
export function platesPerSide(
  totalKg: number,
  profile: EquipmentProfile,
): { plates: number[]; remainderKg: number } {
  const unit = profile.unit;
  const bar = toUnitSpace(profile.barWeightKg, unit);
  let side = (toUnitSpace(totalKg, unit) - bar) / 2;
  if (side <= 1e-9) {
    return { plates: [], remainderKg: 0 };
  }
  const available = platePairsInUnit(profile);
  const heaviest = available[0];
  const counts = new Map<number, number>();
  for (const p of available) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const plates: number[] = [];
  for (const p of [...counts.keys()].sort((a, b) => b - a)) {
    let left = p === heaviest ? Number.POSITIVE_INFINITY : (counts.get(p) ?? 0);
    while (left > 0 && side >= p - 1e-9) {
      plates.push(unitToKg(p, unit));
      side -= p;
      left -= 1;
    }
  }
  return { plates, remainderKg: unitToKg(Math.max(0, side), unit) };
}

function formatNumber(n: number): string {
  return String(round2(n));
}

/** "62.5" in the user's unit, no suffix. */
export function formatLoadNumber(kg: number, unit: WeightUnit): string {
  return formatNumber(kgToUnit(kg, unit));
}

export function unitLabel(unit: WeightUnit): string {
  return unit === 'LB' ? 'lb' : 'kg';
}

/** "62.5 kg", "135 lb", "BW + 10 kg", "BW", "25 kg assist". */
export function formatLoad(
  kg: number,
  unit: WeightUnit,
  loadType: 'WEIGHTED' | 'BODYWEIGHT' | 'BODYWEIGHT_PLUS' | 'ASSISTED' = 'WEIGHTED',
): string {
  const text = `${formatLoadNumber(kg, unit)} ${unitLabel(unit)}`;
  if (loadType === 'WEIGHTED') {
    return text;
  }
  if (kg <= KG_EPS) {
    return 'BW';
  }
  return loadType === 'ASSISTED' ? `${text} assist` : `BW + ${text}`;
}
