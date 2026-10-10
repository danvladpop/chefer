import { describe, expect, it } from 'vitest';
import { CARDIO_CATALOG_BY_ID } from '@chefer/types';
import {
  cardioMet,
  estimateSessionKcal,
  roundKcalEstimate,
  sessionKcalCopy,
  STRENGTH_MET,
  type BurnSession,
} from './burn';

const START = '2026-10-10T17:00:00.000Z';
const at = (min: number) => new Date(Date.parse(START) + min * 60_000).toISOString();

type SetRow = BurnSession['exercises'][number]['sets'][number];
const strengthSet = (over: Partial<SetRow> = {}): SetRow => ({
  isWarmup: false,
  completed: true,
  ...over,
});

function session(
  minutes: number | null,
  exercises: { exerciseId: string; skipped?: boolean; sets: SetRow[] }[],
): BurnSession {
  return {
    startedAt: START,
    finishedAt: minutes === null ? null : at(minutes),
    exercises: exercises.map((e) => ({ skipped: false, ...e })),
  };
}

const bench = (n: number, over: Partial<SetRow> = {}) => ({
  exerciseId: 'bench',
  sets: Array.from({ length: n }, () => strengthSet(over)),
});

describe('estimateSessionKcal', () => {
  it('strength only: STRENGTH_MET × kg × hours, rounded to 10', () => {
    // 60 min, 15 working sets (cap 15 × 5 + 10 = 85 min, so the wall clock wins).
    const result = estimateSessionKcal({
      session: session(60, [bench(15)]),
      bodyweightKg: 80,
    });
    // 3.5 × 80 × 1 = 280.
    expect(STRENGTH_MET).toBe(3.5);
    expect(result).toEqual({ kcal: 280, isEstimate: true });
  });

  it('ignores warm-ups, unticked sets and skipped exercises when counting work', () => {
    const result = estimateSessionKcal({
      session: session(60, [
        { exerciseId: 'bench', sets: [strengthSet({ isWarmup: true }), strengthSet()] },
        { exerciseId: 'row', sets: [strengthSet({ completed: false })] },
        { exerciseId: 'curl', skipped: true, sets: [strengthSet()] },
      ]),
      bodyweightKg: 80,
    });
    // 1 working set → strength time capped at 5 + 10 = 15 min: 3.5 × 80 × 0.25 = 70.
    expect(result).toEqual({ kcal: 70, isEstimate: true });
  });

  it('caps a session left open for hours (Save for later) at a plausible length', () => {
    const result = estimateSessionKcal({
      session: session(20 * 60, [bench(6)]),
      bodyweightKg: 80,
    });
    // 6 sets → 40 min: 3.5 × 80 × 40/60 ≈ 186.7 → 190.
    expect(result).toEqual({ kcal: 190, isEstimate: true });
  });

  it('cardio: the catalogue MET over the logged duration (midpoint, or placed by effort)', () => {
    const run = CARDIO_CATALOG_BY_ID.get('treadmill-run');
    if (!run) throw new Error('treadmill-run missing from the catalogue');
    const mid = estimateSessionKcal({
      session: session(30, [
        { exerciseId: 'treadmill-run', sets: [strengthSet({ durationSec: 30 * 60 })] },
      ]),
      bodyweightKg: 70,
    });
    // (8 + 13) / 2 = 10.5 MET × 70 × 0.5 = 367.5 → 370.
    expect(mid).toEqual({ kcal: 370, isEstimate: true });

    const easy = estimateSessionKcal({
      session: session(30, [
        {
          exerciseId: 'treadmill-run',
          sets: [strengthSet({ durationSec: 30 * 60, intensityRpe: 1 })],
        },
      ]),
      bodyweightKg: 70,
    });
    // RPE 1 → metLow 8 × 70 × 0.5 = 280.
    expect(easy).toEqual({ kcal: 280, isEstimate: true });
    expect(cardioMet(run, 10)).toBe(13);
  });

  it('an activity logged without kcal gets an estimate from its preset MET', () => {
    const result = estimateSessionKcal({
      session: session(60, [
        { exerciseId: 'yoga-class', sets: [strengthSet({ durationSec: 60 * 60 })] },
      ]),
      bodyweightKg: 60,
    });
    // (2.5 + 4) / 2 = 3.25 × 60 × 1 = 195 → 200.
    expect(result).toEqual({ kcal: 200, isEstimate: true });
  });

  it('a custom cardio entry (outside the catalogue) uses the other-activity range', () => {
    const result = estimateSessionKcal({
      session: session(20, [
        { exerciseId: 'custom-jump-rope', sets: [strengthSet({ durationSec: 20 * 60 })] },
      ]),
      bodyweightKg: 60,
    });
    // (3 + 8) / 2 = 5.5 × 60 × 1/3 = 110.
    expect(result).toEqual({ kcal: 110, isEstimate: true });
  });

  it('mixed: logged kcal wins for its set, the rest is estimated, time is not double-counted', () => {
    const result = estimateSessionKcal({
      session: session(70, [
        bench(12),
        {
          exerciseId: 'rowing-machine',
          sets: [strengthSet({ durationSec: 10 * 60, caloriesKcal: 120 })],
        },
        { exerciseId: 'stair-climber', sets: [strengthSet({ durationSec: 10 * 60 })] },
      ]),
      bodyweightKg: 80,
    });
    // Strength: 70 − 10 − 10 = 50 min → 3.5 × 80 × 50/60 ≈ 233.3
    // Stair climber: 9.5 × 80 × 10/60 ≈ 126.7; logged rower: 120 → 480.
    expect(result).toEqual({ kcal: 480, isEstimate: true });
  });

  it('only user-entered kcal: returned as logged, unrounded', () => {
    const result = estimateSessionKcal({
      session: session(45, [
        {
          exerciseId: 'spin-class',
          sets: [strengthSet({ durationSec: 45 * 60, caloriesKcal: 313 })],
        },
      ]),
      bodyweightKg: 80,
    });
    expect(result).toEqual({ kcal: 313, isEstimate: false });
  });

  it('missing bodyweight: no estimate (never a guessed weight); logged kcal still shows', () => {
    expect(
      estimateSessionKcal({ session: session(60, [bench(15)]), bodyweightKg: null }),
    ).toBeNull();
    expect(estimateSessionKcal({ session: session(60, [bench(15)]), bodyweightKg: 0 })).toBeNull();
    expect(
      estimateSessionKcal({
        session: session(60, [
          bench(10),
          { exerciseId: 'running', sets: [strengthSet({ durationSec: 600, caloriesKcal: 90 })] },
        ]),
        bodyweightKg: undefined,
      }),
    ).toEqual({ kcal: 90, isEstimate: false });
  });

  it('zero duration: strength work with no elapsed time cannot be estimated', () => {
    expect(estimateSessionKcal({ session: session(0, [bench(5)]), bodyweightKg: 80 })).toBeNull();
    expect(
      estimateSessionKcal({ session: session(null, [bench(5)]), bodyweightKg: 80 }),
    ).toBeNull();
  });

  it('nothing done: null', () => {
    expect(estimateSessionKcal({ session: session(30, []), bodyweightKg: 80 })).toBeNull();
    expect(
      estimateSessionKcal({
        session: session(30, [{ exerciseId: 'running', sets: [strengthSet({ caloriesKcal: 0 })] }]),
        bodyweightKg: null,
      }),
    ).toBeNull();
  });
});

describe('roundKcalEstimate', () => {
  it('nearest 5 under 100, nearest 10 from 100', () => {
    expect(roundKcalEstimate(42)).toBe(40);
    expect(roundKcalEstimate(43)).toBe(45);
    expect(roundKcalEstimate(97.6)).toBe(100);
    expect(roundKcalEstimate(314)).toBe(310);
    expect(roundKcalEstimate(315)).toBe(320);
  });
});

describe('sessionKcalCopy', () => {
  it('an estimate says so, visibly and when spoken', () => {
    expect(sessionKcalCopy({ kcal: 310, isEstimate: true })).toEqual({
      value: '~310',
      label: 'kcal burned (est.)',
      spoken: 'About 310 kilocalories burned, estimated',
      hint: 'Estimated from your body weight and workout time',
    });
  });

  it('a logged number is the user’s own', () => {
    const copy = sessionKcalCopy({ kcal: 313, isEstimate: false });
    expect(copy.value).toBe('313');
    expect(copy.label).toBe('kcal you logged');
    expect(copy.spoken).toBe('313 kilocalories burned, as you logged');
  });
});
