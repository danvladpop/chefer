import { describe, expect, it } from 'vitest';
import type {
  EquipmentProfile,
  ExerciseSlot,
  ProgressionState,
  Rir,
  TrainingExperience,
} from '@chefer/types';
import {
  applyExposure,
  breakFactor,
  deloadPrescription,
  explain,
  fitTargets,
  foldHistory,
  initialState,
  lastPerformedKg,
  prescribe,
  progressionKey,
  repBucket,
  sortExposures,
  startingGuessKg,
  targetsAfterIncrease,
} from './progression';
import { exposureOf, KG_PROFILE, slotFor } from './test-fixtures';

const P = KG_PROFILE;
const BELT: EquipmentProfile = { ...P, hasDipBelt: true };
const MICRO: EquipmentProfile = { ...P, microPlates: true };
const INT = 'INTERMEDIATE' as const;
const BEG = 'BEGINNER' as const;

function known(slot: ExerciseSlot, kg: number, profile = P, experience: TrainingExperience = INT) {
  return initialState({ slot, profile, experience, knownWeightKg: kg });
}

function fresh(slot: ExerciseSlot, experience: TrainingExperience = BEG, profile = P) {
  return initialState({ slot, profile, experience });
}

function step(
  slot: ExerciseSlot,
  state: ProgressionState,
  date: string,
  kg: number,
  reps: number[],
  rir: Rir | null = null,
  opts: { profile?: EquipmentProfile; experience?: TrainingExperience; sets?: number } = {},
) {
  return applyExposure({
    slot,
    state,
    exposure: exposureOf(slot, date, kg, reps, rir, opts.sets ? { sets: opts.sets } : {}),
    profile: opts.profile ?? P,
    experience: opts.experience ?? INT,
  });
}

function rx(
  slot: ExerciseSlot,
  state: ProgressionState,
  today: string,
  extra: { ageYears?: number | null; deload?: boolean; profile?: EquipmentProfile } = {},
) {
  return prescribe({
    slot,
    state,
    override: null,
    profile: extra.profile ?? P,
    facts: { experience: INT, ageYears: extra.ageYears ?? null },
    today,
    deload: extra.deload ?? false,
  });
}

const bench = slotFor('barbell-bench-press', 3, 8, 12);
const squat = slotFor('back-squat', 3, 6, 8);
const goblet = slotFor('goblet-squat', 3, 8, 12);
const pullUp = slotFor('pull-up', 3, 5, 10);
const assisted = slotFor('assisted-pull-up', 3, 6, 10);
const pushUp = slotFor('push-up', 3, 8, 20);
const plank = slotFor('plank', 2, 30, 60);
const carry = slotFor('farmers-carry', 2, 30, 45);
const lateral = slotFor('dumbbell-lateral-raise', 3, 12, 20);
const legPress = slotFor('leg-press', 3, 10, 15);

