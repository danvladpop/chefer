// Templates (research §3) and routine volume/validation (research §2.2–2.3).
import { describe, expect, it } from 'vitest';
import {
  PROGRAM_TEMPLATES,
  type RoutineLike,
  type SessionSummaryDto,
  type VolumeGroup,
} from '@chefer/types';
import {
  defaultTargetRir,
  estimateDurationMin,
  instantiateTemplate,
  recommendTemplate,
} from './templates';
import { lookup } from './test-fixtures';
import {
  completedSetsByWeek,
  groupShare,
  landmarkFor,
  MUSCLE_LANDMARKS,
  validateRoutine,
  volumeByGroup,
} from './volume';

type Row = [direct: number, fractional: number, days?: number];

/** Research §3.1–3.4 weekly set tables ("direct / fractional (days)"). */
const RESEARCH: Record<string, Partial<Record<VolumeGroup, Row>>> = {
  'fb2-beginner': {
    chest: [6, 6, 2],
    back: [6, 6, 2],
    quads: [6, 6, 2],
    hamstrings: [4, 4, 2],
    glutes: [0, 4],
    'side-delts': [2, 2, 1],
    biceps: [2, 5, 1],
    triceps: [2, 5, 1],
    calves: [2, 2, 1],
  },
  'fb2-intermediate': {
    chest: [6, 6, 2],
    back: [6, 6, 2],
    quads: [6, 6, 2],
    hamstrings: [6, 6, 2],
    glutes: [0, 4.5],
    'side-delts': [3, 3, 1],
    biceps: [2, 5, 1],
    triceps: [2, 5, 1],
    calves: [3, 3, 1],
  },
  'fb3-beginner': {
    chest: [6, 6, 2],
    back: [8, 8, 3],
    quads: [8, 8, 3],
    hamstrings: [5, 5, 2],
    glutes: [0, 4.5],
    'side-delts': [2, 3, 1],
    biceps: [2, 6, 1],
    triceps: [2, 6, 1],
    calves: [2, 2, 1],
  },
  'fb3-intermediate': {
    chest: [10, 10, 3],
    back: [9, 9, 3],
    quads: [11, 11, 3],
    hamstrings: [8, 8, 3],
    glutes: [0, 6],
    'side-delts': [6, 6, 2],
    biceps: [2, 6.5, 1],
    triceps: [4, 9, 2],
    calves: [3, 3, 1],
  },
  'ul4-beginner': {
    chest: [8, 8, 2],
    back: [8, 8, 2],
    quads: [8, 8, 2],
    hamstrings: [7, 8, 2],
    glutes: [2, 6.5, 1],
    'side-delts': [4, 4, 2],
    biceps: [2, 6, 1],
    triceps: [2, 6, 1],
    calves: [4, 4, 2],
    abs: [2, 2, 1],
  },
  'ul4-intermediate': {
    chest: [10, 10, 2],
    back: [12, 12, 2],
    quads: [12, 12, 2],
    hamstrings: [9, 10.5, 2],
    glutes: [5, 10.5, 1],
    'side-delts': [6, 6, 2],
    biceps: [4, 10, 2],
    triceps: [4, 8, 2],
    calves: [6, 6, 2],
    abs: [4, 4, 2],
  },
  'ppl6-beginner': {
    chest: [8, 8, 2],
    back: [11, 11, 2],
    quads: [8, 8, 2],
    hamstrings: [7, 8, 2],
    glutes: [2, 6.5, 1],
    'side-delts': [4, 5, 2],
    'rear-delts': [4, 7, 2],
    biceps: [4, 9.5, 2],
    triceps: [4, 9, 2],
    calves: [4, 4, 2],
  },
  'ppl6-intermediate': {
    chest: [13, 13, 2],
    back: [14, 14, 2],
    quads: [10, 10, 2],
    hamstrings: [9, 10.5, 2],
    glutes: [5, 9.5, 1],
    'side-delts': [8, 9, 2],
    'rear-delts': [4, 8, 2],
    biceps: [7, 14, 2],
    triceps: [6, 12.5, 2],
    calves: [6, 6, 2],
  },
};

/**
 * Where our catalog's muscle mapping differs from the research's counting
 * (documented in the G1-A handoff). Each entry is ours − research.
 * - lying-leg-curl lists calves as secondary (+0.5 calf per set);
 * - face-pull / reverse-pec-deck list upper-back as secondary (+0.5 back per set);
 * - the research counts Bulgarian split squats as direct glute work; our catalog
 *   has glutes as secondary (−1 direct, −0.5 fractional per set).
 */
