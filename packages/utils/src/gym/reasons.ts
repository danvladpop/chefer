// Reason codes → one-sentence explanations (research §1.11/§1.12). Wording
// follows the worked-example table; slots come from the suggestion itself and
// its `inputs` (stored with the suggestion so old explanations stay truthful).
import type { ExerciseLoadType, Suggestion, WeightUnit } from '@chefer/types';
import { formatLoad, formatLoadNumber, kgToUnit, round2, unitLabel } from './loads';

type Inputs = Suggestion['inputs'];

function num(inputs: Inputs, key: string): number | null {
  const v = inputs[key];
  return typeof v === 'number' ? v : null;
}

function str(inputs: Inputs, key: string): string | null {
  const v = inputs[key];
  return typeof v === 'string' ? v : null;
}

function flag(inputs: Inputs, key: string): boolean {
  return inputs[key] === true;
}

function nums(inputs: Inputs, key: string): number[] {
  const v = inputs[key];
  return Array.isArray(v) ? v : [];
}

const LOAD_TYPES: readonly ExerciseLoadType[] = [
  'WEIGHTED',
  'BODYWEIGHT',
  'BODYWEIGHT_PLUS',
  'ASSISTED',
];

function loadTypeOf(inputs: Inputs): ExerciseLoadType {
  const lt = str(inputs, 'loadType');
  return LOAD_TYPES.find((t) => t === lt) ?? 'WEIGHTED';
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) {
    return `${n}th`;
  }
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function deltaText(fromKg: number, toKg: number, unit: WeightUnit): string {
  const d = Math.abs(round2(kgToUnit(toKg, unit) - kgToUnit(fromKg, unit)));
  return `${String(round2(d))} ${unitLabel(unit)}`;
}

function repsList(reps: number[], timed: boolean): string {
  return reps.join(' / ') + (timed ? ' s' : '');
}

/** "10 reps", "8+ reps", "11 / 10 / 9", "30 s". */
function aimText(reps: number[], repMin: number, timed: boolean): string {
  const firstRep = reps[0] ?? repMin;
  if (reps.every((r) => r === firstRep)) {
    if (timed) {
      return `${firstRep} s`;
    }
    return firstRep === repMin ? `${firstRep}+ reps` : `${firstRep} reps`;
  }
  return repsList(reps, timed);
}