describe('keys and helpers', () => {
  it('builds rep buckets and progression keys', () => {
    expect(repBucket(8, 12)).toBe('8-12');
    expect(progressionKey('barbell-bench-press', '8-12')).toBe('barbell-bench-press|8-12');
  });

  it('fits target lists to a set count', () => {
    expect(fitTargets([], 3, 7)).toEqual([7, 7, 7]);
    expect(fitTargets([10, 9], 3, 0)).toEqual([10, 9, 9]);
    expect(fitTargets([1, 2, 3], 2, 0)).toEqual([1, 2]);
  });

  it('predicts reps after an increase with Epley, clamped into the range', () => {
    const base = { repMin: 8, repMax: 12, targetRir: 2, bodyweightStyle: false };
    expect(targetsAfterIncrease({ ...base, fromKg: 60, toKg: 62.5, lastReps: 12, rir: 2 })).toBe(
      10,
    );
    expect(targetsAfterIncrease({ ...base, fromKg: 60, toKg: 90, lastReps: 12, rir: 2 })).toBe(8);
    expect(targetsAfterIncrease({ ...base, fromKg: 60, toKg: 60.5, lastReps: 12, rir: 3 })).toBe(
      11,
    );
    expect(
      targetsAfterIncrease({
        ...base,
        bodyweightStyle: true,
        fromKg: 0,
        toKg: 2.5,
        lastReps: 12,
        rir: 2,
      }),
    ).toBe(9);
    expect(targetsAfterIncrease({ ...base, fromKg: 0, toKg: 2.5, lastReps: 12, rir: null })).toBe(
      9,
    );
  });

  it('maps break gaps to re-entry factors (research §1.8 table)', () => {
    expect(breakFactor(14, null)).toBeNull();
    expect(breakFactor(15, null)).toBe('hold');
    expect(breakFactor(28, 70)).toBe(0.9);
    expect(breakFactor(29, null)).toBe(0.9);
    expect(breakFactor(56, 65)).toBe(0.8);
    expect(breakFactor(57, null)).toBe(0.8);
    expect(breakFactor(112, 80)).toBe(0.7);
    expect(breakFactor(113, null)).toBe(0.7);
  });
});

describe('initialState & starting guesses (research §1.7)', () => {
  const cases: [string, number, number, number, TrainingExperience, number][] = [
    ['barbell-bench-press', 3, 8, 12, BEG, 20],
    ['barbell-bench-press', 3, 8, 12, INT, 30],
    ['back-squat', 3, 6, 8, INT, 40],
    ['barbell-curl', 2, 8, 12, INT, 30],
    ['dumbbell-bench-press', 3, 8, 12, BEG, 8],
    ['dumbbell-bench-press', 3, 8, 12, INT, 14],
    ['dumbbell-lateral-raise', 3, 12, 20, BEG, 4],
    ['dumbbell-lateral-raise', 3, 12, 20, INT, 8],
    ['dumbbell-curl', 2, 10, 15, BEG, 6],
    ['dumbbell-curl', 2, 10, 15, INT, 10],
    ['goblet-squat', 3, 8, 12, INT, 20],
    ['bulgarian-split-squat', 2, 8, 12, BEG, 8],
    ['farmers-carry', 2, 30, 45, BEG, 16],
    ['farmers-carry', 2, 30, 45, INT, 25], // 24 → nearest pair on the list
    ['leg-press', 3, 10, 15, BEG, 15],
    ['leg-extension', 2, 10, 15, INT, 20],
    ['lat-pulldown', 3, 8, 12, BEG, 15],
    ['triceps-pushdown', 2, 10, 15, INT, 10],
    ['preacher-curl', 2, 10, 15, BEG, 5],
    ['pull-up', 3, 5, 10, BEG, 0],
    ['push-up', 3, 8, 20, INT, 0],
    ['assisted-pull-up', 3, 6, 10, BEG, 40],
    ['assisted-pull-up', 3, 6, 10, INT, 20],
  ];
  it.each(cases)('%s (%d×%d–%d, %s) starts at %d kg', (id, sets, lo, hi, exp, kg) => {
    const slot = slotFor(id, sets, lo, hi);
    expect(initialState({ slot, profile: P, experience: exp }).next.weightKg).toBe(kg);
  });

  it('uses the per-slot step override for stack starting guesses', () => {
    const slot = slotFor('leg-press', 3, 10, 15, { stepOverrideKg: 7 });
    expect(startingGuessKg(slot, P, BEG)).toBe(21);
    expect(fresh(slot).next.weightKg).toBe(21);
  });

  it('calibrates weighted lifts without a known weight, asking for the full range', () => {
    const s = fresh(bench);
    expect(s.calibrating).toBe(true);
    expect(s.next.reasonCode).toBe('START_CALIBRATING');
    expect(s.next.kind).toBe('start');
    expect(s.next.reps).toEqual([12, 12, 12]);
    expect(lastPerformedKg(s)).toBeNull();
  });

  it('skips calibration for known weights, bodyweight, assisted and timed work', () => {
    const k = known(bench, 61);
    expect(k.calibrating).toBe(false);
    expect(k.next.weightKg).toBe(60);
    expect(k.next.reasonCode).toBe('START');
    expect(k.next.reps).toEqual([8, 8, 8]);
    for (const slot of [pullUp, assisted, plank, carry]) {
      expect(fresh(slot).calibrating).toBe(false);
    }
  });
});