const CATALOG_DELTAS: Record<string, Partial<Record<VolumeGroup, [number, number]>>> = {
  'fb3-intermediate': { calves: [0, 1] },
  'ul4-intermediate': { calves: [0, 1.5], glutes: [-2, -1] },
  'ppl6-beginner': { back: [0, 2] },
  'ppl6-intermediate': { calves: [0, 1.5], back: [0, 2], glutes: [-2, -1] },
};

describe('program templates match research §3 weekly set tables', () => {
  it.each(PROGRAM_TEMPLATES.map((t) => [t.key]))('%s', (key) => {
    const t = PROGRAM_TEMPLATES.find((x) => x.key === key);
    if (!t) {
      throw new Error(key);
    }
    const routine = instantiateTemplate(key, 'FULL_GYM', lookup);
    const volume = new Map(volumeByGroup(routine, lookup, t.experience).map((v) => [v.group, v]));
    for (const [group, [direct, fractional, days]] of Object.entries(RESEARCH[key] ?? {})) {
      const [dd, df] = CATALOG_DELTAS[key]?.[group as VolumeGroup] ?? [0, 0];
      const v = volume.get(group);
      expect(v?.direct, `${key} ${group} direct`).toBe(direct + dd);
      expect(v?.fractional, `${key} ${group} fractional`).toBe(fractional + df);
      if (days !== undefined) {
        expect(v?.days, `${key} ${group} days`).toBe(days);
      }
    }
  });

  it('every template (and its equipment variants) validates without warnings', () => {
    for (const t of PROGRAM_TEMPLATES) {
      for (const access of ['FULL_GYM', 'DUMBBELLS', 'BODYWEIGHT'] as const) {
        const routine = instantiateTemplate(t.key, access, lookup);
        const hints = validateRoutine(routine, lookup, t.experience, {
          suppressLowVolume: t.suppressLowVolumeHints ?? false,
        });
        expect(
          hints.filter((h) => h.level === 'warning'),
          `${t.key} ${access}`,
        ).toEqual([]);
      }
    }
  });

  it('full-gym templates only raise the info hints the research anticipates', () => {
    const rules = (key: string) => {
      const t = PROGRAM_TEMPLATES.find((x) => x.key === key);
      const routine = instantiateTemplate(key, 'FULL_GYM', lookup);
      return validateRoutine(routine, lookup, t?.experience ?? 'BEGINNER', {
        suppressLowVolume: t?.suppressLowVolumeHints ?? false,
      }).map((h) => `${h.rule}:${h.group ?? h.exerciseId ?? ''}`);
    };
    // Minimum-dose templates keep side delts below maintenance; V1 is suppressed there.
    expect(rules('fb2-beginner')).toEqual(['V2:side-delts']);
    expect(rules('fb3-intermediate')).toEqual(['V1:back']);
    // Cable fly 12–15 is narrower than the 4-rep room suggested for cable isolation.
    expect(rules('ul4-intermediate')).toEqual(['V7:cable-fly']);
    expect(rules('ul4-beginner')).toEqual([]);
  });
});

