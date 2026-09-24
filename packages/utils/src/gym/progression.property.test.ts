// Research appendix A property tests (fast-check).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUMBBELLS_LB,
  DEFAULT_PLATE_PAIRS_LB,
  type EquipmentProfile,
  type ExerciseSlot,
  type Exposure,
  type ProgressionState,
  type Rir,
} from '@chefer/types';
import {
  achievableLoads,
  difficulty,
  incrementLoad,
  isAchievable,
  KG_EPS,
  unitToKg,
} from './loads';
import { applyExposure, foldHistory, initialState, prescribe } from './progression';
import { KG_PROFILE, slotFor } from './test-fixtures';
import { addDaysLocal } from './weeks';

const SLOTS: ExerciseSlot[] = [
  slotFor('barbell-bench-press', 3, 8, 12),
  slotFor('back-squat', 3, 6, 8),
  slotFor('hip-thrust', 3, 8, 12),
  slotFor('dumbbell-lateral-raise', 3, 12, 20),
  slotFor('goblet-squat', 3, 8, 12),
  slotFor('seated-leg-curl', 3, 10, 15),
  slotFor('lat-pulldown', 3, 8, 12),
  slotFor('preacher-curl', 2, 10, 15),
  slotFor('pull-up', 3, 5, 10),
  slotFor('assisted-pull-up', 3, 6, 10),
  slotFor('push-up', 3, 8, 20),
  slotFor('plank', 2, 30, 60),
  slotFor('farmers-carry', 2, 30, 45),
];

const LB_PROFILE: EquipmentProfile = {
  unit: 'LB',
  barWeightKg: unitToKg(45, 'LB'),
  platePairsKg: DEFAULT_PLATE_PAIRS_LB.map((p) => unitToKg(p, 'LB')),
  dumbbellsKg: DEFAULT_DUMBBELLS_LB.map((d) => unitToKg(d, 'LB')),
  machineStepKg: unitToKg(10, 'LB'),
  cableStepKg: unitToKg(5, 'LB'),
  hasDipBelt: false,
  microPlates: false,
};

const profileArb = fc.record({ lb: fc.boolean(), belt: fc.boolean(), micro: fc.boolean() }).map(
  ({ lb, belt, micro }): EquipmentProfile => ({
    ...(lb ? LB_PROFILE : KG_PROFILE),
    hasDipBelt: belt,
    microPlates: micro,
  }),
);

const rirArb = fc.constantFrom<Rir | null>(null, 0, 1, 2, 3);

/** One exposure "plan"; the weight is resolved against the running state. */
const stepArb = fc.record({
  follow: fc.nat(9).map((n) => n < 7),
  loadIdx: fc.nat(40),
  gap: fc.oneof(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 11, max: 130 })),
  repsDelta: fc.array(fc.integer({ min: -4, max: 3 }), { minLength: 1, maxLength: 5 }),
  dropSet: fc.nat(9).map((n) => n === 0),
  rir: rirArb,
  deload: fc.nat(14).map((n) => n === 0),
});

type Step = typeof stepArb extends fc.Arbitrary<infer T> ? T : never;

const caseArb = fc.record({
  slotIdx: fc.nat(SLOTS.length - 1),
  profile: profileArb,
  experience: fc.constantFrom('BEGINNER' as const, 'INTERMEDIATE' as const),
  known: fc.boolean(),
  steps: fc.array(stepArb, { minLength: 1, maxLength: 8 }),
});

type Case = typeof caseArb extends fc.Arbitrary<infer T> ? T : never;

function slotOf(idx: number): ExerciseSlot {
  const slot = SLOTS[idx];
  if (!slot) {
    throw new Error('slot index out of range');
  }
  return slot;
}

function toExposure(
  slot: ExerciseSlot,
  profile: EquipmentProfile,
  state: ProgressionState,
  step: Step,
  date: string,
  n: number,
): Exposure {
  const loads = achievableLoads(slot, profile);
  const weightKg = step.follow
    ? state.next.weightKg
    : (loads[step.loadIdx % Math.min(loads.length, 40)] ?? 0);
  const sets = step.deload ? Math.ceil(state.next.sets / 2) : state.next.sets;
  const reps = Array.from({ length: sets }, (_, i) =>
    Math.max(
      0,
      (state.next.reps[i] ?? slot.repMin) + (step.repsDelta[i % step.repsDelta.length] ?? 0),
    ),
  );
  const logged = step.dropSet ? reps.slice(0, -1) : reps;
  return {
    sessionId: `s${String(n).padStart(3, '0')}`,
    localDate: date,
    performedAt: `${date}T17:00:00.000Z`,
    sets,
    repMin: slot.repMin,
    repMax: slot.repMax,
    targetRir: slot.targetRir,
    loggedSets: logged.map((r) => ({ weightKg, reps: r, isWarmup: false, completed: true })),
    lastSetRir: step.rir,
    wasDeload: step.deload,
    skipped: false,
  };
}

/** Run a case step by step, calling `check(before, exposure, after)` on every step. */
function run(
  c: Case,
  check?: (before: ProgressionState, exposure: Exposure, after: ProgressionState) => void,
): { states: ProgressionState[]; exposures: Exposure[]; slot: ExerciseSlot } {
  const slot = slotOf(c.slotIdx);
  let state = initialState({
    slot,
    profile: c.profile,
    experience: c.experience,
    knownWeightKg: c.known ? (achievableLoads(slot, c.profile)[3] ?? null) : null,
  });
  let date = '2026-01-05';
  const states = [state];
  const exposures: Exposure[] = [];
  c.steps.forEach((step, n) => {
    date = addDaysLocal(date, step.gap);
    const exposure = toExposure(slot, c.profile, state, step, date, n);
    const after = applyExposure({
      slot,
      state,
      exposure,
      profile: c.profile,
      experience: c.experience,
    });
    check?.(state, exposure, after);
    exposures.push(exposure);
    states.push(after);
    state = after;
  });
  return { states, exposures, slot };
}

