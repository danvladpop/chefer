import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, EXERCISE_CATALOG } from './exercise-catalog';
import { EXERCISE_CONTENT } from './exercise-content';
import { workoutSessionDocSchema, type WorkoutSessionDoc } from './schemas';
import { EQUIPMENT_ACCESS_SETS, EQUIPMENT_SWAPS, PROGRAM_TEMPLATES } from './templates';
import { MUSCLES } from './vocab';

describe('exercise catalog invariants', () => {
  it('has unique kebab-case slugs', () => {
    const ids = EXERCISE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('uses only the known muscle vocabulary', () => {
    for (const e of EXERCISE_CATALOG) {
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
        expect(MUSCLES, `${e.id}: ${m}`).toContain(m);
      }
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0);
    }
  });

  it('has sane numeric defaults', () => {
    for (const e of EXERCISE_CATALOG) {
      expect(e.repMin, e.id).toBeLessThanOrEqual(e.repMax);
      expect(e.restSec, e.id).toBeGreaterThanOrEqual(30);
      expect(e.incrementKg, e.id).toBeGreaterThan(0);
    }
  });

  it('keeps coaching copy short (≤ 12 words per cue / mistake)', () => {
    for (const e of EXERCISE_CATALOG) {
      for (const line of [...e.cues, ...e.mistakes]) {
        expect(line.split(/\s+/).length, `${e.id}: "${line}"`).toBeLessThanOrEqual(12);
      }
    }
  });

  it('has coaching content (cues, mistakes) for every catalog slug (G0-4)', () => {
    for (const e of EXERCISE_CATALOG) {
      const content = EXERCISE_CONTENT[e.id];
      expect(content, `${e.id}: missing from EXERCISE_CONTENT`).toBeDefined();
      expect(content?.cues.length, `${e.id}: cues`).toBeGreaterThanOrEqual(3);
      expect(content?.mistakes.length, `${e.id}: mistakes`).toBe(2);
      expect(content?.blurb, `${e.id}: blurb`).toBeTruthy();
    }
  });
});

describe('program templates', () => {
  it('reference only catalog exercises', () => {
    for (const t of PROGRAM_TEMPLATES) {
      for (const d of t.days) {
        for (const x of d.exercises)
          expect(EXERCISE_BY_ID.has(x.exerciseId), `${t.key}: ${x.exerciseId}`).toBe(true);
      }
    }
  });

  it('have one day per planned training day on distinct weekdays', () => {
    for (const t of PROGRAM_TEMPLATES) {
      expect(t.days.length, t.key).toBe(t.daysPerWeek);
      const wds = t.days.map((d) => d.plannedWeekday);
      expect(new Set(wds).size, t.key).toBe(wds.length);
    }
  });

  it('equipment swaps point at catalog exercises', () => {
    for (const map of Object.values(EQUIPMENT_SWAPS)) {
      for (const [from, to] of Object.entries(map)) {
        expect(EXERCISE_BY_ID.has(from), from).toBe(true);
        expect(EXERCISE_BY_ID.has(to), to).toBe(true);
      }
    }
  });
});

