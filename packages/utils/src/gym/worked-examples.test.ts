// Research §1.11 — the 17 worked examples, one named test each.
// Defaults: barbell step 2.5 kg, DB list …8, 10, 12, 14, 16…, machine step 5 kg,
// targetRir 2 (compound) / 1 (isolation).
import { describe, expect, it } from 'vitest';
import type { ExerciseSlot, ProgressionState, TrainingExperience } from '@chefer/types';
import { applyExposure, explain, initialState, prescribe } from './progression';
import { exposureOf, KG_PROFILE, slotFor } from './test-fixtures';

const profile = KG_PROFILE;
const facts = { experience: 'INTERMEDIATE' as const, ageYears: null };

function known(slot: ExerciseSlot, kg: number, experience: TrainingExperience = 'INTERMEDIATE') {
  return initialState({ slot, profile, experience, knownWeightKg: kg });
}

function apply(
  slot: ExerciseSlot,
  state: ProgressionState,
  date: string,
  kg: number,
  reps: number[],
  rir: 0 | 1 | 2 | 3 | null = null,
  experience: TrainingExperience = 'INTERMEDIATE',
) {
  return applyExposure({
    slot,
    state,
    exposure: exposureOf(slot, date, kg, reps, rir),
    profile,
    experience,
  });
}

const bench = slotFor('barbell-bench-press', 3, 8, 12);