describe('applyExposure — bookkeeping', () => {
  it('ignores skipped exposures', () => {
    const s = known(bench, 60);
    const e = exposureOf(bench, '2026-09-01', 60, [12, 12, 12], 2, { skipped: true });
    expect(applyExposure({ slot: bench, state: s, exposure: e, profile: P, experience: INT })).toBe(
      s,
    );
  });

  it('treats an exposure with no ticked working set as INCOMPLETE', () => {
    const s = known(bench, 60);
    const e = exposureOf(bench, '2026-09-01', 60, [], null, {
      loggedSets: [{ weightKg: 60, reps: 10, isWarmup: false, completed: false }],
    });
    const out = applyExposure({ slot: bench, state: s, exposure: e, profile: P, experience: INT });
    expect(out.next.reasonCode).toBe('INCOMPLETE');
    expect(out.next.weightKg).toBe(60);
    expect(out.next.inputs['lastWeightKg']).toBeNull();
    expect(out.lastExposureDate).toBe('2026-09-01');
  });

  it('uses the lightest working weight when sets differ, snapped to achievable', () => {
    const s = known(bench, 60);
    const e = exposureOf(bench, '2026-09-01', 0, [], 1, {
      loggedSets: [
        { weightKg: 62.5, reps: 10, isWarmup: false, completed: true },
        { weightKg: 61, reps: 10, isWarmup: false, completed: true },
        { weightKg: 62.5, reps: 9, isWarmup: false, completed: true },
      ],
    });
    const out = applyExposure({ slot: bench, state: s, exposure: e, profile: P, experience: INT });
    expect(out.next.inputs['lastWeightKg']).toBe(60);
    expect(out.next.weightKg).toBe(60);
    expect(out.lastTotalReps).toBe(10);
  });

  it('counts progress against a baseline even without a stored rep total', () => {
    const base = known(bench, 60);
    const crafted: ProgressionState = {
      ...base,
      stallCount: 2,
      lastTotalReps: null,
      next: { ...base.next, inputs: { ...base.next.inputs, baselineKg: 60, lastWeightKg: 60 } },
    };
    const out = step(bench, crafted, '2026-09-01', 60, [10, 10, 10], 1);
    expect(out.stallCount).toBe(0);
    expect(out.lastTotalReps).toBe(30);
  });

  it('keeps the best rep total at the same weight', () => {
    let s = step(bench, known(bench, 60), '2026-09-01', 60, [10, 10, 10], 1);
    s = step(bench, s, '2026-09-04', 60, [10, 9, 9], 1);
    expect(s.lastTotalReps).toBe(30);
    expect(s.stallCount).toBe(1);
  });
});