describe('home variants (audit F-GYM-2-1)', () => {
  const HOME_VARIANTS = [
    'dumbbell-romanian-deadlift',
    'dumbbell-hip-thrust',
    'dumbbell-overhead-triceps-extension',
    'dumbbell-skull-crusher',
    'dumbbell-reverse-fly',
    'dumbbell-fly',
    'incline-dumbbell-row',
    'dumbbell-calf-raise',
    'bodyweight-squat',
    'reverse-lunge',
    'bodyweight-bulgarian-split-squat',
    'single-leg-romanian-deadlift',
    'slider-leg-curl',
    'nordic-curl',
    'glute-bridge',
    'single-leg-glute-bridge',
    'single-leg-calf-raise',
    'inverted-row',
    'incline-push-up',
    'decline-push-up',
    'diamond-push-up',
    'pike-push-up',
  ];

  it('are all in the catalog with full coaching content', () => {
    expect(EXERCISE_CATALOG).toHaveLength(77);
    for (const id of HOME_VARIANTS) {
      const e = EXERCISE_BY_ID.get(id);
      expect(e, id).toBeDefined();
      expect(e?.cues.length, `${id}: cues`).toBeGreaterThanOrEqual(3);
      expect(e?.mistakes, `${id}: mistakes`).toHaveLength(2);
      expect(e?.blurb, `${id}: blurb`).toBeTruthy();
      expect(e?.swapGroup, `${id}: swapGroup`).toBeTruthy();
    }
  });

  it('share a swap group with the gym lift they stand in for', () => {
    const groups = new Set(
      EXERCISE_CATALOG.filter((e) => !HOME_VARIANTS.includes(e.id)).map((e) => e.swapGroup),
    );
    for (const id of HOME_VARIANTS) {
      expect(groups.has(EXERCISE_BY_ID.get(id)?.swapGroup ?? null), id).toBe(true);
    }
  });

  it('tag bodyweight moves consistently (reps-first progression, no invented load)', () => {
    for (const e of EXERCISE_CATALOG) {
      if (e.loadType === 'BODYWEIGHT') {
        expect(e.equipment, e.id).toBe('BODYWEIGHT');
      }
      if (e.equipment === 'BODYWEIGHT') {
        expect(['BODYWEIGHT', 'BODYWEIGHT_PLUS'], e.id).toContain(e.loadType);
      }
      if (e.equipment !== 'DUMBBELL') {
        expect(e.perHand, e.id).toBe(false);
      }
    }
  });

  it('give every lower-body pattern a bodyweight option, and all but leg curls a dumbbell one', () => {
    for (const pattern of [
      'squat',
      'lunge',
      'hinge',
      'knee-flexion',
      'hip-extension',
      'calf-raise',
    ]) {
      const equipment = new Set(
        EXERCISE_CATALOG.filter((e) => e.movementPattern === pattern).map((e) => e.equipment),
      );
      expect(equipment.has('BODYWEIGHT'), `${pattern}: BODYWEIGHT`).toBe(true);
      // No dumbbell leg curl exists; dumbbell users get the (bodyweight) slider curl.
      expect(equipment.has('DUMBBELL') || pattern === 'knee-flexion', `${pattern}: DUMBBELL`).toBe(
        true,
      );
    }
  });

  it('use well-formed media ids (free-exercise-db photo, YouTube video + channel)', () => {
    for (const e of EXERCISE_CATALOG) {
      if (e.freeExerciseDbId !== null) {
        expect(e.freeExerciseDbId, e.id).toMatch(/^[A-Za-z0-9_'()-]+$/);
      }
      if (e.videoId !== null) {
        expect(e.videoId, e.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(e.videoChannel, e.id).toBeTruthy();
        expect(e.videoStartSec, e.id).not.toBeNull();
      }
    }
  });

  it('keep names unique and aliases from shadowing another exercise', () => {
    const names = EXERCISE_CATALOG.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const owner = new Map<string, string>();
    for (const e of EXERCISE_CATALOG) {
      for (const label of [e.name, ...e.aliases].map((l) => l.toLowerCase())) {
        const prev = owner.get(label);
        expect(prev === undefined || prev === e.id, `"${label}": ${prev} vs ${e.id}`).toBe(true);
        owner.set(label, e.id);
      }
    }
  });
});

describe('equipment swaps (audit F-GYM-2-1)', () => {
  const inSet = (id: string, access: 'DUMBBELLS' | 'BODYWEIGHT') => {
    const e = EXERCISE_BY_ID.get(id);
    return e !== undefined && EQUIPMENT_ACCESS_SETS[access].includes(e.equipment);
  };

  it('only swap to exercises the user can actually do', () => {
    for (const access of ['DUMBBELLS', 'BODYWEIGHT'] as const) {
      for (const [from, to] of Object.entries(EQUIPMENT_SWAPS[access])) {
        expect(inSet(to, access), `${access}: ${from} → ${to}`).toBe(true);
        expect(inSet(from, access), `${access}: ${from} is already allowed`).toBe(false);
      }
    }
  });

  it('cover every template exercise the user lacks (the engine fallback is a safety net only)', () => {
    for (const access of ['DUMBBELLS', 'BODYWEIGHT'] as const) {
      for (const t of PROGRAM_TEMPLATES) {
        for (const d of t.days) {
          for (const x of d.exercises) {
            if (!inSet(x.exerciseId, access)) {
              expect(
                EQUIPMENT_SWAPS[access][x.exerciseId],
                `${access}: ${x.exerciseId}`,
              ).toBeDefined();
            }
          }
        }
      }
    }
  });

  it('FULL_GYM allows every equipment type', () => {
    const all = new Set(EXERCISE_CATALOG.map((e) => e.equipment));
    for (const eq of all) expect(EQUIPMENT_ACCESS_SETS.FULL_GYM).toContain(eq);
  });
});

describe('workoutSessionDocSchema', () => {
  it('round-trips a realistic offline session document', () => {
    const now = new Date().toISOString();
    const doc: WorkoutSessionDoc = {
      schemaVersion: 1,
      id: randomUUID(),
      routineId: 'r1',
      routineDayId: 'd1',
      name: 'Upper A',
      status: 'COMPLETED',
      startedAt: now,
      finishedAt: now,
      localDate: '2026-09-24',
      isDeload: false,
      notes: null,
      clientUpdatedAt: now,
      engineVersion: 1,
      exercises: [
        {
          id: randomUUID(),
          exerciseId: 'barbell-bench-press',
          routineExerciseId: 're1',
          position: 0,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSec: 180,
          skipped: false,
          swappedFromId: null,
          lastSetRir: 2,
          prescription: {
            kind: 'increase',
            weightKg: 62.5,
            reps: [10, 10, 10],
            sets: 3,
            reasonCode: 'TOP_OF_RANGE',
            inputs: { lastWeightKg: 60, lastReps: [12, 12, 12] },
            deltaKg: 2.5,
            engineVersion: 1,
          },
          notes: null,
          sets: [0, 1, 2].map((position) => ({
            id: randomUUID(),
            position,
            weightKg: 62.5,
            reps: 10,
            isWarmup: false,
            completedAt: now,
          })),
        },
      ],
    };
    expect(workoutSessionDocSchema.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});