describe('research §1.11 worked examples', () => {
  it('WE-01 bench top of range with RIR 2 → +2.5 kg, aim 10', () => {
    const s = apply(bench, known(bench, 60), '2026-09-01', 60, [12, 12, 12], 2);
    expect(s.next.weightKg).toBe(62.5);
    expect(s.next.reps).toEqual([10, 10, 10]);
    expect(s.next.reasonCode).toBe('TOP_OF_RANGE');
    expect(explain(s.next, 'KG')).toBe(
      'You hit 12 on every set, so +2.5 kg today. Aim for 10 reps.',
    );
  });

  it('WE-02 bench top of range without RIR → +2.5 kg, aim 8+', () => {
    const s = apply(bench, known(bench, 60), '2026-09-01', 60, [12, 12, 12], null);
    expect(s.next.weightKg).toBe(62.5);
    expect(s.next.reps).toEqual([8, 8, 8]);
    expect(s.next.reasonCode).toBe('TOP_OF_RANGE');
    expect(explain(s.next, 'KG')).toBe(
      'You hit 12 on every set, so +2.5 kg today. Aim for 8+ reps.',
    );
  });

  it('WE-03 bench inside the range → same weight, one more rep per set', () => {
    const s = apply(bench, known(bench, 60), '2026-09-01', 60, [10, 9, 8], 1);
    expect(s.next.weightKg).toBe(60);
    expect(s.next.reps).toEqual([11, 10, 9]);
    expect(s.next.reasonCode).toBe('ADD_REPS');
    expect(explain(s.next, 'KG')).toBe('Same weight. Beat last time by one rep per set.');
  });

  it('WE-04 back squat 8s with 3+ in the tank → two steps (85 kg), aim 6', () => {
    const squat = slotFor('back-squat', 3, 6, 8);
    const s = apply(squat, known(squat, 80), '2026-09-01', 80, [8, 8, 8], 3);
    expect(s.next.weightKg).toBe(85);
    expect(s.next.reps).toEqual([6, 6, 6]);
    expect(s.next.reasonCode).toBe('TOP_EASY_DOUBLE_JUMP');
    expect(explain(s.next, 'KG')).toBe(
      "8 reps on every set with 3+ left in the tank, so we're jumping 5 kg.",
    );
  });

  it('WE-05 lateral raise top of range → next DB pair, aim 12 (10+ accepted)', () => {
    const lat = slotFor('dumbbell-lateral-raise', 3, 12, 20);
    const s = apply(lat, known(lat, 8), '2026-09-01', 8, [20, 20, 20], 1);
    expect(s.next.weightKg).toBe(10);
    expect(s.next.reps).toEqual([12, 12, 12]);
    expect(s.next.reasonCode).toBe('TOP_OF_RANGE');
    expect(explain(s.next, 'KG')).toBe(
      "Top of the range, so up to the 10 kg pair. It's a big jump, so 10+ reps is a win.",
    );
    // …and 10+ really is accepted next time (NEW_WEIGHT_SETTLING, not a miss).
    const after = apply(lat, s, '2026-09-04', 10, [11, 10, 10], 1);
    expect(after.next.reasonCode).toBe('NEW_WEIGHT_SETTLING');
    expect(after.next.weightKg).toBe(10);
  });

  it('WE-06 lateral raise top of range at failure → consolidate 20s at 8 kg', () => {
    const lat = slotFor('dumbbell-lateral-raise', 3, 12, 20);
    const s = apply(lat, known(lat, 8), '2026-09-01', 8, [20, 20, 20], 0);
    expect(s.next.weightKg).toBe(8);
    expect(s.next.reps).toEqual([20, 20, 20]);
    expect(s.next.reasonCode).toBe('CONSOLIDATE');
    expect(explain(s.next, 'KG')).toBe(
      'You maxed out at failure, so lock in 20s once more before the 10 kg jump.',
    );
    // "once more": a second consolidated session jumps even at RIR 0.
    const again = apply(lat, s, '2026-09-04', 8, [20, 20, 20], 0);
    expect(again.next.reasonCode).toBe('TOP_OF_RANGE');
    expect(again.next.weightKg).toBe(10);
  });

  it('WE-07 seated leg curl with 3+ left → one plate (45 kg), aim 10', () => {
    const curl = slotFor('seated-leg-curl', 3, 10, 15);
    const s = apply(curl, known(curl, 40), '2026-09-01', 40, [14, 13, 13], 3);
    expect(s.next.weightKg).toBe(45);
    expect(s.next.reps).toEqual([10, 10, 10]);
    expect(s.next.reasonCode).toBe('EASY_ADD_LOAD');
    expect(explain(s.next, 'KG')).toBe(
      "Your last set had 3+ reps left, so we're adding one plate.",
    );
  });

  const row = slotFor('barbell-row', 3, 8, 12);
  const rowMissedOnce = apply(row, known(row, 70), '2026-09-01', 70, [8, 7, 6]);

  it('WE-08 row with a set under the floor (missStreak 0) → hold, aim 8s', () => {
    expect(rowMissedOnce.next.weightKg).toBe(70);
    expect(rowMissedOnce.next.reps).toEqual([8, 8, 8]);
    expect(rowMissedOnce.next.reasonCode).toBe('MISSED_ONCE');
    expect(rowMissedOnce.missStreak).toBe(1);
    expect(explain(rowMissedOnce.next, 'KG')).toBe(
      'Tough day, so same weight. Get 8 on every set.',
    );
  });

  it('WE-09 row under the floor again (missStreak 1) → drop to 62.5 kg, aim 10', () => {
    const s = apply(row, rowMissedOnce, '2026-09-04', 70, [8, 7, 7]);
    expect(s.next.weightKg).toBe(62.5);
    expect(s.next.reps).toEqual([10, 10, 10]);
    expect(s.next.reasonCode).toBe('MISSED_TWICE');
    expect(s.missStreak).toBe(0);
    expect(explain(s.next, 'KG')).toBe(
      'Two sessions under 8 reps, so dropping to 62.5 kg to build back up.',
    );
  });

  it('WE-10 bench first session after an increase, 8/7/6 → settle at 62.5 kg, aim 8', () => {
    const increased = apply(bench, known(bench, 60), '2026-09-01', 60, [12, 12, 12], 2);
    expect(increased.justIncreased).toBe(true);
    const s = apply(bench, increased, '2026-09-04', 62.5, [8, 7, 6]);
    expect(s.next.weightKg).toBe(62.5);
    expect(s.next.reps).toEqual([8, 8, 8]);
    expect(s.next.reasonCode).toBe('NEW_WEIGHT_SETTLING');
    expect(s.missStreak).toBe(0);
    expect(explain(s.next, 'KG')).toBe(
      'New weight takes a session to settle. Same again, aim for 8s.',
    );
  });

  it('WE-11 leg press: no progress in 3 sessions → reset to 125 kg, aim 13', () => {
    // Interpretation: "36 → 36 → 35 over 3 exposures" are three exposures without
    // progress, so a prior 36-rep baseline at 140 kg is needed first.
    const press = slotFor('leg-press', 3, 10, 15);
    let s = apply(press, known(press, 140), '2026-08-28', 140, [12, 12, 12]);
    s = apply(press, s, '2026-09-01', 140, [12, 12, 12]);
    expect(s.stallCount).toBe(1);
    s = apply(press, s, '2026-09-04', 140, [12, 12, 12]);
    expect(s.stallCount).toBe(2);
    s = apply(press, s, '2026-09-08', 140, [12, 12, 11]);
    expect(s.next.weightKg).toBe(125);
    expect(s.next.reps).toEqual([13, 13, 13]);
    expect(s.next.reasonCode).toBe('STALL_RESET');
    expect(s.stallCount).toBe(0);
    expect(s.resetDates).toEqual(['2026-09-08']);
    expect(explain(s.next, 'KG')).toBe(
      'No progress in 3 sessions, so resetting to 125 kg to build momentum.',
    );
  });

  it('WE-12 bench 5 weeks after the last session at 80 kg → 70 kg re-entry', () => {
    const s = apply(bench, known(bench, 80), '2026-08-01', 80, [10, 10, 9], 1);
    const p = prescribe({
      slot: bench,
      state: s,
      override: null,
      profile,
      facts,
      today: '2026-09-05', // 35 days later
      deload: false,
    });
    expect(p.weightKg).toBe(70);
    expect(p.reasonCode).toBe('BREAK_REENTRY');
    expect(p.reps).toEqual(s.next.reps);
    expect(explain(p, 'KG')).toBe(
      "Welcome back, 70 kg today (about 90% of your last 80). You'll be back up in a few sessions.",
    );
  });

  it('WE-13 goblet squat calibrating (beginner), 12s with 3+ left → 14 kg, aim 8, still calibrating', () => {
    const goblet = slotFor('goblet-squat', 3, 8, 12);
    const start = initialState({ slot: goblet, profile, experience: 'BEGINNER' });
    expect(start.calibrating).toBe(true);
    expect(start.next.weightKg).toBe(12);
    const s = apply(goblet, start, '2026-09-01', 12, [12, 12, 12], 3, 'BEGINNER');
    expect(s.next.weightKg).toBe(14);
    expect(s.next.reps).toEqual([8, 8, 8]);
    expect(s.next.reasonCode).toBe('CALIBRATING_UP');
    expect(s.calibrating).toBe(true);
    expect(explain(s.next, 'KG')).toBe(
      'That looked easy, so trying 14 kg to find your working weight.',
    );
  });

  it('WE-14 pull-up at the top of the range with no dip belt → add a 4th set (4 × 10)', () => {
    const pull = slotFor('pull-up', 3, 5, 10);
    const s = apply(pull, known(pull, 0), '2026-09-01', 0, [10, 10, 10], 1);
    expect(s.next.weightKg).toBe(0);
    expect(s.next.sets).toBe(4);
    expect(s.next.reps).toEqual([10, 10, 10, 10]);
    expect(s.next.reasonCode).toBe('BW_ADD_SET');
    expect(explain(s.next, 'KG')).toBe(
      'Top of the range, so add a 4th set. A dip belt would let you add weight instead.',
    );
    // prescribe keeps the earned set even though the routine slot says 3.
    const p = prescribe({
      slot: pull,
      state: s,
      override: null,
      profile,
      facts,
      today: '2026-09-04',
      deload: false,
    });
    expect(p.sets).toBe(4);
  });

  it('WE-15 assisted pull-up at the top → 25 kg assistance, aim 7', () => {
    const assisted = slotFor('assisted-pull-up', 3, 6, 10);
    const s = apply(assisted, known(assisted, 30), '2026-09-01', 30, [10, 10, 10]);
    expect(s.next.weightKg).toBe(25);
    expect(s.next.reps).toEqual([7, 7, 7]);
    expect(s.next.reasonCode).toBe('ASSIST_DOWN');
    expect(explain(s.next, 'KG')).toBe(
      'Top of the range, so less help today: 25 kg of assistance.',
    );
  });

  it('WE-16 only 2 of 3 working sets logged → unchanged targets', () => {
    const before = apply(bench, known(bench, 60), '2026-09-01', 60, [10, 9, 8], 1);
    const s = apply(bench, before, '2026-09-04', 60, [12, 12]);
    expect(s.next.weightKg).toBe(before.next.weightKg);
    expect(s.next.reps).toEqual(before.next.reps);
    expect(s.next.reasonCode).toBe('INCOMPLETE');
    expect(s.missStreak).toBe(before.missStreak);
    expect(s.stallCount).toBe(before.stallCount);
    expect(explain(s.next, 'KG')).toBe('You skipped a set, so same targets next time.');
  });

  it('WE-17 deload week at 55 kg × 2 sets × 8, then back to 62.5 kg with previous targets', () => {
    const s = apply(bench, known(bench, 60), '2026-09-01', 60, [12, 12, 12], 2);
    const deload = prescribe({
      slot: bench,
      state: s,
      override: null,
      profile,
      facts,
      today: '2026-09-04',
      deload: true,
    });
    expect(deload.weightKg).toBe(55);
    expect(deload.sets).toBe(2);
    expect(deload.reps).toEqual([8, 8]);
    expect(deload.reasonCode).toBe('DELOAD');
    const after = applyExposure({
      slot: bench,
      state: s,
      exposure: exposureOf(bench, '2026-09-04', 55, [8, 8], null, { wasDeload: true, sets: 2 }),
      profile,
      experience: 'INTERMEDIATE',
    });
    expect(after.next.weightKg).toBe(62.5);
    expect(after.next.reps).toEqual([10, 10, 10]);
    expect(after.next.reasonCode).toBe('DELOAD_DONE');
    expect(after.workingWeightKg).toBe(s.workingWeightKg);
    expect(explain(after.next, 'KG')).toBe('Deload done, so back to 62.5 kg where you left off.');
  });
});
