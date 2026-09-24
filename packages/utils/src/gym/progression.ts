// Progression engine — research §1 (double progression, RIR adjustments,
// calibration, stall/deload, break re-entry). Pure and deterministic: the API
// folds it over history (source of truth) and the phone runs the same fold
// optimistically offline, so outputs MUST NOT depend on anything but inputs.
import type {
  EquipmentProfile,
  ExerciseSlot,
  Exposure,
  ProgressionOverride,
  ProgressionState,
  ReasonCode,
  Suggestion,
  SuggestionKind,
  TrainingExperience,
  TrainingProfileFacts,
} from '@chefer/types';
import {
  canGoHarder,
  capIncrease,
  easierOf,
  harderOf,
  incrementLoad,
  isAssisted,
  isHarder,
  loadModel,
  round2,
  roundNearestUp,
  roundToAchievable,
  sameKg,
  scaleEasier,
  stepDown,
  stepUp,
  unitToKg,
} from './loads';
import { daysBetweenLocal } from './weeks';

export { explain, explainInputs } from './reasons';

/** Bump whenever any output changes (stored with every suggestion). */
export const ENGINE_VERSION = 1;

/** Most working sets BW_ADD_SET will grow an exercise to (research §1.3). */
export const MAX_BODYWEIGHT_SETS = 5;
/** Window for the "2 resets in 10 weeks → suggest a swap" rule (research §1.6). */
const RESET_WINDOW_DAYS = 70;
const STALL_LIMIT = 3;
const CALIBRATION_MAX_EXPOSURES = 3;
/** DB-sized jump: at failure with a jump above this, consolidate first (research §1.5). */
const BIG_JUMP_PCT = 0.075;
/** Timed exercises add this many seconds per set on ADD_REPS. */
const TIMED_STEP_SEC = 5;

type Inputs = Suggestion['inputs'];

/** Rep-range bucket key (research §1.2): shared state across slots with the same range. */
export function repBucket(repMin: number, repMax: number): string {
  return `${repMin}-${repMax}`;
}