describe('applyExposure — load progression branches', () => {
  it('adds +5 kg on lower-body barbell lifts for beginners who progressed', () => {
    const s = step(squat, known(squat, 60, P, BEG), '2026-09-01', 60, [8, 8, 8], 1, {
      experience: BEG,
    });
    expect(s.next.weightKg).toBe(65);
    expect(s.next.reasonCode).toBe('TOP_OF_RANGE');
  });

  it('adds +1 kg on upper-body barbell lifts with micro plates at ≥ 60 kg', () => {
    const s = step(bench, known(bench, 60, MICRO), '2026-09-01', 60, [12, 12, 12], 1, {
      profile: MICRO,
    });
    expect(s.next.weightKg).toBe(61);
  });

  it('holds with a maxed-out hint when no heavier load exists', () => {
    const s = step(lateral, known(lateral, 50), '2026-09-01', 50, [20, 20, 20], 1);
    expect(s.next.reasonCode).toBe('STALL_SUGGEST_SWAP');
    expect(s.next.kind).toBe('hold');
    expect(s.next.inputs['maxedOut']).toBe(true);
    expect(explain(s.next, 'KG')).toMatch(/maxed out/);
  });

  it('adds sets to bodyweight work up to 5, then suggests a harder variation', () => {
    let s = known(pullUp, 0);
    s = step(pullUp, s, '2026-09-01', 0, [10, 10, 10], 1);
    s = step(pullUp, s, '2026-09-04', 0, [10, 10, 10, 10], 1, { sets: 4 });
    expect(s.next.sets).toBe(5);
    s = step(pullUp, s, '2026-09-08', 0, [10, 10, 10, 10, 10], 1, { sets: 5 });
    expect(s.next.reasonCode).toBe('STALL_SUGGEST_SWAP');
    expect(s.next.sets).toBe(5);
  });

  it('adds load on a dip belt at the top of the range (BW_ADD_LOAD)', () => {
    const s = step(pullUp, known(pullUp, 0, BELT), '2026-09-01', 0, [10, 10, 10], 1, {
      profile: BELT,
    });
    expect(s.next.reasonCode).toBe('BW_ADD_LOAD');
    expect(s.next.weightKg).toBe(2.5);
    expect(s.next.reps).toEqual([6, 6, 6]);
    expect(explain(s.next, 'KG')).toBe('Top of the range, so add 2.5 kg on the belt.');
  });

  it('adds belt load early when the last set had 3+ left past the midpoint', () => {
    const s = step(pullUp, known(pullUp, 2.5, BELT), '2026-09-01', 2.5, [8, 8, 8], 3, {
      profile: BELT,
    });
    expect(s.next.reasonCode).toBe('BW_ADD_LOAD');
    expect(s.next.weightKg).toBe(5);
    expect(explain(s.next, 'KG')).toBe(
      'Your last set had 3+ reps left, so add 2.5 kg on the belt.',
    );
  });

  it('removes assistance early on an easy set, and adds sets once unassisted', () => {
    const easy = step(assisted, known(assisted, 30), '2026-09-01', 30, [8, 8, 8], 3);
    expect(easy.next.reasonCode).toBe('ASSIST_DOWN');
    expect(easy.next.weightKg).toBe(25);
    const zero = step(assisted, known(assisted, 0), '2026-09-01', 0, [10, 10, 10], 1);
    expect(zero.next.reasonCode).toBe('BW_ADD_SET');
    expect(zero.next.sets).toBe(4);
  });

  it('keeps adding reps on bodyweight work even when the set was easy', () => {
    const s = step(pushUp, known(pushUp, 0), '2026-09-01', 0, [15, 15, 15], 3);
    expect(s.next.reasonCode).toBe('ADD_REPS');
    expect(s.next.reps).toEqual([16, 16, 16]);
  });

  it('cannot reduce bodyweight load after two misses — keeps asking for the floor', () => {
    let s = step(pushUp, known(pushUp, 0), '2026-09-01', 0, [8, 6, 5]);
    expect(s.next.reasonCode).toBe('MISSED_ONCE');
    s = step(pushUp, s, '2026-09-04', 0, [8, 6, 5]);
    expect(s.next.reasonCode).toBe('MISSED_ONCE');
    expect(s.next.inputs['cannotReduce']).toBe(true);
    expect(s.missStreak).toBe(0);
  });
});