describe('progression properties (research appendix A)', () => {
  it('suggested weights are always achievable with the user equipment', () => {
    fc.assert(
      fc.property(caseArb, fc.integer({ min: 0, max: 150 }), fc.boolean(), (c, gap, deload) => {
        const { states, slot } = run(c);
        for (const s of states) {
          expect(isAchievable(s.next.weightKg, slot, c.profile)).toBe(true);
        }
        const last = states[states.length - 1];
        if (!last) {
          return;
        }
        const p = prescribe({
          slot,
          state: last,
          override: null,
          profile: c.profile,
          facts: { experience: c.experience, ageYears: gap % 2 === 0 ? 70 : null },
          today: addDaysLocal(last.lastExposureDate ?? '2026-01-05', gap),
          deload,
        });
        expect(isAchievable(p.weightKg, slot, c.profile)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('a normal increase is never more than max(one step, 10 %)', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        run(c, (_before, _exposure, after) => {
          const next = after.next;
          if (next.reasonCode === 'CALIBRATING_UP' || next.kind !== 'increase') {
            return; // calibration jumps are the documented exception
          }
          const from = next.inputs['lastWeightKg'];
          if (typeof from !== 'number') {
            return;
          }
          const slot = slotOf(c.slotIdx);
          const oneStep = incrementLoad(from, slot, c.profile, { bigLowerStep: true });
          const allowed = Math.max(
            difficulty(oneStep, slot) - difficulty(from, slot),
            Math.abs(from) * 0.1,
          );
          const actual = difficulty(next.weightKg, slot) - difficulty(from, slot);
          expect(actual).toBeLessThanOrEqual(allowed + KG_EPS);
        });
      }),
      { numRuns: 300 },
    );
  });

  it('deload prescriptions never mutate state (and never go heavier)', () => {
    fc.assert(
      fc.property(caseArb, fc.integer({ min: 0, max: 150 }), (c, gap) => {
        const { states, slot } = run(c);
        const last = states[states.length - 1];
        if (!last) {
          return;
        }
        const snapshot = structuredClone(last);
        const frozen = Object.freeze(structuredClone(last));
        const p = prescribe({
          slot,
          state: frozen,
          override: null,
          profile: c.profile,
          facts: { experience: c.experience, ageYears: null },
          today: addDaysLocal(last.lastExposureDate ?? '2026-01-05', gap),
          deload: true,
        });
        expect(last).toEqual(snapshot);
        expect(frozen).toEqual(snapshot);
        expect(p.kind).toBe('deload');
        expect(p.sets).toBeGreaterThanOrEqual(1);
        expect(p.sets).toBeLessThanOrEqual(Math.ceil(Math.max(slot.sets, last.sets) / 2));
        expect(difficulty(p.weightKg, slot)).toBeLessThanOrEqual(
          difficulty(last.next.weightKg, slot) + KG_EPS,
        );
      }),
      { numRuns: 200 },
    );
  });

  // Scope: RIR 1/2/3 outside break re-entry. RIR 0 is deliberately MORE
  // conservative than a missing chip (CONSOLIDATE §1.5, calibration hold §1.7),
  // and §1.8 fast-tracks a chip-less all-top session but not an RIR-1 one.
  it('a missing RIR chip never yields a heavier weight than an RIR 1/2/3 answer', () => {
    fc.assert(
      fc.property(caseArb, fc.constantFrom<Rir>(1, 2, 3), (c, rir) => {
        const { states, exposures, slot } = run(c);
        const before = states[states.length - 2];
        const exposure = exposures[exposures.length - 1];
        if (!before || !exposure || before.preBreakWeightKg !== null) {
          return;
        }
        const common = { slot, state: before, profile: c.profile, experience: c.experience };
        const withNull = applyExposure({ ...common, exposure: { ...exposure, lastSetRir: null } });
        if (withNull.preBreakWeightKg !== null) {
          return;
        }
        const withRir = applyExposure({ ...common, exposure: { ...exposure, lastSetRir: rir } });
        expect(difficulty(withNull.next.weightKg, slot)).toBeLessThanOrEqual(
          difficulty(withRir.next.weightKg, slot) + KG_EPS,
        );
      }),
      { numRuns: 400 },
    );
  });

  it('foldHistory does not depend on the order exposures are passed in', () => {
    fc.assert(
      fc.property(caseArb, fc.array(fc.nat(), { minLength: 8, maxLength: 8 }), (c, keys) => {
        const { exposures, slot } = run(c);
        const shuffled = exposures
          .map((e, i) => ({ e, k: keys[i % keys.length] ?? 0 }))
          .sort((a, b) => a.k - b.k)
          .map(({ e }) => e);
        const args = { slot, profile: c.profile, experience: c.experience };
        expect(foldHistory({ ...args, exposures: shuffled })).toEqual(
          foldHistory({ ...args, exposures: [...exposures].reverse() }),
        );
        expect(foldHistory({ ...args, exposures })).toEqual(
          foldHistory({ ...args, exposures: shuffled }),
        );
      }),
      { numRuns: 200 },
    );
  });
});
