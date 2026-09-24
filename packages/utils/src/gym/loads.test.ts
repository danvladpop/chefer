import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLATE_PAIRS_LB,
  type EquipmentProfile,
  type ExerciseMeta,
  type ExerciseSlot,
} from '@chefer/types';
import {
  achievableLoads,
  capIncrease,
  formatLoad,
  incrementLoad,
  isAchievable,
  kgToUnit,
  loadModel,
  platesPerSide,
  roundNearestUp,
  roundToAchievable,
  scaleEasier,
  stepDown,
  stepUp,
  unitToKg,
} from './loads';
import { KG_PROFILE, meta, slotFor } from './test-fixtures';

const P = KG_PROFILE;
const LB: EquipmentProfile = {
  ...P,
  unit: 'LB',
  barWeightKg: unitToKg(45, 'LB'),
  platePairsKg: DEFAULT_PLATE_PAIRS_LB.map((p) => unitToKg(p, 'LB')),
};
const bench = slotFor('barbell-bench-press', 3, 8, 12);
const squat = slotFor('back-squat', 3, 6, 8);
const dbPress = slotFor('dumbbell-bench-press', 3, 8, 12);
const legPress = slotFor('leg-press', 3, 10, 15);
const pulldown = slotFor('lat-pulldown', 3, 8, 12);
const preacher = slotFor('preacher-curl', 2, 10, 15);
const pullUp = slotFor('pull-up', 3, 5, 10);
const pushUp = slotFor('push-up', 3, 8, 20);
const assisted = slotFor('assisted-pull-up', 3, 6, 10);

describe('achievableLoads', () => {
  it('barbell: bar + 2 × plate sums, every 2.5 kg, heaviest plate unlimited', () => {
    const loads = achievableLoads(bench, P);
    expect(loads.slice(0, 4)).toEqual([20, 22.5, 25, 27.5]);
    expect(loads).toContain(177.5);
    expect(loads).toContain(300);
    expect(loads.every((v, i) => i === 0 || v > (loads[i - 1] ?? 0))).toBe(true);
  });

  it('barbell: each listed pair is used at most once (except the heaviest)', () => {
    const loads = achievableLoads(bench, { ...P, platePairsKg: [20, 10] });
    expect(loads.slice(0, 5)).toEqual([20, 40, 60, 80, 100]);
    expect(loads).not.toContain(50);
    expect(achievableLoads(bench, { ...P, platePairsKg: [] })).toEqual([20]);
  });

  it('micro plates add 1 kg steps', () => {
    const micro = { ...P, microPlates: true };
    expect(isAchievable(61, bench, micro)).toBe(true);
    expect(isAchievable(61, bench, P)).toBe(false);
  });

  it('lb gyms sum native lb plates (5 lb steps from a 45 lb bar)', () => {
    const lbs = achievableLoads(bench, LB).map((kg) => kgToUnit(kg, 'LB'));
    expect(lbs.slice(0, 3)).toEqual([45, 50, 55]);
    expect(lbs).toContain(135);
    expect(lbs).toContain(225);
  });

  it('dumbbells use the inventory list', () => {
    expect(achievableLoads(dbPress, P).slice(0, 4)).toEqual([2, 4, 6, 8]);
    expect(achievableLoads(dbPress, { ...P, dumbbellsKg: [] })).toEqual([2]);
  });

  it('machines and cables use the profile step (or the slot override); the catalog increment is ignored', () => {
    expect(achievableLoads(legPress, P).slice(0, 3)).toEqual([5, 10, 15]);
    const odd = { ...legPress, stepOverrideKg: 7 };
    expect(achievableLoads(odd, P).slice(0, 3)).toEqual([7, 14, 21]);
    expect(achievableLoads(pulldown, P).slice(0, 3)).toEqual([2.5, 5, 7.5]);
    expect(achievableLoads(preacher, P).slice(0, 3)).toEqual([2.5, 5, 7.5]);
  });

  it('bodyweight: belt loads only with a dip belt; plain bodyweight never', () => {
    expect(achievableLoads(pullUp, P)).toEqual([0]);
    expect(achievableLoads(pullUp, { ...P, hasDipBelt: true }).slice(0, 5)).toEqual([
      0, 1.25, 2.5, 5, 7.5,
    ]);
    const lbBelt = achievableLoads(pullUp, { ...LB, hasDipBelt: true }).map((k) =>
      kgToUnit(k, 'LB'),
    );
    expect(lbBelt.slice(0, 4)).toEqual([0, 2.5, 5, 10]);
    expect(achievableLoads(pushUp, { ...P, hasDipBelt: true })).toEqual([0]);
    const custom: ExerciseMeta = { ...meta('push-up'), loadType: 'WEIGHTED' };
    const slot: ExerciseSlot = { ...pushUp, exercise: custom };
    expect(loadModel(slot)).toBe('BELT');
  });

  it('assisted: multiples of the machine step including 0 (unassisted)', () => {
    const loads = achievableLoads(assisted, P);
    expect(loads.slice(0, 3)).toEqual([0, 5, 10]);
    expect(loads[loads.length - 1]).toBe(120);
  });

  it('survives many distinct profiles (cache eviction)', () => {
    for (let i = 0; i < 300; i++) {
      expect(achievableLoads(legPress, { ...P, machineStepKg: 1 + i / 100 })[0]).toBeCloseTo(
        1 + i / 100,
        2,
      );
    }
  });

  it('returns a copy callers may mutate', () => {
    const a = achievableLoads(legPress, P);
    a.push(-1);
    expect(achievableLoads(legPress, P)).not.toContain(-1);
  });
});