describe('timed exercises (+5 s per set, then load or sets)', () => {
  it('adds 5 s per set inside the range', () => {
    const s = step(plank, known(plank, 0), '2026-09-01', 0, [40, 35]);
    expect(s.next.reasonCode).toBe('ADD_REPS');
    expect(s.next.reps).toEqual([45, 40]);
    expect(explain(s.next, 'KG')).toBe('Same load. Hold each set 5 s longer.');
  });

  it('adds a set to a bodyweight hold at the top, and tolerates 5 s under after it', () => {
    const top = step(plank, known(plank, 0), '2026-09-01', 0, [60, 60], 3);
    expect(top.next.reasonCode).toBe('BW_ADD_SET');
    expect(top.next.reps).toEqual([60, 60, 60]);
    expect(explain(top.next, 'KG')).toBe('You held 60 s on every set, so add a 3rd set.');
    const settle = step(plank, top, '2026-09-04', 0, [60, 60, 26], null, { sets: 3 });
    expect(settle.next.reasonCode).toBe('NEW_WEIGHT_SETTLING');
  });

  it('adds load to a weighted hold at the top and restarts at the floor', () => {
    const s = step(carry, known(carry, 25), '2026-09-01', 25, [45, 45], 0);
    expect(s.next.reasonCode).toBe('TOP_OF_RANGE');
    expect(s.next.weightKg).toBe(27.5);
    expect(s.next.reps).toEqual([30, 30]);
    expect(explain(s.next, 'KG')).toBe(
      'You held 45 s on every set, so up to 27.5 kg. Aim for 30 s.',
    );
  });

  it('misses on holds use seconds', () => {
    const s = step(plank, known(plank, 0), '2026-09-01', 0, [30, 20]);
    expect(s.next.reasonCode).toBe('MISSED_ONCE');
    expect(explain(s.next, 'KG')).toBe('Tough day, so same again. Hold 30 s on every set.');
  });
});

describe('stalls (research §1.6)', () => {
  function stalled(resetDates: string[]): ProgressionState {
    const base = step(legPress, known(legPress, 140), '2026-08-28', 140, [12, 12, 12]);
    return { ...base, stallCount: 2, resetDates };
  }

  it('suggests a swap instead of a third reset within 10 weeks', () => {
    const s = step(
      legPress,
      stalled(['2026-07-01', '2026-08-01']),
      '2026-09-01',
      140,
      [12, 12, 12],
    );
    expect(s.next.reasonCode).toBe('STALL_SUGGEST_SWAP');
    expect(s.next.weightKg).toBe(140);
    expect(explain(s.next, 'KG')).toBe(
      'This lift has stalled twice lately. Try a variation or a different rep range.',
    );
  });

  it('forgets resets older than 10 weeks', () => {
    const s = step(
      legPress,
      stalled(['2026-05-01', '2026-08-01']),
      '2026-09-01',
      140,
      [12, 12, 12],
    );
    expect(s.next.reasonCode).toBe('STALL_RESET');
    expect(s.resetDates).toEqual(['2026-08-01', '2026-09-01']);
  });

  it('suggests a swap when the load cannot go lower', () => {
    let s = step(pushUp, known(pushUp, 0), '2026-09-01', 0, [10, 10, 10]);
    for (const d of ['2026-09-04', '2026-09-08', '2026-09-11']) {
      s = step(pushUp, s, d, 0, [10, 10, 10]);
    }
    expect(s.next.reasonCode).toBe('STALL_SUGGEST_SWAP');
  });
});

