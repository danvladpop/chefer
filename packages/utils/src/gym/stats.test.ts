// warm-ups (§1.9), e1RM (§1.10) and PRs (§4.2 #8).
import { describe, expect, it } from 'vitest';
import type { Rir, SessionSummaryDto } from '@chefer/types';
import { bestE1rm, e1rmConfidence, epley } from './e1rm';
import { collectPrs, detectPrs } from './prs';
import { KG_PROFILE, slotFor } from './test-fixtures';
import { warmupSets } from './warmups';

const P = KG_PROFILE;

function warm(id: string, lo: number, hi: number, kg: number, first = true) {
  return warmupSets({
    slot: slotFor(id, 3, lo, hi),
    workingKg: kg,
    isFirstForPattern: first,
    profile: P,
  });
}

describe('warmupSets (research §1.9)', () => {
  it('bench at 80 kg → 20×10, 40×8, 55×5, 67.5×2 (research example)', () => {
    expect(warm('barbell-bench-press', 8, 12, 80)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 8 },
      { weightKg: 55, reps: 5 },
      { weightKg: 67.5, reps: 2 },
    ]);
  });

  it('bench at 60 kg drops the heavy single', () => {
    expect(warm('barbell-bench-press', 8, 12, 60)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 30, reps: 8 },
      { weightKg: 42.5, reps: 5 },
    ]);
  });

  it('light barbell work: no empty-bar set, duplicates within a step are dropped', () => {
    expect(warm('barbell-bench-press', 8, 12, 30)).toEqual([{ weightKg: 20, reps: 8 }]);
    expect(warm('barbell-bench-press', 8, 12, 22.5)).toEqual([]);
  });

  it('low-rep lifts get the 85 % single even below 80 kg', () => {
    expect(warm('deadlift', 4, 6, 60)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 30, reps: 8 },
      { weightKg: 42.5, reps: 5 },
      { weightKg: 50, reps: 2 },
    ]);
  });

  it('dumbbells and machines ramp on their own lists', () => {
    expect(warm('dumbbell-bench-press', 8, 12, 20)).toEqual([
      { weightKg: 10, reps: 8 },
      { weightKg: 14, reps: 5 },
    ]);
    expect(warm('leg-press', 10, 15, 100)).toEqual([
      { weightKg: 50, reps: 8 },
      { weightKg: 70, reps: 5 },
      { weightKg: 85, reps: 2 },
    ]);
  });

  it('later exercises for the same pattern get one 60 % feeler at ≥ 40 kg', () => {
    expect(warm('barbell-bench-press', 8, 12, 80, false)).toEqual([{ weightKg: 47.5, reps: 6 }]);
    expect(warm('barbell-bench-press', 8, 12, 30, false)).toEqual([]);
  });

  it('no warm-ups for cables, bodyweight, assisted, timed work or zero load', () => {
    expect(warm('lat-pulldown', 8, 12, 60)).toEqual([]);
    expect(warm('pull-up', 5, 10, 10)).toEqual([]);
    expect(warm('assisted-pull-up', 6, 10, 30)).toEqual([]);
    expect(warm('farmers-carry', 30, 45, 30)).toEqual([]);
    expect(warm('barbell-bench-press', 8, 12, 0)).toEqual([]);
  });
});

describe('e1RM (research §1.10)', () => {
  it('Epley, RIR-adjusted, 1 rep = the weight', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 5)).toBe(116.67);
    expect(epley(100, 5, 2)).toBe(123.33);
    expect(epley(100, 12, 3)).toBe(150);
    expect(epley(100, 5, 7)).toBe(126.67);
    expect(epley(100, 13)).toBeNull();
    expect(epley(100, 0)).toBeNull();
  });

  it('confidence bands', () => {
    expect(e1rmConfidence(10)).toBe('ok');
    expect(e1rmConfidence(11)).toBe('low');
    expect(e1rmConfidence(12)).toBe('low');
    expect(e1rmConfidence(13)).toBe('excluded');
    expect(e1rmConfidence(0)).toBe('excluded');
  });

  it('best working-set e1RM of an exposure', () => {
    const set = (weightKg: number, reps: number, isWarmup = false, completed = true) => ({
      weightKg,
      reps,
      isWarmup,
      completed,
    });
    expect(bestE1rm([], null)).toBeNull();
    expect(
      bestE1rm(
        [set(150, 1, true), set(100, 5), set(100, 4), set(200, 3, false, false), set(0, 20)],
        null,
      ),
    ).toEqual({ e1rmKg: 116.67, weightKg: 100, reps: 5, lowConfidence: false });
    // RIR only applies to the LAST working set.
    expect(bestE1rm([set(100, 5), set(100, 4)], 3)).toEqual({
      e1rmKg: 123.33,
      weightKg: 100,
      reps: 4,
      lowConfidence: false,
    });
    expect(bestE1rm([set(60, 12), set(60, 14)], null)).toEqual({
      e1rmKg: 84,
      weightKg: 60,
      reps: 12,
      lowConfidence: true,
    });
  });
});