describe('recommendTemplate (research §3.5)', () => {
  const rec = (
    days: number,
    experience: 'BEGINNER' | 'INTERMEDIATE',
    access = 'FULL_GYM' as const,
  ) => recommendTemplate({ days, experience, equipmentAccess: access });

  it.each([
    [2, 'BEGINNER', 'fb2-beginner'],
    [2, 'INTERMEDIATE', 'fb2-intermediate'],
    [3, 'BEGINNER', 'fb3-beginner'],
    [3, 'INTERMEDIATE', 'fb3-intermediate'],
    [4, 'BEGINNER', 'ul4-beginner'],
    [4, 'INTERMEDIATE', 'ul4-intermediate'],
    [5, 'BEGINNER', 'ul4-beginner'],
    [5, 'INTERMEDIATE', 'ul4-intermediate'],
    [6, 'BEGINNER', 'ul4-beginner'],
    [6, 'INTERMEDIATE', 'ppl6-intermediate'],
  ] as const)('%d days, %s → %s', (days, exp, key) => {
    const r = rec(days, exp);
    expect(r.key).toBe(key);
    expect(r.reason.length).toBeGreaterThan(20);
    expect(r.alternatives).not.toContain(key);
    expect(r.alternatives).toHaveLength(3);
  });

  it('6 days as a beginner explains the Upper/Lower recommendation and keeps PPL close', () => {
    const r = rec(6, 'BEGINNER');
    expect(r.reason).toMatch(/6 days is a big jump/);
    expect(r.reason).toMatch(/Push\/Pull\/Legs 6× is still there/);
    expect(r.alternatives[0]).toBe('ppl6-beginner');
  });

  it('5 days mentions the optional extra day', () => {
    expect(rec(5, 'BEGINNER').reason).toMatch(/5th day/);
    expect(rec(5, 'INTERMEDIATE').reason).toMatch(/5th/);
  });

  it('mentions equipment adaptation', () => {
    expect(
      recommendTemplate({ days: 3, experience: 'BEGINNER', equipmentAccess: 'DUMBBELLS' }).reason,
    ).toMatch(/dumbbell versions/);
    expect(
      recommendTemplate({ days: 3, experience: 'BEGINNER', equipmentAccess: 'BODYWEIGHT' }).reason,
    ).toMatch(/bodyweight/);
  });

  it('offers Upper/Lower 3× (2 upper + 1 lower) as an alternative for 3 days, without changing the default', () => {
    const beginner = rec(3, 'BEGINNER');
    expect(beginner.key).toBe('fb3-beginner');
    expect(beginner.alternatives).toContain('ul3-beginner');
    const intermediate = rec(3, 'INTERMEDIATE');
    expect(intermediate.key).toBe('fb3-intermediate');
    expect(intermediate.alternatives).toContain('ul3-intermediate');
  });
});

describe('ul3 templates (dogfood feedback #1: 2 upper + 1 lower for 3 days)', () => {
  it('instantiates for FULL_GYM, DUMBBELLS and BODYWEIGHT with Upper A / Lower / Upper B on distinct weekdays', () => {
    for (const key of ['ul3-beginner', 'ul3-intermediate'] as const) {
      for (const access of ['FULL_GYM', 'DUMBBELLS', 'BODYWEIGHT'] as const) {
        const r = instantiateTemplate(key, access, lookup);
        expect(
          r.days.map((d) => d.name),
          `${key} ${access}`,
        ).toEqual(['Upper A', 'Lower', 'Upper B']);
        expect(
          r.days.every((d) => d.exercises.length > 0),
          `${key} ${access}`,
        ).toBe(true);
      }
    }
  });

  it('raises no warning-level validateRoutine hints (info hints about 1×/week legs are expected)', () => {
    for (const key of ['ul3-beginner', 'ul3-intermediate'] as const) {
      const t = PROGRAM_TEMPLATES.find((x) => x.key === key);
      if (!t) {
        throw new Error(key);
      }
      for (const access of ['FULL_GYM', 'DUMBBELLS', 'BODYWEIGHT'] as const) {
        const routine = instantiateTemplate(key, access, lookup);
        const hints = validateRoutine(routine, lookup, t.experience, {});
        expect(
          hints.filter((h) => h.level === 'warning'),
          `${key} ${access}`,
        ).toEqual([]);
      }
    }
  });

  it('sessions land near the design budget (beginner 12–13, intermediate 16–18)', () => {
    const setsOf = (key: string) =>
      instantiateTemplate(key, 'FULL_GYM', lookup).days.map((d) =>
        d.exercises.reduce((s, e) => s + e.sets, 0),
      );
    for (const sets of setsOf('ul3-beginner')) {
      expect(sets).toBeGreaterThanOrEqual(12);
      expect(sets).toBeLessThanOrEqual(13);
    }
    for (const sets of setsOf('ul3-intermediate')) {
      expect(sets).toBeGreaterThanOrEqual(16);
      expect(sets).toBeLessThanOrEqual(18);
    }
  });
});