describe('stepping and rounding', () => {
  it('steps through the list, clamping at the ends', () => {
    expect(stepUp(8, dbPress, P)).toBe(10);
    expect(stepUp(9, dbPress, P)).toBe(10);
    expect(stepUp(8, dbPress, P, 2)).toBe(12);
    expect(stepDown(8, dbPress, P)).toBe(6);
    expect(stepUp(50, dbPress, P)).toBe(50);
    expect(stepDown(2, dbPress, P)).toBe(2);
  });

  it('assisted: stepping up means less assistance', () => {
    expect(stepUp(30, assisted, P)).toBe(25);
    expect(stepUp(0, assisted, P)).toBe(0);
    expect(stepDown(30, assisted, P)).toBe(35);
    expect(stepDown(120, assisted, P)).toBe(120);
  });

  it('rounds down / up / nearest (ties go lighter)', () => {
    expect(roundToAchievable(63, bench, P, 'down')).toBe(62.5);
    expect(roundToAchievable(63, bench, P, 'up')).toBe(65);
    expect(roundToAchievable(63, bench, P, 'nearest')).toBe(62.5);
    expect(roundToAchievable(61.25, bench, P, 'nearest')).toBe(60);
    expect(roundToAchievable(10, bench, P, 'down')).toBe(20);
    expect(roundToAchievable(9999, bench, P, 'up')).toBe(520);
  });

  it('standard increments per equipment (research §1.3)', () => {
    expect(incrementLoad(60, bench, P)).toBe(62.5);
    expect(incrementLoad(60, squat, P)).toBe(62.5);
    expect(incrementLoad(60, squat, P, { bigLowerStep: true })).toBe(65);
    expect(incrementLoad(60, bench, P, { steps: 2 })).toBe(65);
    expect(incrementLoad(50, bench, { ...P, microPlates: true })).toBe(52.5);
    expect(incrementLoad(60, bench, { ...P, microPlates: true })).toBe(61);
    expect(incrementLoad(40, legPress, P)).toBe(45);
    expect(incrementLoad(0, pullUp, { ...P, hasDipBelt: true })).toBe(2.5);
    expect(incrementLoad(0, pullUp, P)).toBe(0);
    expect(incrementLoad(520, bench, P)).toBe(520);
    const lbUp = (lb: number, slot: ExerciseSlot, profile: EquipmentProfile, big = false) =>
      kgToUnit(incrementLoad(unitToKg(lb, 'LB'), slot, profile, { bigLowerStep: big }), 'LB');
    expect(lbUp(135, bench, LB)).toBe(140);
    expect(lbUp(135, squat, LB)).toBe(140);
    expect(lbUp(135, squat, LB, true)).toBe(145);
    expect(lbUp(135, bench, { ...LB, microPlates: true })).toBe(137.5);
    expect(lbUp(0, pullUp, { ...LB, hasDipBelt: true })).toBe(5);
  });

  it('caps a normal increase at max(one step, 10 %)', () => {
    expect(capIncrease(90, 60, 62.5, bench, P)).toBe(65);
    expect(capIncrease(62.5, 60, 62.5, bench, P)).toBe(62.5);
    expect(capIncrease(12, 8, 10, dbPress, P)).toBe(10);
    expect(capIncrease(20, 30, 25, assisted, P)).toBe(25);
  });

  it('calibration rounding: nearest, but at least one step up', () => {
    expect(roundNearestUp(24, 20, bench, P)).toBe(25);
    expect(roundNearestUp(20.5, 20, bench, P)).toBe(22.5);
  });

  it('scales toward easier (assisted: more help)', () => {
    expect(scaleEasier(70, 0.9, bench, P)).toBe(62.5);
    expect(scaleEasier(30, 0.9, assisted, P)).toBe(35);
    expect(scaleEasier(0, 0.9, pullUp, P)).toBe(0);
  });
});

