import { describe, expect, it } from 'vitest';
import { REASON_CODES, type ReasonCode, type Suggestion } from '@chefer/types';
import { unitToKg } from './loads';
import { explain, explainInputs } from './reasons';

function sug(
  reasonCode: ReasonCode,
  weightKg: number,
  reps: number[],
  inputs: Suggestion['inputs'] = {},
  extra: Partial<Suggestion> = {},
): Suggestion {
  return {
    kind: 'hold',
    weightKg,
    reps,
    sets: reps.length,
    reasonCode,
    inputs: { repMin: 8, repMax: 12, loadType: 'WEIGHTED', equipment: 'BARBELL', ...inputs },
    deltaKg: 0,
    engineVersion: 1,
    ...extra,
  };
}

describe('explain — every reason code has one sentence', () => {
  it.each(REASON_CODES.map((c) => [c]))('%s', (code) => {
    const text = explain(sug(code, 60, [10, 10, 10], { lastWeightKg: 57.5 }), 'KG');
    expect(text.length).toBeGreaterThan(10);
    expect(text).toMatch(/[.?!]$/);
    expect(text).not.toMatch(/undefined|NaN|null/);
  });
});

describe('explain — variants', () => {
  it('start copy per load type', () => {
    expect(explain(sug('START', 60, [8, 8, 8]), 'KG')).toBe(
      'Starting weight: 60 kg. Aim for 8+ reps.',
    );
    expect(
      explain(sug('START', 0, [5, 5, 5], { loadType: 'BODYWEIGHT_PLUS', repMin: 5 }), 'KG'),
    ).toBe('Start with 3 × 5+ reps.');
    expect(
      explain(sug('START', 40, [6, 6, 6], { loadType: 'ASSISTED', repMin: 6, repMax: 10 }), 'KG'),
    ).toBe('Start with 3 × 6+ reps at 40 kg assist.');
    expect(explain(sug('START_CALIBRATING', 20, [12, 12, 12]), 'KG')).toMatch(
      /^Starting guess: 20 kg/,
    );
  });

  it('unit-aware deltas and loads (lb)', () => {
    const s = sug('TOP_OF_RANGE', unitToKg(140, 'LB'), [10, 10, 10], {
      lastWeightKg: unitToKg(135, 'LB'),
    });
    expect(explain(s, 'LB')).toBe('You hit 12 on every set, so +5 lb today. Aim for 10 reps.');
  });

  it('dumbbells: pair vs single dumbbell, big-jump tail', () => {
    const pair = sug('TOP_OF_RANGE', 10, [12, 12, 12], {
      equipment: 'DUMBBELL',
      perHand: true,
      repMin: 12,
      repMax: 20,
    });
    expect(explain(pair, 'KG')).toBe(
      'Top of the range, so up to the 10 kg pair. Aim for 12+ reps.',
    );
    const single = sug('TOP_OF_RANGE', 14, [8, 8, 8], { equipment: 'DUMBBELL', bigJump: true });
    expect(explain(single, 'KG')).toBe(
      "Top of the range, so up to the 14 kg dumbbell. It's a big jump, so 6+ reps is a win.",
    );
    const barbellBig = sug('TOP_OF_RANGE', 25, [8, 8, 8], { lastWeightKg: 20, bigJump: true });
    expect(explain(barbellBig, 'KG')).toBe(
      "You hit 12 on every set, so +5 kg today. It's a big jump, so 6+ reps is a win.",
    );
  });

  it('easy add-load names the delta off machines', () => {
    expect(explain(sug('EASY_ADD_LOAD', 62.5, [9, 9, 9], { lastWeightKg: 60 }), 'KG')).toBe(
      "Your last set had 3+ reps left, so we're adding 2.5 kg.",
    );
    expect(explain(sug('EASY_ADD_LOAD', 45, [10], { equipment: 'CABLE' }), 'KG')).toBe(
      "Your last set had 3+ reps left, so we're adding one plate.",
    );
  });

  it('add-reps at the top of the range', () => {
    expect(explain(sug('ADD_REPS', 60, [12, 12, 12]), 'KG')).toBe(
      'Same weight. Get 12 on every set to move up.',
    );
  });

  it('fallbacks when optional inputs are missing', () => {
    expect(explain(sug('CONSOLIDATE', 8, [20], { repMax: 20 }), 'KG')).toBe(
      'You maxed out at failure, so lock in 20s once more before the next jump.',
    );
    expect(explain(sug('STALL_RESET', 125, [13]), 'KG')).toBe(
      'No progress in 3 sessions, so resetting to 125 kg to build momentum.',
    );
    expect(explain(sug('BREAK_REENTRY', 70, [10], { lastWeightKg: 80 }), 'KG')).toBe(
      "Welcome back, 70 kg today (about 90% of your last 80). You'll be back up in a few sessions.",
    );
    expect(explain(sug('BREAK_FAST_TRACK', 75, [10]), 'KG')).toBe(
      'Strong session, so back up to 75 kg, where you were before the break.',
    );
    const bare: Suggestion = { ...sug('ADD_REPS', 60, [9, 10]), inputs: {} };
    expect(explain(bare, 'KG')).toBe('Same weight. Beat last time by one rep per set.');
    const oddType = sug('START', 60, [8], { loadType: 'SOMETHING' });
    expect(explain(oddType, 'KG')).toBe('Starting weight: 60 kg. Aim for 8+ reps.');
  });

  it('plural skipped sets, single-set deload, timed misses', () => {
    expect(explain(sug('INCOMPLETE', 60, [8], { plannedSets: 3, completedSets: 1 }), 'KG')).toBe(
      'You skipped 2 sets, so same targets next time.',
    );
    expect(explain(sug('INCOMPLETE', 60, [8], {}), 'KG')).toBe(
      'You skipped a set, so same targets next time.',
    );
    expect(explain(sug('DELOAD', 55, [8]), 'KG')).toBe(
      'Deload week: 55 kg for 1 set. Leave 3–4 reps in the tank.',
    );
    expect(explain(sug('MISSED_TWICE', 20, [30], { isTimed: true, repMin: 30 }), 'KG')).toBe(
      'Two sessions under 30 s, so dropping to 20 kg to build back up.',
    );
  });

  it('bodyweight set/belt copy', () => {
    const withBelt = sug('BW_ADD_SET', 0, [10, 10, 10, 10], {
      loadType: 'BODYWEIGHT_PLUS',
      hasDipBelt: true,
    });
    expect(explain(withBelt, 'KG')).toBe('Top of the range, so add a 4th set.');
    const pushUps = sug('BW_ADD_SET', 0, [20, 20], { loadType: 'BODYWEIGHT' });
    expect(explain(pushUps, 'KG')).toBe('Top of the range, so add a 2nd set.');
    const eleventh = sug(
      'BW_ADD_SET',
      0,
      Array.from({ length: 11 }, () => 10),
      {
        loadType: 'BODYWEIGHT',
      },
    );
    expect(explain(eleventh, 'KG')).toMatch(/11th set/);
    expect(explain(sug('BW_ADD_SET', 0, [9], { loadType: 'BODYWEIGHT' }), 'KG')).toMatch(/1st/);
    expect(explain(sug('BW_ADD_SET', 0, [9, 9, 9], { loadType: 'BODYWEIGHT' }), 'KG')).toMatch(
      /3rd/,
    );
  });

  it('assistance copy, including none left and the easy variant', () => {
    expect(explain(sug('ASSIST_DOWN', 0, [7], { loadType: 'ASSISTED' }), 'KG')).toBe(
      'Top of the range, so less help today: no assistance at all.',
    );
    expect(explain(sug('ASSIST_DOWN', 25, [7], { loadType: 'ASSISTED', easy: true }), 'KG')).toBe(
      'Your last set had 3+ reps left, so less help today: 25 kg of assistance.',
    );
  });
});