/** One-sentence explanation shown under the suggestion (research §1.11 wording). */
export function explain(suggestion: Suggestion, unit: WeightUnit): string {
  const s = suggestion;
  const i = s.inputs;
  const lt = loadTypeOf(i);
  const timed = flag(i, 'isTimed');
  const repMin = num(i, 'repMin') ?? Math.min(...s.reps);
  const repMax = num(i, 'repMax') ?? Math.max(...s.reps);
  const w = formatLoad(s.weightKg, unit, lt);
  const aim = aimText(s.reps, repMin, timed);
  const last = num(i, 'lastWeightKg') ?? s.weightKg - s.deltaKg;
  const delta = deltaText(last, s.weightKg, unit);
  const equipment = str(i, 'equipment');
  const bigJumpLine = ` It's a big jump, so ${Math.max(1, repMin - 2)}+ reps is a win.`;

  switch (s.reasonCode) {
    case 'START':
      return lt === 'WEIGHTED'
        ? `Starting weight: ${w}. Aim for ${aim}.`
        : `Start with ${s.sets} × ${aim}${lt === 'ASSISTED' ? ` at ${w}` : ''}.`;
    case 'START_CALIBRATING':
      return `Starting guess: ${w}. Change it freely, and tap how many reps you had left on the last set.`;
    case 'TOP_OF_RANGE': {
      if (timed) {
        return `You held ${repMax} s on every set, so up to ${w}. Aim for ${aim}.`;
      }
      const tail = flag(i, 'bigJump') ? bigJumpLine : ` Aim for ${aim}.`;
      if (equipment === 'DUMBBELL') {
        const what = flag(i, 'perHand') ? 'pair' : 'dumbbell';
        return `Top of the range, so up to the ${formatLoad(s.weightKg, unit)} ${what}.${tail}`;
      }
      return `You hit ${repMax} on every set, so +${delta} today.${tail}`;
    }
    case 'TOP_EASY_DOUBLE_JUMP':
      return `${repMax} reps on every set with 3+ left in the tank, so we're jumping ${delta}.`;
    case 'EASY_ADD_LOAD':
      return equipment === 'MACHINE' || equipment === 'CABLE'
        ? "Your last set had 3+ reps left, so we're adding one plate."
        : `Your last set had 3+ reps left, so we're adding ${delta}.`;
    case 'ADD_REPS':
      if (timed) {
        return 'Same load. Hold each set 5 s longer.';
      }
      if (s.reps.every((r) => r >= repMax)) {
        return `Same weight. Get ${repMax} on every set to move up.`;
      }
      return 'Same weight. Beat last time by one rep per set.';
    case 'CONSOLIDATE': {
      const nextKg = num(i, 'nextWeightKg');
      const jump = nextKg === null ? 'next' : formatLoad(nextKg, unit);
      return `You maxed out at failure, so lock in ${repMax}s once more before the ${jump} jump.`;
    }
    case 'NEW_WEIGHT_SETTLING':
      return `New weight takes a session to settle. Same again, aim for ${repMin}s.`;
    case 'MISSED_ONCE':
      return timed
        ? `Tough day, so same again. Hold ${repMin} s on every set.`
        : `Tough day, so same weight. Get ${repMin} on every set.`;
    case 'MISSED_TWICE':
      return `Two sessions under ${repMin}${timed ? ' s' : ' reps'}, so dropping to ${w} to build back up.`;
    case 'STALL_RESET':
      return `No progress in ${num(i, 'stallCount') ?? 3} sessions, so resetting to ${w} to build momentum.`;
    case 'STALL_SUGGEST_SWAP':
      return flag(i, 'maxedOut')
        ? "You've maxed out this exercise's progression. Try a harder variation."
        : 'This lift has stalled twice lately. Try a variation or a different rep range.';
    case 'INCOMPLETE': {
      const skipped = Math.max(1, (num(i, 'plannedSets') ?? 1) - (num(i, 'completedSets') ?? 0));
      return skipped === 1
        ? 'You skipped a set, so same targets next time.'
        : `You skipped ${skipped} sets, so same targets next time.`;
    }
    case 'DELOAD':
      return `Deload week: ${w} for ${s.sets} ${s.sets === 1 ? 'set' : 'sets'}. Leave 3–4 reps in the tank.`;
    case 'DELOAD_DONE':
      return `Deload done, so back to ${w} where you left off.`;
    case 'BREAK_HOLD':
      return 'Welcome back. Same as last time, no increase today.';
    case 'BREAK_REENTRY': {
      const from = num(i, 'breakFromKg') ?? last;
      return `Welcome back, ${w} today (about ${num(i, 'pct') ?? 90}% of your last ${formatLoadNumber(from, unit)}). You'll be back up in a few sessions.`;
    }
    case 'BREAK_FAST_TRACK': {
      const pre = num(i, 'preBreakWeightKg');
      if (pre === null || round2(pre) <= round2(s.weightKg)) {
        return `Strong session, so back up to ${w}, where you were before the break.`;
      }
      return `Strong session, so jumping to ${w}. Closing in on your old ${formatLoad(pre, unit, lt)}.`;
    }
    case 'CALIBRATING_UP':
      return flag(i, 'calibrationDone')
        ? `Good read: ${w} should be about right. Aim for ${aim}.`
        : `That looked easy, so trying ${w} to find your working weight.`;
    case 'CALIBRATING_DOWN':
      return `That was a bit heavy, so trying ${w} to find your working weight.`;
    case 'BW_ADD_SET': {
      const head = timed
        ? `You held ${repMax} s on every set, so add a ${ordinal(s.sets)} set.`
        : `Top of the range, so add a ${ordinal(s.sets)} set.`;
      const belt =
        lt === 'BODYWEIGHT_PLUS' && !flag(i, 'hasDipBelt')
          ? ' A dip belt would let you add weight instead.'
          : '';
      return head + belt;
    }
    case 'BW_ADD_LOAD':
      return flag(i, 'easy')
        ? `Your last set had 3+ reps left, so add ${delta} on the belt.`
        : `Top of the range, so add ${delta} on the belt.`;
    case 'ASSIST_DOWN': {
      const lead = flag(i, 'easy')
        ? 'Your last set had 3+ reps left, so less help today'
        : 'Top of the range, so less help today';
      return s.weightKg <= 0
        ? `${lead}: no assistance at all.`
        : `${lead}: ${formatLoad(s.weightKg, unit)} of assistance.`;
    }
    case 'USER_OVERRIDE':
      return `Your own target: ${w}, ${aimText(s.reps, repMin, timed)}.`;
  }
}