describe('plate calculator', () => {
  it('greedily loads the heaviest plates first', () => {
    expect(platesPerSide(100, P)).toEqual({ plates: [25, 15], remainderKg: 0 });
    expect(platesPerSide(102.5, P)).toEqual({ plates: [25, 15, 1.25], remainderKg: 0 });
    expect(platesPerSide(300, P)).toEqual({ plates: [25, 25, 25, 25, 25, 15], remainderKg: 0 });
    expect(platesPerSide(20, P)).toEqual({ plates: [], remainderKg: 0 });
    expect(platesPerSide(10, P)).toEqual({ plates: [], remainderKg: 0 });
  });

  it('reports what cannot be loaded (per side)', () => {
    expect(platesPerSide(50, { ...P, platePairsKg: [20, 10] })).toEqual({
      plates: [10],
      remainderKg: 5,
    });
    expect(platesPerSide(61, { ...P, microPlates: true })).toEqual({
      plates: [20, 0.5],
      remainderKg: 0,
    });
  });

  it('works in native pounds', () => {
    const r = platesPerSide(unitToKg(135, 'LB'), LB);
    expect(r.plates.map((p) => kgToUnit(p, 'LB'))).toEqual([45]);
    expect(r.remainderKg).toBe(0);
  });
});

describe('units and display', () => {
  it('converts kg ↔ lb at display / storage precision', () => {
    expect(kgToUnit(100, 'LB')).toBe(220.5);
    expect(kgToUnit(62.504, 'KG')).toBe(62.5);
    expect(unitToKg(135, 'LB')).toBe(61.23);
    expect(unitToKg(62.555, 'KG')).toBe(62.56);
  });

  it('formats loads per load type', () => {
    expect(formatLoad(62.5, 'KG')).toBe('62.5 kg');
    expect(formatLoad(unitToKg(135, 'LB'), 'LB')).toBe('135 lb');
    expect(formatLoad(0, 'KG', 'BODYWEIGHT')).toBe('BW');
    expect(formatLoad(10, 'KG', 'BODYWEIGHT_PLUS')).toBe('BW + 10 kg');
    expect(formatLoad(25, 'KG', 'ASSISTED')).toBe('25 kg assist');
    expect(formatLoad(0, 'KG', 'ASSISTED')).toBe('BW');
  });
});