let n = 0;
function session(
  localDate: string,
  exercises: {
    id?: string;
    sets: [number, number][];
    rir?: Rir | null;
    skipped?: boolean;
    warmup?: [number, number];
  }[],
  status: SessionSummaryDto['status'] = 'COMPLETED',
): SessionSummaryDto {
  n += 1;
  return {
    id: `s${n}`,
    name: 'Upper A',
    routineDayId: null,
    status,
    localDate,
    startedAt: `${localDate}T18:00:00.000Z`,
    finishedAt: `${localDate}T19:00:00.000Z`,
    isDeload: false,
    exercises: exercises.map((e) => ({
      exerciseId: e.id ?? 'barbell-bench-press',
      skipped: e.skipped ?? false,
      lastSetRir: e.rir ?? null,
      sets: [
        ...(e.warmup
          ? [{ weightKg: e.warmup[0], reps: e.warmup[1], isWarmup: true, completed: true }]
          : []),
        ...e.sets.map(([weightKg, reps]) => ({ weightKg, reps, isWarmup: false, completed: true })),
      ],
    })),
  };
}

describe('PRs (research §4.2 #8)', () => {
  const s1 = session('2026-09-01', [
    {
      sets: [
        [80, 8],
        [80, 8],
        [80, 8],
      ],
      warmup: [140, 1],
    },
    { id: 'lat-pulldown', sets: [[50, 10]] },
  ]);
  const history = [
    s1,
    session('2026-09-03', [{ sets: [[200, 5]], skipped: true }]),
    session('2026-09-04', [{ sets: [[300, 1]] }], 'DISCARDED'),
  ];
  const detect = (weightKg: number, reps: number, rir: number | null = null) =>
    detectPrs({ exerciseId: 'barbell-bench-press', history, candidate: { weightKg, reps, rir } });

  it('never awards PRs without history', () => {
    expect(
      detectPrs({
        exerciseId: 'barbell-bench-press',
        history: [],
        candidate: { weightKg: 100, reps: 5 },
      }),
    ).toEqual([]);
  });

  it('detects weight, rep-at-weight and e1RM PRs, ranked e1rm > weight > reps', () => {
    expect(detect(82.5, 6)).toEqual(['weight']);
    expect(detect(80, 9)).toEqual(['e1rm', 'reps']);
    expect(detect(70, 12)).toEqual(['reps']); // 12 reps: e1RM is low-confidence
    expect(detect(80, 8, 2)).toEqual(['e1rm']);
    expect(detect(80, 8)).toEqual([]);
    expect(detect(80, 0)).toEqual([]);
  });

  it('ignores warm-ups, skipped exercises, discarded sessions and other exercises', () => {
    expect(detect(100, 1)).toEqual(['weight']);
  });

  it('collects one record per exercise per session, in date order', () => {
    const sessions = [
      session('2026-09-10', [
        {
          sets: [
            [75, 10],
            [80, 9],
          ],
          rir: 1,
        },
      ]),
      s1,
      session('2026-09-05', [{ sets: [[82.5, 6]] }, { id: 'lat-pulldown', sets: [[55, 10]] }]),
      session('2026-09-12', [{ sets: [[300, 1]] }], 'DISCARDED'),
    ];
    const prs = collectPrs(sessions);
    expect(prs.map((p) => [p.localDate, p.exerciseId, p.kind, p.weightKg, p.reps])).toEqual([
      ['2026-09-05', 'barbell-bench-press', 'weight', 82.5, 6],
      ['2026-09-05', 'lat-pulldown', 'e1rm', 55, 10],
      ['2026-09-10', 'barbell-bench-press', 'e1rm', 80, 9],
    ]);
    expect(prs[2]?.e1rmKg).toBe(106.67);
    expect(collectPrs(sessions, 'lat-pulldown')).toHaveLength(1);
  });

  it('bodyweight PRs carry no e1RM', () => {
    const prs = collectPrs([
      session('2026-09-01', [{ id: 'pull-up', sets: [[0, 8]] }]),
      session('2026-09-03', [{ id: 'pull-up', sets: [[0, 10]] }]),
    ]);
    expect(prs).toEqual([expect.objectContaining({ kind: 'reps', reps: 10, e1rmKg: null })]);
  });
});
