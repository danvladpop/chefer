import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, EXERCISE_CATALOG } from './exercise-catalog';
import { workoutSessionDocSchema, type WorkoutSessionDoc } from './schemas';
import { EQUIPMENT_SWAPS, PROGRAM_TEMPLATES } from './templates';
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