describe('calibration table (research §1.7)', () => {
  const benchCal = fresh(bench);

  it('3+ at the top of the range on an upper barbell lift: +20 %, at least +5 kg', () => {
    const s = step(bench, benchCal, '2026-09-01', 20, [12, 12, 12], 3, { experience: BEG });
    expect(s.next.weightKg).toBe(25);
    expect(s.next.reps).toEqual([8, 8, 8]);
    expect(s.calibrating).toBe(true);
    expect(s.calibrationExposures).toBe(1);
  });

  it('3+ at the top on a lower barbell lift: at least +10 kg', () => {
    const s = step(squat, fresh(squat), '2026-09-01', 20, [8, 8, 8], 3, { experience: BEG });
    expect(s.next.weightKg).toBe(30);
  });

  it('3+ inside the range: +10 %, at least one step', () => {
    const s = step(bench, benchCal, '2026-09-01', 20, [10, 10, 10], 3, { experience: BEG });
    expect(s.next.weightKg).toBe(22.5);
    expect(s.next.reasonCode).toBe('CALIBRATING_UP');
  });

  it('holds when nothing heavier exists', () => {
    const s = step(goblet, fresh(goblet), '2026-09-01', 50, [12, 12, 12], 3, { experience: BEG });
    expect(s.next.kind).toBe('hold');
    const two = step(goblet, fresh(goblet), '2026-09-01', 50, [12, 12, 12], 2, { experience: BEG });
    expect(two.next.kind).toBe('hold');
  });

  it('RIR 2 → one step and calibration exits', () => {
    const s = step(bench, benchCal, '2026-09-01', 20, [10, 10, 10], 2, { experience: BEG });
    expect(s.next.weightKg).toBe(22.5);
    expect(s.next.inputs['calibrationDone']).toBe(true);
    expect(s.calibrating).toBe(false);
    expect(explain(s.next, 'KG')).toBe(
      'Good read: 22.5 kg should be about right. Aim for 8+ reps.',
    );
  });

  it('RIR 1 and no RIR → normal rules and calibration exits', () => {
    const one = step(bench, benchCal, '2026-09-01', 20, [10, 10, 10], 1, { experience: BEG });
    expect(one.next.reasonCode).toBe('ADD_REPS');
    expect(one.calibrating).toBe(false);
    const none = step(bench, benchCal, '2026-09-01', 20, [12, 12, 12], null, { experience: BEG });
    expect(none.next.reasonCode).toBe('TOP_OF_RANGE');
    expect(none.calibrating).toBe(false);
  });

  it('RIR 0 → hold and calibration exits', () => {
    const s = step(bench, benchCal, '2026-09-01', 20, [10, 9, 12], 0, { experience: BEG });
    expect(s.next.reasonCode).toBe('ADD_REPS');
    expect(s.next.reps).toEqual([11, 10, 12]);
    expect(s.calibrating).toBe(false);
  });

  it('a set under the floor → 85 % and one more try (unless no RIR was given)', () => {
    const down = step(goblet, fresh(goblet), '2026-09-01', 12, [8, 7, 6], 1, { experience: BEG });
    expect(down.next.reasonCode).toBe('CALIBRATING_DOWN');
    expect(down.next.kind).toBe('decrease');
    expect(down.next.weightKg).toBe(10);
    expect(down.next.reps).toEqual([10, 10, 10]);
    expect(down.calibrating).toBe(true);
    expect(explain(down.next, 'KG')).toBe(
      'That was a bit heavy, so trying 10 kg to find your working weight.',
    );
    const bar = step(bench, benchCal, '2026-09-01', 20, [8, 7, 6], null, { experience: BEG });
    expect(bar.next.kind).toBe('hold');
    expect(bar.calibrating).toBe(false);
  });

  it('lasts at most 3 exposures', () => {
    let s = benchCal;
    for (const [d, kg] of [
      ['2026-09-01', 20],
      ['2026-09-04', 25],
    ] as const) {
      s = step(bench, s, d, kg, [12, 12, 12], 3, { experience: BEG });
      expect(s.calibrating).toBe(true);
    }
    s = step(bench, s, '2026-09-08', s.next.weightKg, [12, 12, 12], 3, { experience: BEG });
    expect(s.calibrating).toBe(false);
    expect(s.calibrationExposures).toBe(3);
  });
});