describe('instantiateTemplate', () => {
  it('copies days, weekday plan and weekly goal; RIR 2 compound / 1 isolation; rest from the catalog', () => {
    const r = instantiateTemplate('ul4-beginner', 'FULL_GYM', lookup);
    expect(r).toMatchObject({
      name: 'Upper / Lower 4×',
      templateKey: 'ul4-beginner',
      weeklyGoal: 4,
    });
    expect(r.days.map((d) => [d.name, d.plannedWeekday])).toEqual([
      ['Upper A', 0],
      ['Lower A', 1],
      ['Upper B', 3],
      ['Lower B', 4],
    ]);
    const first = r.days[0]?.exercises[0];
    expect(first).toEqual({
      exerciseId: 'dumbbell-bench-press',
      sets: 3,
      repMin: 8,
      repMax: 12,
      targetRir: 2,
      restSec: 120,
      supersetGroup: null,
      notes: null,
    });
    expect(r.days[0]?.exercises.find((e) => e.exerciseId === 'triceps-pushdown')?.targetRir).toBe(
      1,
    );
  });

  it('swaps to dumbbell versions and widens DB ranges', () => {
    const r = instantiateTemplate('fb3-intermediate', 'DUMBBELLS', lookup);
    const dayA = r.days[0]?.exercises ?? [];
    expect(dayA.map((e) => e.exerciseId)).toEqual([
      'goblet-squat',
      'dumbbell-bench-press',
      'single-arm-dumbbell-row',
      'romanian-deadlift',
      'dumbbell-lateral-raise',
      'dumbbell-curl',
    ]);
    expect(dayA.find((e) => e.exerciseId === 'goblet-squat')).toMatchObject({
      repMin: 8,
      repMax: 15,
    });
    expect(dayA.find((e) => e.exerciseId === 'dumbbell-lateral-raise')).toMatchObject({
      repMin: 12,
      repMax: 20,
    });
    // RDL stays a barbell lift with its slot range.
    expect(dayA.find((e) => e.exerciseId === 'romanian-deadlift')).toMatchObject({
      repMin: 10,
      repMax: 15,
    });
  });

  it('bodyweight variants use the exercise range and merge collapsed slots (≤ 5 sets)', () => {
    const r = instantiateTemplate('ppl6-intermediate', 'BODYWEIGHT', lookup);
    const pushA = r.days[0]?.exercises ?? [];
    const pushUps = pushA.filter((e) => e.exerciseId === 'push-up');
    expect(pushUps).toHaveLength(1);
    expect(pushUps[0]).toMatchObject({ sets: 5, repMin: 8, repMax: 20 });
  });

  it('falls back to defaults for exercises the lookup does not know', () => {
    const r = instantiateTemplate('fb2-beginner', 'FULL_GYM', () => undefined);
    expect(r.days[0]?.exercises[0]).toMatchObject({
      targetRir: 2,
      restSec: 120,
      repMin: 8,
      repMax: 12,
    });
    expect(defaultTargetRir(undefined)).toBe(2);
  });

  it('rejects unknown template keys', () => {
    expect(() => instantiateTemplate('nope', 'FULL_GYM', lookup)).toThrow(
      /Unknown program template/,
    );
  });

  it('estimates session length: Σ sets × (40 s + rest) + warm-up allowance', () => {
    const day = {
      name: 'A',
      exercises: [
        { exerciseId: 'barbell-bench-press', sets: 3, repMin: 6, repMax: 8, restSec: 180 },
      ],
    };
    expect(estimateDurationMin(day, lookup)).toBe(18);
    expect(estimateDurationMin({ name: 'Empty', exercises: [] }, lookup)).toBe(0);
  });
});

function routine(days: [string, [string, number, number, number, number?][]][]): RoutineLike {
  return {
    days: days.map(([name, exercises]) => ({
      name,
      exercises: exercises.map(([exerciseId, sets, repMin, repMax, restSec]) => ({
        exerciseId,
        sets,
        repMin,
        repMax,
        restSec: restSec ?? 120,
      })),
    })),
  };
}

describe('volume', () => {
  it('counts primary muscles 1, secondary 0.5, grouped', () => {
    const bench = lookup('barbell-bench-press');
    const row = lookup('barbell-row');
    if (!bench || !row) {
      throw new Error('catalog');
    }
    expect(groupShare(bench, 'chest')).toBe(1);
    expect(groupShare(bench, 'triceps')).toBe(0.5);
    expect(groupShare(bench, 'back')).toBe(0);
    expect(groupShare(row, 'back')).toBe(1); // upper-back + lats count once
  });

  it('beginner floors sit 2 lower (never below 0)', () => {
    expect(landmarkFor('chest', 'BEGINNER').floor).toBe(6);
    expect(landmarkFor('chest', 'INTERMEDIATE').floor).toBe(MUSCLE_LANDMARKS.chest.floor);
    expect(landmarkFor('abs', 'BEGINNER').floor).toBe(0);
  });

  it('ignores exercises the lookup does not know', () => {
    const v = volumeByGroup(routine([['A', [['mystery', 3, 8, 12]]]]), lookup, 'BEGINNER');
    expect(v.every((x) => x.fractional === 0)).toBe(true);
  });
});