describe('explainInputs — the "Why?" sheet', () => {
  it('shows last time, RIR, rule and next', () => {
    const rows = explainInputs(
      sug('TOP_OF_RANGE', 62.5, [10, 10, 10], {
        lastWeightKg: 60,
        lastReps: [12, 12, 12],
        lastSetRir: 2,
        jumpPct: 0.04,
      }),
      'KG',
    );
    expect(rows).toEqual([
      { label: 'Last time', value: '60 kg × 12 / 12 / 12' },
      { label: 'Last-set RIR', value: '2' },
      { label: 'Rule', value: 'All sets at the top of 8–12' },
      { label: 'Next jump', value: '4 %' },
      { label: 'Next', value: '62.5 kg × 10 / 10 / 10' },
    ]);
  });

  it('handles no history, 3+, missing chip, breaks, stalls and timed work', () => {
    const start = explainInputs(sug('START', 20, [12], {}), 'KG');
    expect(start[0]).toEqual({ label: 'Last time', value: 'No history yet' });
    expect(start.map((r) => r.label)).not.toContain('Last-set RIR');

    const easy = explainInputs(
      sug('CALIBRATING_UP', 25, [8], { lastWeightKg: 20, lastSetRir: 3 }),
      'KG',
    );
    expect(easy[0]).toEqual({ label: 'Last time', value: '20 kg' });
    expect(easy[1]).toEqual({ label: 'Last-set RIR', value: '3+' });

    const none = explainInputs(
      sug('ADD_REPS', 60, [9], { lastWeightKg: 60, lastSetRir: null }),
      'KG',
    );
    expect(none[1]).toEqual({ label: 'Last-set RIR', value: 'Not given' });

    const brk = explainInputs(
      sug('BREAK_REENTRY', 70, [10], { lastWeightKg: 80, gapDays: 35, breakFromKg: 80 }),
      'KG',
    );
    expect(brk).toContainEqual({ label: 'Days since last session', value: '35' });
    expect(brk).toContainEqual({ label: 'Before the break', value: '80 kg' });

    const stall = explainInputs(sug('STALL_RESET', 125, [13], { stallCount: 3 }), 'KG');
    expect(stall).toContainEqual({ label: 'Sessions without progress', value: '3' });

    const timed = explainInputs(
      sug('ADD_REPS', 0, [45, 40], {
        isTimed: true,
        loadType: 'BODYWEIGHT',
        lastWeightKg: 0,
        lastReps: [40, 35],
      }),
      'KG',
    );
    expect(timed[0]).toEqual({ label: 'Last time', value: 'BW × 40 / 35 s' });
    expect(timed[timed.length - 1]).toEqual({ label: 'Next', value: 'BW × 45 / 40 s' });

    const noRange: Suggestion = { ...sug('ADD_REPS', 60, [9]), inputs: {} };
    expect(explainInputs(noRange, 'KG')).toContainEqual({
      label: 'Rule',
      value: 'All sets inside the range',
    });
  });

  it('has a rule line for every reason code', () => {
    for (const code of REASON_CODES) {
      const rule = explainInputs(sug(code, 60, [10]), 'KG').find((r) => r.label === 'Rule');
      expect(rule?.value.length, code).toBeGreaterThan(5);
    }
  });
});