describe('breaks (research §1.8)', () => {
  const at80 = step(bench, known(bench, 80), '2026-01-01', 80, [10, 10, 9], 1);

  it('prescribes normally up to 14 days', () => {
    expect(rx(bench, at80, '2026-01-15').reasonCode).toBe('ADD_REPS');
  });

  it('holds for 15–28 days (under 65), cutting a pending increase back', () => {
    expect(rx(bench, at80, '2026-01-21')).toMatchObject({ reasonCode: 'BREAK_HOLD', weightKg: 80 });
    const up = step(bench, known(bench, 60), '2026-01-01', 60, [12, 12, 12], 2);
    const hold = rx(bench, up, '2026-01-21');
    expect(hold).toMatchObject({ reasonCode: 'BREAK_HOLD', weightKg: 60, deltaKg: 0 });
    expect(explain(hold, 'KG')).toBe('Welcome back. Same as last time, no increase today.');
  });

  it('uses the age ≥ 65 column when the age is known', () => {
    expect(rx(bench, at80, '2026-01-21', { ageYears: 70 })).toMatchObject({
      reasonCode: 'BREAK_REENTRY',
      weightKg: 70,
    });
    expect(rx(bench, at80, '2026-02-10', { ageYears: 70 }).weightKg).toBe(62.5);
    expect(rx(bench, at80, '2026-03-22', { ageYears: 70 }).weightKg).toBe(55);
  });

  it('cuts to 80 % after 57–112 days and 70 % + recalibration beyond', () => {
    expect(rx(bench, at80, '2026-03-22').weightKg).toBe(62.5);
    const long = rx(bench, at80, '2026-05-01');
    expect(long.weightKg).toBe(55);
    expect(long.inputs['recalibrate']).toBe(true);
  });

  it('holds bodyweight work (nothing to cut)', () => {
    const s = step(pullUp, known(pullUp, 0), '2026-01-01', 0, [8, 8, 8], 1);
    expect(rx(pullUp, s, '2026-02-10').reasonCode).toBe('BREAK_HOLD');
  });

  it('fast-tracks back two steps per good session, capped at the pre-break weight', () => {
    const back = step(bench, at80, '2026-02-05', 70, [11, 11, 10], 2);
    expect(back.preBreakWeightKg).toBe(80);
    expect(back.next).toMatchObject({ reasonCode: 'BREAK_FAST_TRACK', weightKg: 75 });
    expect(back.next.reps).toEqual([11, 11, 10]);
    expect(explain(back.next, 'KG')).toBe(
      'Strong session, so jumping to 75 kg. Closing in on your old 80 kg.',
    );
    const there = step(bench, back, '2026-02-08', 75, [11, 11, 10], null, {});
    expect(there.next.reasonCode).not.toBe('BREAK_FAST_TRACK'); // no chip and not all-top
    const top = step(bench, back, '2026-02-08', 75, [12, 12, 12], null);
    expect(top.next).toMatchObject({ reasonCode: 'BREAK_FAST_TRACK', weightKg: 80 });
    expect(top.preBreakWeightKg).toBeNull();
    expect(explain(top.next, 'KG')).toBe(
      'Strong session, so back up to 80 kg, where you were before the break.',
    );
  });

  it('falls back to normal rules on a so-so comeback session', () => {
    const s = step(bench, at80, '2026-02-05', 70, [11, 11, 10], 1);
    expect(s.next.reasonCode).toBe('ADD_REPS');
    expect(s.preBreakWeightKg).toBe(80);
    expect(s.stallCount).toBe(0);
  });

  it('keeps the reduced weight and the pre-break marker on an incomplete comeback', () => {
    const s = step(bench, at80, '2026-02-05', 70, [11, 11]);
    expect(s.next).toMatchObject({ reasonCode: 'INCOMPLETE', weightKg: 70 });
    expect(s.preBreakWeightKg).toBe(80);
    const again = step(bench, s, '2026-02-25', 65, [11, 11, 10], 1);
    expect(again.preBreakWeightKg).toBe(80);
  });

  it('does not mark a break when the old weight was lifted anyway', () => {
    const s = step(bench, at80, '2026-02-05', 80, [10, 10, 10], 1);
    expect(s.preBreakWeightKg).toBeNull();
  });

  it('recalibrates after more than 112 days', () => {
    const s = step(bench, at80, '2026-05-01', 55, [10, 10, 10], 3);
    expect(s.next.reasonCode).toBe('CALIBRATING_UP');
    expect(s.calibrating).toBe(true);
    expect(s.preBreakWeightKg).toBeNull();
  });
});