describe('validateRoutine rules V1–V11 (research §2.3)', () => {
  const rulesOf = (
    r: RoutineLike,
    exp: 'BEGINNER' | 'INTERMEDIATE' = 'INTERMEDIATE',
    suppress = false,
  ) => validateRoutine(r, lookup, exp, { suppressLowVolume: suppress });

  const balanced: [string, number, number, number, number?][] = [
    ['back-squat', 3, 6, 8, 180],
    ['romanian-deadlift', 3, 6, 10],
    ['barbell-bench-press', 4, 6, 8, 180],
    ['barbell-row', 4, 6, 10],
    ['dumbbell-lateral-raise', 4, 12, 20],
  ];

  it('V1 low volume (info) — suppressed on minimum-dose templates; beginners have lower floors', () => {
    const r = routine([['Mon', [['barbell-bench-press', 4, 6, 10]]]]);
    const v1 = rulesOf(r).find((h) => h.rule === 'V1' && h.group === 'chest');
    expect(v1).toMatchObject({
      level: 'info',
      message: 'Chest: 4 sets/week. Most people need about 8–10 to keep growing.',
    });
    expect(rulesOf(r, 'INTERMEDIATE', true).some((h) => h.rule === 'V1')).toBe(false);
    const six = routine([
      ['Mon', [['barbell-bench-press', 3, 6, 10]]],
      ['Thu', [['barbell-bench-press', 3, 6, 10]]],
    ]);
    expect(rulesOf(six, 'BEGINNER').some((h) => h.rule === 'V1' && h.group === 'chest')).toBe(
      false,
    );
    expect(rulesOf(six, 'INTERMEDIATE').some((h) => h.rule === 'V1' && h.group === 'chest')).toBe(
      true,
    );
  });

  it('V2 very low volume', () => {
    const hints = rulesOf(
      routine([
        [
          'Mon',
          [
            ['barbell-bench-press', 3, 6, 10],
            ['lat-pulldown', 3, 8, 12],
          ],
        ],
      ]),
    );
    expect(hints.find((h) => h.rule === 'V2' && h.group === 'hamstrings')?.message).toBe(
      'Hamstrings get no direct work. Add a curl or RDL?',
    );
    expect(hints.find((h) => h.rule === 'V2' && h.group === 'back')?.message).toBe(
      'Back: 3 sets/week, below the ~6 that maintains muscle.',
    );
  });

  it('V3 high volume (warning), front delts judged on direct sets', () => {
    const r = routine([
      [
        'Mon',
        [
          ['dumbbell-lateral-raise', 5, 12, 20],
          ['cable-lateral-raise', 5, 12, 20],
          ['overhead-press', 5, 6, 10],
        ],
      ],
      [
        'Wed',
        [
          ['dumbbell-lateral-raise', 5, 12, 20],
          ['cable-lateral-raise', 5, 12, 20],
          ['overhead-press', 5, 6, 10],
        ],
      ],
      [
        'Fri',
        [
          ['dumbbell-lateral-raise', 3, 12, 20],
          ['overhead-press', 4, 6, 10],
        ],
      ],
    ]);
    const v3 = rulesOf(r).filter((h) => h.rule === 'V3');
    expect(v3.map((h) => h.group)).toEqual(['side-delts', 'front-delts']);
    expect(v3[0]).toMatchObject({
      level: 'warning',
      message:
        "Side delts: 30 sets/week. That's more than most people recover from, so consider trimming.",
    });
  });

  it('V4 session crowding, V5 low frequency', () => {
    const r = routine([
      [
        'Legs',
        [
          ['back-squat', 5, 5, 8, 180],
          ['leg-press', 5, 10, 15],
          ['leg-extension', 4, 10, 15],
        ],
      ],
      [
        'Upper',
        [
          ['barbell-bench-press', 4, 6, 10],
          ['incline-dumbbell-press', 4, 8, 12],
          ['barbell-row', 4, 6, 10],
        ],
      ],
    ]);
    const hints = rulesOf(r);
    expect(hints.find((h) => h.rule === 'V4')).toMatchObject({
      dayIndex: 0,
      message:
        'Legs has 14 quad sets. Extra sets past about 11 add little; move some to another day.',
    });
    expect(hints.find((h) => h.rule === 'V5' && h.group === 'chest')?.message).toBe(
      'All your chest work is on Upper. Splitting it over 2 days tends to work better.',
    );
  });

  it('V6 session length (warning) by sets or minutes', () => {
    const many = routine([
      [
        'Marathon',
        Array.from(
          { length: 6 },
          () => ['dumbbell-curl', 5, 10, 15, 60] as [string, number, number, number, number],
        ),
      ],
    ]);
    expect(rulesOf(many).find((h) => h.rule === 'V6')).toMatchObject({
      level: 'warning',
      message: 'Marathon has 30 working sets. Long sessions get skipped; consider splitting it.',
    });
    const long = routine([
      [
        'Slow',
        Array.from(
          { length: 5 },
          () => ['back-squat', 5, 5, 8, 300] as [string, number, number, number, number],
        ),
      ],
    ]);
    expect(rulesOf(long).find((h) => h.rule === 'V6')?.message).toMatch(/^Slow is about \d+ min\./);
  });

  it('V7 narrow ranges, V8 odd ranges, V10 short rest, V11 too many sets', () => {
    const r = routine([
      [
        'Mon',
        [
          ['barbell-bench-press', 6, 8, 9, 45],
          ['dumbbell-curl', 3, 12, 15],
          ['cable-crunch', 3, 20, 40],
          ['dumbbell-lateral-raise', 3, 3, 8],
          ['plank', 3, 30, 60],
        ],
      ],
    ]);
    const hints = rulesOf(r).map((h) => `${h.rule}:${h.exerciseId ?? ''}`);
    expect(hints).toEqual(
      expect.arrayContaining([
        'V7:barbell-bench-press',
        'V7:dumbbell-curl',
        'V8:cable-crunch',
        'V8:dumbbell-lateral-raise',
        'V10:barbell-bench-press',
        'V11:barbell-bench-press',
      ]),
    );
    expect(hints.filter((h) => h.endsWith(':plank'))).toEqual([]);
    const v7 = rulesOf(r).find((h) => h.rule === 'V7' && h.exerciseId === 'barbell-bench-press');
    expect(v7?.message).toBe(
      '8–9 is a narrow range. Double progression works best with room, e.g. 8–12.',
    );
  });

  it('V9 push/pull balance', () => {
    const r = routine([
      [
        'Mon',
        [
          ['barbell-bench-press', 4, 6, 10],
          ['overhead-press', 4, 6, 10],
          ['barbell-row', 3, 6, 10],
        ],
      ],
    ]);
    expect(rulesOf(r).find((h) => h.rule === 'V9')?.message).toBe(
      'You press more than you pull. Adding rows helps shoulder balance.',
    );
    expect(rulesOf(routine([['Mon', balanced]])).some((h) => h.rule === 'V9')).toBe(false);
  });
});

