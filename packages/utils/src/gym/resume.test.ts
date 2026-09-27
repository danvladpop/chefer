// UX-36 amendment A1 (T-36.A1.1): the Resume card summary. Built on the same
// `workoutFocus()` the active-workout logger uses (AC9: matches exactly).
import { describe, expect, it } from 'vitest';
import type { NextWorkoutExerciseDto, Suggestion, WorkoutSessionDoc } from '@chefer/types';
import { elapsedSeconds, keepsUntilIso, resumeSummary } from './resume';
import { lookup } from './test-fixtures';
import { startSession, workoutReducer } from './workout-reducer';

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function suggestion(weightKg: number, reps: number[]): Suggestion {
  return {
    kind: 'hold',
    weightKg,
    reps,
    sets: reps.length,
    reasonCode: 'ADD_REPS',
    inputs: { repMin: 8, repMax: 12 },
    deltaKg: 0,
    engineVersion: 1,
  };
}

function planned(exerciseId: string, position: number, s: Suggestion): NextWorkoutExerciseDto {
  return {
    routineExerciseId: `re-${exerciseId}`,
    exerciseId,
    position,
    sets: s.sets,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 90,
    supersetGroup: null,
    notes: null,
    repBucket: '8-12',
    suggestion: s,
    warmups: [],
    lastTime: null,
  };
}

const T0 = '2026-09-24T18:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

function start(): WorkoutSessionDoc {
  return startSession({
    id: newId(),
    newId,
    now: T0,
    localDate: '2026-09-24',
    routineId: 'r1',
    routineDayId: 'd1',
    name: 'Full Body B',
    isDeload: false,
    exercises: [
      planned('barbell-bench-press', 0, suggestion(80, [10, 10, 9])),
      planned('seated-cable-row', 1, suggestion(50, [10, 10, 9])),
    ],
  });
}

describe('resumeSummary', () => {
  it('active: elapsed time, exercises/sets progress and Now: focus, from workoutFocus', () => {
    let doc = start();
    // Tick bench's 3 sets (done) and row's first set.
    const bench = doc.exercises[0];
    const row = doc.exercises[1];
    const rowFirstSet = row?.sets[0];
    if (!bench || !row || !rowFirstSet) {
      throw new Error('fixture');
    }
    for (const s of bench.sets) {
      doc = workoutReducer(doc, { type: 'completeSet', seId: bench.id, setId: s.id, at: at(1) });
    }
    doc = workoutReducer(doc, {
      type: 'completeSet',
      seId: row.id,
      setId: rowFirstSet.id,
      at: at(2),
    });

    const summary = resumeSummary(doc, { now: at(12), lookup });
    expect(summary.state).toBe('active');
    expect(summary.elapsedSec).toBe(12 * 60);
    expect(summary.exercisesDone).toBe(1); // bench fully ticked
    expect(summary.exercisesTotal).toBe(2);
    expect(summary.setsDone).toBe(4); // 3 bench + 1 row
    expect(summary.setsTotal).toBe(6);
    expect(summary.focus).toEqual({
      exerciseId: 'seated-cable-row',
      name: lookup('seated-cable-row')?.name,
      setIndex: 2,
      setCount: 3,
      isTimer: false,
    });
  });

  it("paused: static elapsed time up to pausedAt, keepsUntilIso 24h later, focus reads Next (state only — copy is the caller's job)", () => {
    const doc = start();
    const pausedAt = at(23);
    const summary = resumeSummary(doc, { now: at(90), pausedAt, lookup });
    expect(summary.state).toBe('paused');
    expect(summary.elapsedSec).toBe(23 * 60); // NOT `now` — the save-time, not wall-clock
    expect(summary.keepsUntilIso).toBe(keepsUntilIso(pausedAt));
  });

  it('backfill: no live timer state regardless of elapsed time', () => {
    const doc = start();
    const summary = resumeSummary(doc, { now: at(500), isBackfill: true, lookup });
    expect(summary.state).toBe('backfill');
  });

  it('allLogged: every non-skipped exercise fully ticked, focus null', () => {
    let doc = start();
    for (const se of doc.exercises) {
      for (const s of se.sets) {
        doc = workoutReducer(doc, { type: 'completeSet', seId: se.id, setId: s.id, at: at(1) });
      }
    }
    const summary = resumeSummary(doc, { now: at(40), lookup });
    expect(summary.state).toBe('allLogged');
    expect(summary.focus).toBeNull();
    expect(summary.exercisesDone).toBe(summary.exercisesTotal);
  });

  it('a skipped exercise does not count toward exercisesTotal/setsTotal', () => {
    let doc = start();
    const row = doc.exercises[1];
    if (!row) {
      throw new Error('fixture');
    }
    doc = workoutReducer(doc, { type: 'skipExercise', seId: row.id, skipped: true, at: at(1) });
    const summary = resumeSummary(doc, { now: at(5), lookup });
    expect(summary.exercisesTotal).toBe(1);
    expect(summary.setsTotal).toBe(3);
  });
});

describe('elapsedSeconds / keepsUntilIso', () => {
  it('elapsedSeconds floors at 0 and never goes negative', () => {
    expect(elapsedSeconds(at(10), at(5))).toBe(0);
    expect(elapsedSeconds(at(0), at(10))).toBe(600);
  });

  it('keepsUntilIso is exactly 24h after pausedAt', () => {
    expect(keepsUntilIso(T0)).toBe('2026-09-25T18:00:00.000Z');
  });
});