export function progressionKey(exerciseId: string, bucket: string): string {
  return `${exerciseId}|${bucket}`;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function all(n: number, value: number): number[] {
  return Array.from({ length: Math.max(0, n) }, () => value);
}

/** Resize a target list to `n` sets, padding with the last target (or `fill`). */
export function fitTargets(reps: number[], n: number, fill: number): number[] {
  if (reps.length >= n) {
    return reps.slice(0, n);
  }
  const pad = reps[reps.length - 1] ?? fill;
  return [...reps, ...all(n - reps.length, pad)];
}

function mid(repMin: number, repMax: number): number {
  return Math.ceil((repMin + repMax) / 2);
}

function numberInput(inputs: Inputs, key: string): number | null {
  const v = inputs[key];
  return typeof v === 'number' ? v : null;
}

/** Weight of the most recent counted exposure (the "your last 80 kg" of §1.8). */
export function lastPerformedKg(state: ProgressionState): number | null {
  return numberInput(state.next.inputs, 'lastWeightKg');
}

/** Progress baseline: the weight `state.lastTotalReps` was achieved at. */
function baselineKg(state: ProgressionState): number | null {
  return numberInput(state.next.inputs, 'baselineKg');
}

function slotInputs(slot: ExerciseSlot): Inputs {
  const { exercise } = slot;
  return {
    exerciseId: exercise.id,
    equipment: exercise.equipment,
    loadType: exercise.loadType,
    perHand: exercise.perHand,
    isTimed: exercise.isTimed,
    repMin: slot.repMin,
    repMax: slot.repMax,
  };
}

function canCalibrate(slot: ExerciseSlot): boolean {
  return slot.exercise.loadType === 'WEIGHTED' && !slot.exercise.isTimed && !isAssisted(slot);
}

/** Can more working sets replace load progression (bodyweight / assistance exhausted)? */
function growsBySets(kg: number, slot: ExerciseSlot, profile: EquipmentProfile): boolean {
  const model = loadModel(slot);
  return (
    (model === 'NONE' || model === 'BELT' || model === 'ASSISTED') &&
    !canGoHarder(kg, slot, profile)
  );
}

function baseSets(
  slot: ExerciseSlot,
  state: ProgressionState,
  kg: number,
  profile: EquipmentProfile,
): number {
  return growsBySets(kg, slot, profile) ? Math.max(slot.sets, state.sets) : slot.sets;
}

// ─── Initial state (research §1.7) ───────────────────────────────────────────

/** Research §1.7 starting-guess table, in kg (before rounding onto the user's equipment). */
export function startingGuessKg(
  slot: ExerciseSlot,
  profile: EquipmentProfile,
  experience: TrainingExperience,
): number {
  const ex = slot.exercise;
  const beginner = experience === 'BEGINNER';
  const model = loadModel(slot);
  if (model === 'NONE' || model === 'BELT') {
    return 0;
  }
  if (model === 'ASSISTED') {
    return beginner ? 40 : 20;
  }
  if (model === 'PLATES') {
    if (beginner) {
      return profile.barWeightKg;
    }
    return profile.barWeightKg + (ex.isLowerBody && ex.category === 'COMPOUND' ? 20 : 10);
  }
  if (model === 'LIST') {
    if (ex.movementPattern === 'carry') {
      return beginner ? 16 : 24;
    }
    if (ex.category === 'ISOLATION') {
      const small = ex.movementPattern === 'lateral-raise' || ex.movementPattern === 'rear-delt';
      return small ? (beginner ? 4 : 8) : beginner ? 6 : 10;
    }
    if (!ex.perHand && ex.isLowerBody) {
      return beginner ? 12 : 20; // goblet squat
    }
    return beginner ? 8 : 14;
  }
  // Stacks (machine / cable / EZ / kettlebell / band): count "plates".
  const plate = Math.max(
    slot.stepOverrideKg ??
      (ex.equipment === 'MACHINE'
        ? profile.machineStepKg
        : ex.equipment === 'CABLE'
          ? profile.cableStepKg
          : ex.incrementKg),
    ex.incrementKg,
  );
  const compound = ex.category === 'COMPOUND';
  const plates = beginner ? (compound ? 3 : 2) : compound ? 5 : 4;
  return plate * plates;
}

function makeSuggestion(
  kind: SuggestionKind,
  weightKg: number,
  reps: number[],
  sets: number,
  reasonCode: ReasonCode,
  inputs: Inputs,
  deltaKg: number,
): Suggestion {
  return {
    kind,
    weightKg: round2(weightKg),
    reps: fitTargets(reps, sets, reps[0] ?? 0),
    sets,
    reasonCode,
    inputs,
    deltaKg: round2(deltaKg),
    engineVersion: ENGINE_VERSION,
  };
}

/** Starting state: known weight → no calibration; otherwise starting guess (research §1.7). */
export function initialState(input: {
  slot: ExerciseSlot;
  profile: EquipmentProfile;
  experience: TrainingExperience;
  knownWeightKg?: number | null;
}): ProgressionState {
  const { slot, profile, experience } = input;
  const known = input.knownWeightKg ?? null;
  const calibrating = known === null && canCalibrate(slot);
  const weight = roundToAchievable(
    known ?? startingGuessKg(slot, profile, experience),
    slot,
    profile,
    'nearest',
  );
  // Calibration asks for the whole range so the first RIR tap is informative.
  const target = calibrating ? slot.repMax : slot.repMin;
  const next = makeSuggestion(
    'start',
    weight,
    all(slot.sets, target),
    slot.sets,
    calibrating ? 'START_CALIBRATING' : 'START',
    {
      ...slotInputs(slot),
      startingGuess: known === null,
      experience,
      lastWeightKg: null,
      baselineKg: null,
    },
    0,
  );
  return {
    workingWeightKg: next.weightKg,
    repTargets: next.reps,
    sets: next.sets,
    missStreak: 0,
    stallCount: 0,
    resetDates: [],
    calibrating,
    calibrationExposures: 0,
    justIncreased: false,
    preBreakWeightKg: null,
    lastExposureDate: null,
    lastTotalReps: null,
    next,
  };
}

// ─── One exposure (research §1.5–§1.8) ───────────────────────────────────────

interface Decision {
  kind: SuggestionKind;
  weightKg: number;
  reps: number[];
  sets: number;
  reasonCode: ReasonCode;
  extra: Inputs;
}

interface Ctx {
  slot: ExerciseSlot;
  profile: EquipmentProfile;
  experience: TrainingExperience;
  state: ProgressionState;
  W: number;
  reps: number[];
  rir: number | null;
  repMin: number;
  repMax: number;
  targetRir: number;
  sets: number;
  progressed: boolean;
  timed: boolean;
}

function decision(
  kind: SuggestionKind,
  weightKg: number,
  reps: number[],
  sets: number,
  reasonCode: ReasonCode,
  extra: Inputs = {},
): Decision {
  return { kind, weightKg, reps, sets, reasonCode, extra };
}

/** Expected reps after a load increase at constant effort (Epley; research §1.5). */
export function targetsAfterIncrease(input: {
  fromKg: number;
  toKg: number;
  lastReps: number;
  rir: number | null;
  repMin: number;
  repMax: number;
  targetRir: number;
  bodyweightStyle: boolean;
}): number {
  const { repMin, repMax } = input;
  const clampT = (x: number) => Math.max(repMin, Math.min(x, repMax - 1));
  if (input.bodyweightStyle || input.fromKg <= 0 || input.toKg <= 0) {
    return clampT(repMin + 1);
  }
  const e1rm = input.fromKg * (1 + (input.lastReps + (input.rir ?? 0)) / 30);
  const repsToFailure = Math.floor(30 * (e1rm / input.toKg - 1) + 1e-9);
  return clampT(repsToFailure - input.targetRir);
}

function afterIncrease(c: Ctx, toKg: number): number[] {
  const model = loadModel(c.slot);
  const t = c.timed
    ? c.repMin
    : targetsAfterIncrease({
        fromKg: c.W,
        toKg,
        lastReps: c.reps[c.reps.length - 1] ?? c.repMin,
        rir: c.rir,
        repMin: c.repMin,
        repMax: c.repMax,
        targetRir: c.targetRir,
        bodyweightStyle: model === 'BELT' || model === 'ASSISTED' || model === 'NONE',
      });
  return all(c.sets, t);
}

/** Add load when the equipment allows it; null when the exercise can only grow by sets. */
function addLoad(c: Ctx, easy: boolean): Decision | null {
  if (!canGoHarder(c.W, c.slot, c.profile)) {
    return null;
  }
  const model = loadModel(c.slot);
  if (model === 'ASSISTED') {
    const W2 = stepUp(c.W, c.slot, c.profile);
    return decision('increase', W2, afterIncrease(c, W2), c.sets, 'ASSIST_DOWN', { easy });
  }
  const one = incrementLoad(c.W, c.slot, c.profile, {
    bigLowerStep: c.experience === 'BEGINNER' && c.progressed,
  });
  if (model === 'BELT') {
    return decision('increase', one, afterIncrease(c, one), c.sets, 'BW_ADD_LOAD', { easy });
  }
  if (easy) {
    return decision('increase', one, afterIncrease(c, one), c.sets, 'EASY_ADD_LOAD');
  }
  const jumpPct = round2(one / c.W - 1);
  const bigJump = one / c.W - 1 > BIG_JUMP_PCT;
  if (!c.timed && c.rir === 0 && bigJump && c.state.next.reasonCode !== 'CONSOLIDATE') {
    return decision('hold', c.W, all(c.sets, c.repMax), c.sets, 'CONSOLIDATE', {
      nextWeightKg: one,
      jumpPct,
    });
  }
  const steps = !c.timed && c.rir !== null && c.rir >= 3 ? 2 : 1;
  const W2 = capIncrease(
    incrementLoad(c.W, c.slot, c.profile, {
      bigLowerStep: c.experience === 'BEGINNER' && c.progressed,
      steps,
    }),
    c.W,
    one,
    c.slot,
    c.profile,
  );
  const double = isHarder(W2, one, c.slot);
  return decision(
    'increase',
    W2,
    afterIncrease(c, W2),
    c.sets,
    double ? 'TOP_EASY_DOUBLE_JUMP' : 'TOP_OF_RANGE',
    { jumpPct, bigJump },
  );
}

function topOfRange(c: Ctx): Decision {
  const loaded = addLoad(c, false);
  if (loaded) {
    return loaded;
  }
  if (growsBySets(c.W, c.slot, c.profile) && c.sets < MAX_BODYWEIGHT_SETS) {
    return decision('increase', c.W, all(c.sets + 1, c.repMax), c.sets + 1, 'BW_ADD_SET');
  }
  return decision('hold', c.W, all(c.sets, c.repMax), c.sets, 'STALL_SUGGEST_SWAP', {
    maxedOut: true,
  });
}

/** Research §1.5 core decision; returns the decision and the updated miss streak. */
function normalRules(c: Ctx): { d: Decision; missStreak: number } {
  const { reps, repMin, repMax } = c;
  const missStreak = c.state.missStreak;
  if (reps.every((r) => r >= repMax)) {
    return { d: topOfRange(c), missStreak };
  }
  if (reps.every((r) => r >= repMin)) {
    const last = reps[reps.length - 1] ?? 0;
    if (!c.timed && c.rir !== null && c.rir >= 3 && last >= mid(repMin, repMax)) {
      const easy = addLoad(c, true);
      if (easy) {
        return { d: easy, missStreak };
      }
    }
    const step = c.timed ? TIMED_STEP_SEC : 1;
    const targets = reps.map((r) => Math.min(repMax, r + step));
    return {
      d: decision('hold', c.W, fitTargets(targets, c.sets, repMax), c.sets, 'ADD_REPS'),
      missStreak,
    };
  }
  const tolerance = c.timed ? TIMED_STEP_SEC : 2;
  if (c.state.justIncreased && reps.every((r) => r >= repMin - tolerance)) {
    return {
      d: decision('hold', c.W, all(c.sets, repMin), c.sets, 'NEW_WEIGHT_SETTLING'),
      missStreak,
    };
  }
  if (missStreak + 1 === 1) {
    return {
      d: decision('hold', c.W, all(c.sets, repMin), c.sets, 'MISSED_ONCE'),
      missStreak: 1,
    };
  }
  const W2 = easierOf(
    scaleEasier(c.W, 0.9, c.slot, c.profile),
    stepDown(c.W, c.slot, c.profile),
    c.slot,
  );
  if (!isHarder(c.W, W2, c.slot)) {
    // Nothing lighter exists (bodyweight): keep asking for the floor.
    return {
      d: decision('hold', c.W, all(c.sets, repMin), c.sets, 'MISSED_ONCE', { cannotReduce: true }),
      missStreak: 0,
    };
  }
  return {
    d: decision('decrease', W2, all(c.sets, Math.min(repMin + 2, repMax)), c.sets, 'MISSED_TWICE'),
    missStreak: 0,
  };
}

/** Research §1.7 calibration table. `stays` = calibration continues after this exposure. */
function calibrate(c: Ctx): { d: Decision; stays: boolean; missStreak: number } {
  const { reps, repMin, repMax, rir, W } = c;
  if (reps.some((r) => r < repMin)) {
    const W2 = scaleEasier(W, 0.85, c.slot, c.profile);
    const kind = isHarder(W, W2, c.slot) ? 'decrease' : 'hold';
    return {
      d: decision(kind, W2, all(c.sets, Math.min(repMin + 2, repMax)), c.sets, 'CALIBRATING_DOWN'),
      stays: rir !== null,
      missStreak: 0,
    };
  }
  if (rir === null || rir === 1) {
    return { ...normalRules(c), stays: false };
  }
  if (rir >= 3) {
    let W2: number;
    if (reps.every((r) => r >= repMax)) {
      const minJumpKg = minCalibrationJumpKg(c);
      const floor = roundToAchievable(W + minJumpKg, c.slot, c.profile, 'up');
      W2 = harderOf(roundNearestUp(W * 1.2, W, c.slot, c.profile), floor, c.slot);
    } else {
      W2 = roundNearestUp(W * 1.1, W, c.slot, c.profile);
    }
    const kind = isHarder(W2, W, c.slot) ? 'increase' : 'hold';
    return {
      d: decision(kind, W2, afterIncrease(c, W2), c.sets, 'CALIBRATING_UP'),
      stays: true,
      missStreak: 0,
    };
  }
  if (rir === 2) {
    const W2 = incrementLoad(W, c.slot, c.profile, {
      bigLowerStep: c.experience === 'BEGINNER',
    });
    const kind = isHarder(W2, W, c.slot) ? 'increase' : 'hold';
    return {
      d: decision(kind, W2, afterIncrease(c, W2), c.sets, 'CALIBRATING_UP', {
        calibrationDone: true,
      }),
      stays: false,
      missStreak: 0,
    };
  }
  // RIR 0: that is the weight — hold it and build reps.
  const targets = reps.map((r) => Math.min(repMax, r + 1));
  return {
    d: decision('hold', W, fitTargets(targets, c.sets, repMax), c.sets, 'ADD_REPS', {
      calibrationDone: true,
    }),
    stays: false,
    missStreak: 0,
  };
}

/** Minimum calibration jump on "3+ at the top of the range" (research §1.7 row 1). */
function minCalibrationJumpKg(c: Ctx): number {
  if (loadModel(c.slot) !== 'PLATES') {
    return 0;
  }
  const lb = c.profile.unit === 'LB';
  const units = c.slot.exercise.isLowerBody ? (lb ? 20 : 10) : lb ? 10 : 5;
  return lb ? unitToKg(units, 'LB') : units;
}

/** Research §1.8 fast track back to the pre-break weight. */
function reentry(c: Ctx, preBreakKg: number): { d: Decision; missStreak: number } {
  const targets = c.state.next.reps;
  const reached = c.reps.every(
    (r, i) => r >= (targets[i] ?? targets[targets.length - 1] ?? c.repMin),
  );
  const allTop = c.reps.every((r) => r >= c.repMax);
  const good = reached && (c.rir !== null ? c.rir >= 2 : allTop);
  if (good && canGoHarder(c.W, c.slot, c.profile)) {
    const one = incrementLoad(c.W, c.slot, c.profile);
    const two = incrementLoad(c.W, c.slot, c.profile, { steps: 2 });
    const W2 = easierOf(capIncrease(two, c.W, one, c.slot, c.profile), preBreakKg, c.slot);
    if (isHarder(W2, c.W, c.slot)) {
      return {
        d: decision(
          'increase',
          W2,
          fitTargets(targets, c.sets, c.repMin),
          c.sets,
          'BREAK_FAST_TRACK',
          {
            preBreakWeightKg: preBreakKg,
          },
        ),
        missStreak: 0,
      };
    }
  }
  return normalRules(c);
}

function resetsInWindow(dates: string[], today: string): string[] {
  return dates.filter((d) => {
    const age = daysBetweenLocal(d, today);
    return age >= 0 && age < RESET_WINDOW_DAYS;
  });
}

/** Apply one finished exposure; the returned state's `next` is the raw suggestion (research §1.5). */
export function applyExposure(input: {
  slot: ExerciseSlot;
  state: ProgressionState;
  exposure: Exposure;
  profile: EquipmentProfile;
  experience: TrainingExperience;
}): ProgressionState {
  const { slot, state, exposure, profile, experience } = input;
  if (exposure.skipped) {
    return state;
  }
  const date = exposure.localDate;
  const baseInputs = { ...slotInputs(slot), repMin: exposure.repMin, repMax: exposure.repMax };

  // 0. Deload sessions never move progression: resume the pre-deload prescription.
  if (exposure.wasDeload) {
    return {
      ...state,
      lastExposureDate: date,
      next: {
        ...state.next,
        kind: 'hold',
        reasonCode: 'DELOAD_DONE',
        deltaKg: 0,
        inputs: { ...state.next.inputs, deloadDone: true },
      },
    };
  }

  const working = exposure.loggedSets.filter((s) => !s.isWarmup && s.completed);
  const reps = working.map((s) => s.reps);
  const rir = exposure.lastSetRir;
  const W =
    working.length > 0
      ? roundToAchievable(
          working
            .map((s) => s.weightKg)
            .reduce((a, b) => easierOf(a, b, slot), working[0]?.weightKg ?? 0),
          slot,
          profile,
          'nearest',
        )
      : null;

  // Break detection (research §1.8) from the gap since the last exposure.
  const gap = state.lastExposureDate ? daysBetweenLocal(state.lastExposureDate, date) : 0;
  const lastPerf = lastPerformedKg(state);
  let calibrating = state.calibrating;
  let calibrationExposures = state.calibrationExposures;
  let preBreak = state.preBreakWeightKg;
  let breakApplied = false;
  if (W !== null && gap > 112 && canCalibrate(slot)) {
    calibrating = true;
    calibrationExposures = 0;
    preBreak = null;
    breakApplied = true;
  } else if (W !== null && gap >= 15 && lastPerf !== null && isHarder(lastPerf, W, slot)) {
    preBreak = preBreak === null ? lastPerf : harderOf(preBreak, lastPerf, slot);
    breakApplied = true;
  }

  // 1. Skipped sets → same targets, counters untouched.
  if (W === null || working.length < exposure.sets) {
    const keepW = breakApplied && W !== null ? W : state.next.weightKg;
    const next = makeSuggestion(
      'hold',
      keepW,
      state.next.reps,
      state.next.sets,
      'INCOMPLETE',
      {
        ...state.next.inputs,
        ...baseInputs,
        completedSets: working.length,
        plannedSets: exposure.sets,
        lastWeightKg: W ?? lastPerf,
      },
      0,
    );
    return {
      ...state,
      calibrating,
      calibrationExposures,
      preBreakWeightKg: preBreak,
      workingWeightKg: next.weightKg,
      repTargets: next.reps,
      lastExposureDate: date,
      next,
    };
  }

  const totalAtW = working
    .filter((s) => sameKg(roundToAchievable(s.weightKg, slot, profile, 'nearest'), W))
    .reduce((sum, s) => sum + s.reps, 0);
  const baseline = baselineKg(state);
  const progressed =
    baseline === null ||
    isHarder(W, baseline, slot) ||
    (sameKg(W, baseline) && totalAtW > (state.lastTotalReps ?? -1));

  const ctx: Ctx = {
    slot,
    profile,
    experience,
    state,
    W,
    reps,
    rir,
    repMin: exposure.repMin,
    repMax: exposure.repMax,
    targetRir: exposure.targetRir,
    sets: baseSets(slot, state, W, profile),
    progressed,
    timed: slot.exercise.isTimed,
  };

  let d: Decision;
  let missStreak: number;
  let stallCount = progressed ? 0 : state.stallCount + 1;
  let resetDates = resetsInWindow(state.resetDates, date);
  if (calibrating) {
    calibrationExposures += 1;
    const r = calibrate(ctx);
    d = r.d;
    missStreak = r.missStreak;
    calibrating = r.stays && calibrationExposures < CALIBRATION_MAX_EXPOSURES;
    stallCount = 0;
  } else if (preBreak !== null) {
    ({ d, missStreak } = reentry(ctx, preBreak));
    stallCount = 0;
  } else {
    ({ d, missStreak } = normalRules(ctx));
    // Research §1.6 exercise-level stall.
    const stallable =
      d.reasonCode === 'ADD_REPS' ||
      d.reasonCode === 'MISSED_ONCE' ||
      d.reasonCode === 'NEW_WEIGHT_SETTLING';
    if (stallable && stallCount >= STALL_LIMIT) {
      const W2 = scaleEasier(W, 0.9, slot, profile);
      if (resetDates.length >= 2 || !isHarder(W, W2, slot)) {
        d = { ...d, reasonCode: 'STALL_SUGGEST_SWAP', extra: { ...d.extra, stallCount } };
      } else {
        d = decision(
          'decrease',
          W2,
          all(ctx.sets, Math.max(ctx.repMin, ctx.repMax - 2)),
          ctx.sets,
          'STALL_RESET',
          { stallCount },
        );
        resetDates = [...resetDates, date];
        missStreak = 0;
      }
    }
  }

  if (reps.every((r) => r >= ctx.repMin)) {
    missStreak = 0;
  }
  if (d.kind === 'decrease') {
    stallCount = 0;
  }
  if (preBreak !== null && !isHarder(preBreak, d.weightKg, slot)) {
    preBreak = null;
  }

  const lastTotalReps =
    baseline !== null && sameKg(baseline, W) && state.lastTotalReps !== null
      ? Math.max(state.lastTotalReps, totalAtW)
      : totalAtW;
  const next = makeSuggestion(
    d.kind,
    d.weightKg,
    d.reps,
    d.sets,
    d.reasonCode,
    {
      ...baseInputs,
      lastWeightKg: W,
      baselineKg: W,
      lastReps: reps,
      lastSetRir: rir,
      totalReps: totalAtW,
      progressed,
      hasDipBelt: profile.hasDipBelt,
      ...d.extra,
    },
    d.weightKg - W,
  );
  return {
    workingWeightKg: next.weightKg,
    repTargets: next.reps,
    sets: next.sets,
    missStreak,
    stallCount,
    resetDates,
    calibrating,
    calibrationExposures,
    justIncreased: d.kind === 'increase',
    preBreakWeightKg: preBreak,
    lastExposureDate: date,
    lastTotalReps,
    next,
  };
}

// ─── Prescription for a given day ────────────────────────────────────────────

/** state.next resized to the slot as it is now (sets may have been edited). */
function fitToSlot(
  slot: ExerciseSlot,
  state: ProgressionState,
  profile: EquipmentProfile,
): Suggestion {
  const base = state.next;
  const sets = baseSets(slot, state, base.weightKg, profile);
  return { ...base, sets, reps: fitTargets(base.reps, sets, slot.repMin) };
}

/** Research §1.6 deload: half the sets (rounded up), ~90 % load, reps at the floor. */
export function deloadPrescription(input: {
  slot: ExerciseSlot;
  state: ProgressionState;
  profile: EquipmentProfile;
}): Suggestion {
  const { slot, profile } = input;
  const base = fitToSlot(slot, input.state, profile);
  const sets = Math.ceil(base.sets / 2);
  const weight = scaleEasier(base.weightKg, 0.9, slot, profile);
  return makeSuggestion(
    'deload',
    weight,
    all(sets, slot.repMin),
    sets,
    'DELOAD',
    { ...base.inputs, deloadFromKg: base.weightKg },
    weight - base.weightKg,
  );
}

/** Research §1.8 re-entry fraction for a gap; 'hold' = repeat, null = normal rules. */
export function breakFactor(gapDays: number, ageYears: number | null): number | 'hold' | null {
  const senior = ageYears !== null && ageYears >= 65;
  if (gapDays <= 14) {
    return null;
  }
  if (gapDays <= 28) {
    return senior ? 0.9 : 'hold';
  }
  if (gapDays <= 56) {
    return senior ? 0.8 : 0.9;
  }
  if (gapDays <= 112) {
    return senior ? 0.7 : 0.8;
  }
  return 0.7;
}

/**
 * Final prescription for the next session on `today` (localDate): applies the
 * break re-entry gap (§1.8), an active deload (§1.6) and a user override (D5c)
 * on top of state.next.
 */
export function prescribe(input: {
  slot: ExerciseSlot;
  state: ProgressionState;
  override: ProgressionOverride | null;
  profile: EquipmentProfile;
  facts: TrainingProfileFacts;
  today: string;
  deload: boolean;
}): Suggestion {
  const { slot, state, override, profile, facts, today } = input;
  const base = fitToSlot(slot, state, profile);
  const lastDate = state.lastExposureDate;

  if (override && (lastDate === null || override.at > lastDate)) {
    const kind: SuggestionKind = isHarder(override.weightKg, base.weightKg, slot)
      ? 'increase'
      : isHarder(base.weightKg, override.weightKg, slot)
        ? 'decrease'
        : 'hold';
    return makeSuggestion(
      kind,
      override.weightKg,
      override.reps,
      override.reps.length,
      'USER_OVERRIDE',
      {
        ...base.inputs,
        engineWeightKg: base.weightKg,
        engineReps: base.reps,
        overrideAt: override.at,
      },
      override.weightKg - base.weightKg,
    );
  }

  if (input.deload) {
    return deloadPrescription({ slot, state, profile });
  }

  if (lastDate === null) {
    return base;
  }
  const gapDays = daysBetweenLocal(lastDate, today);
  const factor = breakFactor(gapDays, facts.ageYears);
  if (factor === null) {
    return base;
  }
  const lastW = lastPerformedKg(state) ?? base.weightKg;
  const holdW = base.kind === 'increase' ? easierOf(base.weightKg, lastW, slot) : base.weightKg;
  const hold = makeSuggestion(
    'hold',
    holdW,
    base.reps,
    base.sets,
    'BREAK_HOLD',
    { ...base.inputs, gapDays },
    holdW - lastW,
  );
  if (factor === 'hold') {
    return hold;
  }
  const W2 = easierOf(scaleEasier(lastW, factor, slot, profile), base.weightKg, slot);
  if (!isHarder(lastW, W2, slot)) {
    return hold;
  }
  return makeSuggestion(
    'decrease',
    W2,
    base.reps,
    base.sets,
    'BREAK_REENTRY',
    {
      ...base.inputs,
      gapDays,
      pct: Math.round(factor * 100),
      breakFromKg: lastW,
      recalibrate: gapDays > 112 && canCalibrate(slot),
    },
    W2 - lastW,
  );
}

// ─── History fold ────────────────────────────────────────────────────────────

/** Canonical exposure order: performedAt, then sessionId. */
export function sortExposures(exposures: Exposure[]): Exposure[] {
  return [...exposures].sort((a, b) =>
    a.performedAt === b.performedAt
      ? a.sessionId.localeCompare(b.sessionId)
      : a.performedAt.localeCompare(b.performedAt),
  );
}

/**
 * Fold the engine over an exercise's completed exposures (sorted by
 * performedAt inside). Deterministic: same inputs → same state.
 */
export function foldHistory(input: {
  slot: ExerciseSlot;
  exposures: Exposure[];
  profile: EquipmentProfile;
  experience: TrainingExperience;
  knownWeightKg?: number | null;
}): ProgressionState {
  const { slot, profile, experience } = input;
  let state = initialState({
    slot,
    profile,
    experience,
    knownWeightKg: input.knownWeightKg ?? null,
  });
  for (const exposure of sortExposures(input.exposures)) {
    state = applyExposure({ slot, state, exposure, profile, experience });
  }
  return state;
}