describe('completedSetsByWeek', () => {
  const s = (
    id: string,
    localDate: string,
    status: SessionSummaryDto['status'],
    exercises: SessionSummaryDto['exercises'],
  ): SessionSummaryDto => ({
    id,
    name: 'x',
    routineDayId: null,
    status,
    localDate,
    startedAt: `${localDate}T10:00:00.000Z`,
    finishedAt: null,
    isDeload: false,
    exercises,
  });
  const set = (completed: boolean, isWarmup = false) => ({
    weightKg: 60,
    reps: 8,
    isWarmup,
    completed,
  });

  it('counts completed working sets of completed sessions, fractionally, per Monday week', () => {
    const weeks = completedSetsByWeek(
      [
        s('b', '2026-09-08', 'COMPLETED', [
          {
            exerciseId: 'barbell-bench-press',
            skipped: false,
            lastSetRir: null,
            sets: [set(true)],
          },
        ]),
        s('a', '2026-09-06', 'COMPLETED', [
          {
            exerciseId: 'barbell-bench-press',
            skipped: false,
            lastSetRir: null,
            sets: [set(true, true), set(true), set(true), set(false)],
          },
          { exerciseId: 'barbell-row', skipped: true, lastSetRir: null, sets: [set(true)] },
          { exerciseId: 'mystery', skipped: false, lastSetRir: null, sets: [set(true)] },
        ]),
        s('c', '2026-09-07', 'DISCARDED', [
          {
            exerciseId: 'barbell-bench-press',
            skipped: false,
            lastSetRir: null,
            sets: [set(true)],
          },
        ]),
      ],
      lookup,
    );
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-31', '2026-09-07']);
    expect(weeks[0]?.sets).toMatchObject({ chest: 2, triceps: 1, 'front-delts': 1, back: 0 });
    expect(weeks[1]?.sets).toMatchObject({ chest: 1 });
  });
});
