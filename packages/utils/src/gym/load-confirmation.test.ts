import { describe, expect, it } from 'vitest';
import type { SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import { hasConfirmedLoad, isDoneAsPlanned, isLoadConfirmed } from './load-confirmation';
import { collectPrs } from './prs';
import { exposuresFromSession, toSessionSummary } from './session';
import { startSession, workoutReducer } from './workout-reducer';

// Progression guard (simple training mode §6.5): a tick with the prefilled
// numbers untouched records "done", never a lift.

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const AT = '2026-10-17T18:00:00.000Z';

function only<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error('expected at least one item');
  return x;
}

function planned(): WorkoutSessionDoc {
  return startSession({
    id: newId(),
    newId,
    now: AT,
    localDate: '2026-10-17',
    routineId: 'r1',
    routineDayId: 'd1',
    name: 'Upper body',
    isDeload: false,
    exercises: [
      {
        exerciseId: 'barbell-bench-press',
        routineExerciseId: 're1',
        position: 0,
        sets: 3,
        repBucket: '8-12',
        lastTime: null,
        repMin: 8,
        repMax: 12,
        targetRir: 2,
        restSec: 120,
        notes: null,
        supersetGroup: null,
        warmups: [],
        suggestion: {
          kind: 'hold',
          weightKg: 60,
          reps: [10, 10, 10],
          sets: 3,
          reasonCode: 'START',
          inputs: {},
          deltaKg: 0,
          engineVersion: 3,
        },
      },
    ],
  });
}

function finish(doc: WorkoutSessionDoc): WorkoutSessionDoc {
  return workoutReducer(doc, { type: 'finish', at: '2026-10-17T19:00:00.000Z' });
}

describe('progression guard', () => {
  it('a Done tick with unedited numbers is stored as load not confirmed', () => {
    const doc = planned();
    const se = only(doc.exercises);
    const ticked = workoutReducer(doc, { type: 'tickExercise', seId: se.id, done: true, at: AT });
    const sets = only(ticked.exercises).sets;
    expect(sets.every((s) => s.completedAt === AT)).toBe(true);
    expect(sets.every((s) => !isLoadConfirmed(s))).toBe(true);
    expect(isDoneAsPlanned(only(ticked.exercises))).toBe(true);
    expect(hasConfirmedLoad(only(ticked.exercises))).toBe(false);
  });

  it('progression ignores an exercise ticked as planned', () => {
    const doc = planned();
    const se = only(doc.exercises);
    const done = finish(
      workoutReducer(doc, { type: 'tickExercise', seId: se.id, done: true, at: AT }),
    );
    expect(exposuresFromSession(done)).toEqual([]);
  });

  it('editing the numbers confirms the load, so progression learns from it', () => {
    const doc = planned();
    const se = only(doc.exercises);
    let next = workoutReducer(doc, { type: 'tickExercise', seId: se.id, done: true, at: AT });
    for (const s of only(next.exercises).sets) {
      next = workoutReducer(next, {
        type: 'editSet',
        seId: se.id,
        setId: s.id,
        weightKg: 62.5,
        at: AT,
      });
    }
    const done = finish(next);
    expect(only(done.exercises).sets.every(isLoadConfirmed)).toBe(true);
    expect(isDoneAsPlanned(only(done.exercises))).toBe(false);
    expect(exposuresFromSession(done).map((e) => e.exerciseId)).toEqual(['barbell-bench-press']);
  });

  it('one unedited working set keeps the whole exercise out of progression', () => {
    const doc = planned();
    const se = only(doc.exercises);
    let next = workoutReducer(doc, { type: 'tickExercise', seId: se.id, done: true, at: AT });
    const firstSet = only(only(next.exercises).sets);
    next = workoutReducer(next, {
      type: 'editSet',
      seId: se.id,
      setId: firstSet.id,
      reps: 12,
      at: AT,
    });
    expect(exposuresFromSession(finish(next))).toEqual([]);
  });

  it('a "Track my progress" tick (completeSet) stays confirmed', () => {
    let doc = planned();
    const se = only(doc.exercises);
    for (const s of se.sets) {
      doc = workoutReducer(doc, { type: 'completeSet', seId: se.id, setId: s.id, at: AT });
    }
    expect(exposuresFromSession(finish(doc))).toHaveLength(1);
  });

  it('unticking clears both the tick and the unconfirmed mark', () => {
    const doc = planned();
    const se = only(doc.exercises);
    const ticked = workoutReducer(doc, { type: 'tickExercise', seId: se.id, done: true, at: AT });
    const unticked = workoutReducer(ticked, {
      type: 'tickExercise',
      seId: se.id,
      done: false,
      at: AT,
    });
    expect(only(unticked.exercises).sets.every((s) => s.completedAt === null)).toBe(true);
    expect(only(unticked.exercises).sets.every((s) => !('loadConfirmed' in s))).toBe(true);
  });

  it('a prefilled weight never sets a PR', () => {
    const doc = planned();
    const se = only(doc.exercises);
    const done = finish(
      workoutReducer(doc, { type: 'tickExercise', seId: se.id, done: true, at: AT }),
    );
    const summary: SessionSummaryDto = toSessionSummary(done);
    expect(only(summary.exercises).sets.every((s) => s.loadConfirmed === false)).toBe(true);
    expect(collectPrs([summary])).toEqual([]);
  });
});