describe('prescribe — overrides and deloads', () => {
  const s = step(bench, known(bench, 60), '2026-09-10', 60, [10, 10, 10], 1);

  it('returns the start suggestion for a fresh state', () => {
    expect(rx(bench, known(bench, 60), '2026-09-10').reasonCode).toBe('START');
  });

  it('applies a user override set after the last exposure (same day counts)', () => {
    const base = {
      slot: bench,
      profile: P,
      facts: { experience: INT, ageYears: null },
      deload: false,
    };
    const up = prescribe({
      ...base,
      state: s,
      today: '2026-09-12',
      override: { weightKg: 65, reps: [8, 8, 8, 8], at: '2026-09-10T20:00:00.000Z' },
    });
    expect(up).toMatchObject({
      reasonCode: 'USER_OVERRIDE',
      kind: 'increase',
      weightKg: 65,
      sets: 4,
    });
    expect(up.deltaKg).toBe(5);
    expect(explain(up, 'KG')).toBe('Your own target: 65 kg, 8+ reps.');
    const down = prescribe({
      ...base,
      state: s,
      today: '2026-09-12',
      override: { weightKg: 55, reps: [10], at: '2026-09-11T08:00:00.000Z' },
    });
    expect(down.kind).toBe('decrease');
    const same = prescribe({
      ...base,
      state: known(bench, 60),
      today: '2026-09-12',
      override: { weightKg: 60, reps: [12, 12, 12], at: '2026-09-01T08:00:00.000Z' },
    });
    expect(same.kind).toBe('hold');
    const stale = prescribe({
      ...base,
      state: s,
      today: '2026-09-12',
      override: { weightKg: 65, reps: [8], at: '2026-09-09T20:00:00.000Z' },
    });
    expect(stale.reasonCode).toBe('ADD_REPS');
  });

  it('deloads bodyweight and assisted work sensibly', () => {
    const bw = deloadPrescription({ slot: pullUp, state: known(pullUp, 0), profile: P });
    expect(bw).toMatchObject({ weightKg: 0, sets: 2, reps: [5, 5], reasonCode: 'DELOAD' });
    const as = deloadPrescription({ slot: assisted, state: known(assisted, 30), profile: P });
    expect(as.weightKg).toBe(35);
    expect(explain(as, 'KG')).toBe(
      'Deload week: 35 kg assist for 2 sets. Leave 3–4 reps in the tank.',
    );
  });
});

describe('foldHistory', () => {
  it('orders exposures by performedAt, then sessionId', () => {
    const a = exposureOf(bench, '2026-09-01', 60, [10, 10, 10], 1, {
      sessionId: 'b',
      performedAt: '2026-09-01T10:00:00.000Z',
    });
    const b = { ...a, sessionId: 'a' };
    expect(sortExposures([a, b]).map((e) => e.sessionId)).toEqual(['a', 'b']);
  });

  it('replays history from a known weight', () => {
    const exposures = [
      exposureOf(bench, '2026-09-04', 60, [11, 10, 10], 1),
      exposureOf(bench, '2026-09-01', 60, [10, 10, 9], 1),
    ];
    const s = foldHistory({
      slot: bench,
      exposures,
      profile: P,
      experience: INT,
      knownWeightKg: 60,
    });
    expect(s.lastExposureDate).toBe('2026-09-04');
    expect(s.next.reps).toEqual([12, 11, 11]);
    const none = foldHistory({ slot: bench, exposures: [], profile: P, experience: BEG });
    expect(none.calibrating).toBe(true);
  });
});