const RULES: Record<Suggestion['reasonCode'], (r: string) => string> = {
  START: () => 'No history yet: a starting point',
  START_CALIBRATING: () => 'No history yet: a starting guess to calibrate',
  TOP_OF_RANGE: (r) => `All sets at the top of ${r}`,
  TOP_EASY_DOUBLE_JUMP: (r) => `All sets at the top of ${r} with 3+ reps left`,
  EASY_ADD_LOAD: (r) => `Inside ${r} with 3+ reps left on the last set`,
  ADD_REPS: (r) => `All sets inside ${r}`,
  CONSOLIDATE: (r) => `Top of ${r} at failure, and the next jump is big`,
  NEW_WEIGHT_SETTLING: () => 'First session after a weight increase',
  MISSED_ONCE: (r) => `A set below the bottom of ${r}`,
  MISSED_TWICE: (r) => `Two sessions in a row below the bottom of ${r}`,
  STALL_RESET: () => 'Three sessions in a row without progress',
  STALL_SUGGEST_SWAP: () => 'Stalled again after recent resets',
  INCOMPLETE: () => 'Not every working set was logged',
  DELOAD: () => 'Deload week: half the sets, about 90 % of the weight',
  DELOAD_DONE: () => 'Deload finished: back to the pre-deload targets',
  BREAK_HOLD: () => '15–28 days since this exercise: hold',
  BREAK_REENTRY: () => 'Long break: restart lighter',
  BREAK_FAST_TRACK: () => 'Hit every target after a break: two steps up',
  CALIBRATING_UP: () => 'Calibrating: the last set felt easy',
  CALIBRATING_DOWN: () => 'Calibrating: a set fell below the range',
  BW_ADD_SET: (r) => `All sets at the top of ${r}, no way to add load`,
  BW_ADD_LOAD: (r) => `All sets at the top of ${r}: add load on the belt`,
  ASSIST_DOWN: (r) => `All sets at the top of ${r}: less assistance`,
  USER_OVERRIDE: () => 'You set this target yourself',
};

/** Label/value rows for the "Why?" sheet. */
export function explainInputs(
  suggestion: Suggestion,
  unit: WeightUnit,
): { label: string; value: string }[] {
  const s = suggestion;
  const i = s.inputs;
  const lt = loadTypeOf(i);
  const timed = flag(i, 'isTimed');
  const repMin = num(i, 'repMin');
  const repMax = num(i, 'repMax');
  const range = repMin !== null && repMax !== null ? `${repMin}–${repMax}` : 'the range';
  const rows: { label: string; value: string }[] = [];
  const lastKg = num(i, 'lastWeightKg');
  const lastReps = nums(i, 'lastReps');
  rows.push({
    label: 'Last time',
    value:
      lastKg === null
        ? 'No history yet'
        : lastReps.length > 0
          ? `${formatLoad(lastKg, unit, lt)} × ${repsList(lastReps, timed)}`
          : formatLoad(lastKg, unit, lt),
  });
  if (lastKg !== null) {
    const rir = num(i, 'lastSetRir');
    rows.push({
      label: 'Last-set RIR',
      value: rir === null ? 'Not given' : rir >= 3 ? '3+' : String(rir),
    });
  }
  rows.push({ label: 'Rule', value: RULES[s.reasonCode](range) });
  const gap = num(i, 'gapDays');
  if (gap !== null) {
    rows.push({ label: 'Days since last session', value: String(gap) });
  }
  const stall = num(i, 'stallCount');
  if (stall !== null) {
    rows.push({ label: 'Sessions without progress', value: String(stall) });
  }
  const pre = num(i, 'preBreakWeightKg') ?? num(i, 'breakFromKg');
  if (pre !== null) {
    rows.push({ label: 'Before the break', value: formatLoad(pre, unit, lt) });
  }
  const jump = num(i, 'jumpPct');
  if (jump !== null) {
    rows.push({ label: 'Next jump', value: `${Math.round(jump * 100)} %` });
  }
  rows.push({
    label: 'Next',
    value: `${formatLoad(s.weightKg, unit, lt)} × ${repsList(s.reps, timed)}`,
  });
  return rows;
}
