import { describe, expect, it } from 'vitest';
import {
  workoutSessionDocSchema,
  type NextWorkoutExerciseDto,
  type Suggestion,
  type WorkoutSessionDoc,
} from '@chefer/types';
import { plannedSets, startSession, workoutReducer, type WorkoutAction } from './workout-reducer';

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

function planned(
  exerciseId: string,
  position: number,
  s: Suggestion,
  warmups: { weightKg: number; reps: number }[] = [],
): NextWorkoutExerciseDto {
  return {
    routineExerciseId: `re-${exerciseId}`,
    exerciseId,
    position,
    sets: s.sets,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    notes: position === 0 ? 'Grip: pinky on the ring' : null,
    repBucket: '8-12',
    suggestion: s,
    warmups,
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
    name: 'Upper A',
    isDeload: false,
    exercises: [
      planned('dumbbell-bench-press', 1, suggestion(14, [10, 10, 9])),
      planned('barbell-bench-press', 0, suggestion(80, [11, 10, 9]), [
        { weightKg: 20, reps: 10 },
        { weightKg: 40, reps: 8 },
      ]),
      planned('dumbbell-lateral-raise', 2, suggestion(8, [15, 15])),
    ],
  });
}

function positionsContiguous(doc: WorkoutSessionDoc): boolean {
  const ok = (xs: { position: number }[]) =>
    [...xs].sort((a, b) => a.position - b.position).every((x, i) => x.position === i);
  return ok(doc.exercises) && doc.exercises.every((se) => ok(se.sets));
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) {
      deepFreeze(v);
    }
  }
  return o;
}

describe('startSession', () => {
  it('creates warm-ups then prefilled working sets, in position order', () => {
    const doc = start();
    expect(doc).toMatchObject({
      schemaVersion: 1,
      status: 'IN_PROGRESS',
      startedAt: T0,
      finishedAt: null,
      clientUpdatedAt: T0,
      engineVersion: 1,
      routineId: 'r1',
      routineDayId: 'd1',
    });
    expect(doc.exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'dumbbell-bench-press',
      'dumbbell-lateral-raise',
    ]);
    const bench = doc.exercises[0];
    expect(
      bench?.sets.map((s) => [s.position, s.isWarmup, s.weightKg, s.reps, s.completedAt]),
    ).toEqual([
      [0, true, 20, 10, null],
      [1, true, 40, 8, null],
      [2, false, 80, 11, null],
      [3, false, 80, 10, null],
      [4, false, 80, 9, null],
    ]);
    expect(bench).toMatchObject({
      notes: 'Grip: pinky on the ring',
      skipped: false,
      lastSetRir: null,
    });
    expect(positionsContiguous(doc)).toBe(true);
    expect(workoutSessionDocSchema.parse(doc)).toEqual(doc);
  });

  it('plannedSets pads missing per-set reps and stops when ids run out', () => {
    const s = { ...suggestion(50, [8]), sets: 3 };
    expect(plannedSets(s, [], ['a', 'b', 'c']).map((x) => x.reps)).toEqual([8, 8, 8]);
    expect(plannedSets(s, [{ weightKg: 20, reps: 10 }], ['a', 'b'])).toHaveLength(2);
    expect(plannedSets({ ...s, reps: [] }, [], ['a'])[0]?.reps).toBe(0);
  });
});

describe('workoutReducer', () => {
  it('start → complete every set → RIR → finish yields a valid COMPLETED document', () => {
    let doc = start();
    let minute = 1;
    for (const se of doc.exercises) {
      for (const set of se.sets) {
        doc = workoutReducer(doc, {
          type: 'completeSet',
          seId: se.id,
          setId: set.id,
          at: at(minute++),
        });
      }
      doc = workoutReducer(doc, { type: 'setRir', seId: se.id, rir: 2, at: at(minute++) });
    }
    doc = workoutReducer(doc, { type: 'finish', at: at(60) });
    expect(doc.status).toBe('COMPLETED');
    expect(doc.finishedAt).toBe(at(60));
    expect(doc.clientUpdatedAt).toBe(at(60));
    expect(doc.exercises.every((se) => se.lastSetRir === 2)).toBe(true);
    expect(doc.exercises.every((se) => se.sets.every((s) => s.completedAt !== null))).toBe(true);
    expect(workoutSessionDocSchema.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('is immutable and stamps clientUpdatedAt on every applied action', () => {
    const doc = deepFreeze(start());
    const se = doc.exercises[0];
    const set = se?.sets[2];
    if (!se || !set) {
      throw new Error('fixture');
    }
    const done = workoutReducer(doc, {
      type: 'completeSet',
      seId: se.id,
      setId: set.id,
      weightKg: 82.5,
      reps: 12,
      at: at(5),
    });
    expect(done).not.toBe(doc);
    expect(done.clientUpdatedAt).toBe(at(5));
    expect(done.exercises[0]?.sets[2]).toMatchObject({
      weightKg: 82.5,
      reps: 12,
      completedAt: at(5),
    });
    expect(doc.exercises[0]?.sets[2]?.completedAt).toBeNull();

    const edited = workoutReducer(done, {
      type: 'editSet',
      seId: se.id,
      setId: set.id,
      reps: 11,
      at: at(6),
    });
    expect(edited.exercises[0]?.sets[2]).toMatchObject({ weightKg: 82.5, reps: 11 });
    const edited2 = workoutReducer(edited, {
      type: 'editSet',
      seId: se.id,
      setId: set.id,
      weightKg: 80,
      at: at(6),
    });
    expect(edited2.exercises[0]?.sets[2]).toMatchObject({ weightKg: 80, reps: 11 });
    const undone = workoutReducer(edited, {
      type: 'uncompleteSet',
      seId: se.id,
      setId: set.id,
      at: at(7),
    });
    expect(undone.exercises[0]?.sets[2]?.completedAt).toBeNull();
  });

  it('unknown ids are a no-op (same reference, no stamp)', () => {
    const doc = start();
    const se = doc.exercises[0];
    const actions: WorkoutAction[] = [
      { type: 'completeSet', seId: 'nope', setId: 'nope', at: at(1) },
      { type: 'completeSet', seId: se?.id ?? '', setId: 'nope', at: at(1) },
      { type: 'setRir', seId: 'nope', rir: 1, at: at(1) },
      { type: 'addSet', seId: 'nope', newSetId: newId(), at: at(1) },
      { type: 'removeSet', seId: se?.id ?? '', setId: 'nope', at: at(1) },
      { type: 'moveExercise', seId: 'nope', direction: 'up', at: at(1) },
      { type: 'setNote', seId: 'nope', notes: 'x', at: at(1) },
      { type: 'skipExercise', seId: 'nope', skipped: true, at: at(1) },
    ];
    for (const a of actions) {
      expect(workoutReducer(doc, a)).toBe(doc);
    }
  });

  it('add / remove sets keep positions contiguous', () => {
    let doc = start();
    const se = doc.exercises[0];
    if (!se) {
      throw new Error('fixture');
    }
    const added = newId();
    doc = workoutReducer(doc, { type: 'addSet', seId: se.id, newSetId: added, at: at(1) });
    const bench = doc.exercises[0];
    expect(bench?.sets).toHaveLength(6);
    expect(bench?.sets[5]).toMatchObject({
      id: added,
      position: 5,
      weightKg: 80,
      reps: 9,
      isWarmup: false,
    });
    doc = workoutReducer(doc, {
      type: 'removeSet',
      seId: se.id,
      setId: se.sets[1]?.id ?? '',
      at: at(2),
    });
    expect(doc.exercises[0]?.sets.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);
    expect(positionsContiguous(doc)).toBe(true);

    // Adding to an exercise with no working sets falls back to the prescription.
    const empty = { ...start() };
    const lat = empty.exercises[2];
    if (!lat) {
      throw new Error('fixture');
    }
    const bare: WorkoutSessionDoc = {
      ...empty,
      exercises: empty.exercises.map((e) => (e.id === lat.id ? { ...e, sets: [] } : e)),
    };
    const refilled = workoutReducer(bare, {
      type: 'addSet',
      seId: lat.id,
      newSetId: newId(),
      at: at(3),
    });
    expect(refilled.exercises[2]?.sets[0]).toMatchObject({ position: 0, weightKg: 8, reps: 15 });
    const noReps: WorkoutSessionDoc = {
      ...bare,
      exercises: bare.exercises.map((e) =>
        e.id === lat.id ? { ...e, prescription: { ...e.prescription, reps: [] } } : e,
      ),
    };
    const floor = workoutReducer(noReps, {
      type: 'addSet',
      seId: lat.id,
      newSetId: newId(),
      at: at(3),
    });
    expect(floor.exercises[2]?.sets[0]?.reps).toBe(8);
  });

  it('swap replaces the planned sets and remembers the original exercise', () => {
    let doc = start();
    const se = doc.exercises[1];
    if (!se) {
      throw new Error('fixture');
    }
    doc = workoutReducer(doc, { type: 'setRir', seId: se.id, rir: 1, at: at(1) });
    const swap = (exerciseId: string, minute: number): WorkoutAction => ({
      type: 'swapExercise',
      seId: se.id,
      exerciseId,
      repMin: 8,
      repMax: 12,
      targetRir: 2,
      restSec: 120,
      prescription: suggestion(50, [10, 10]),
      warmups: [{ weightKg: 25, reps: 8 }],
      newSetIds: [newId(), newId(), newId()],
      at: at(minute),
    });
    doc = workoutReducer(doc, swap('machine-chest-press', 2));
    expect(doc.exercises[1]).toMatchObject({
      exerciseId: 'machine-chest-press',
      swappedFromId: 'dumbbell-bench-press',
      lastSetRir: null,
      position: 1,
    });
    expect(doc.exercises[1]?.sets.map((s) => [s.position, s.isWarmup, s.weightKg])).toEqual([
      [0, true, 25],
      [1, false, 50],
      [2, false, 50],
    ]);
    doc = workoutReducer(doc, swap('cable-fly', 3));
    expect(doc.exercises[1]?.swappedFromId).toBe('dumbbell-bench-press');
    expect(workoutSessionDocSchema.parse(doc)).toEqual(doc);
  });

  it('add / move / skip exercises keep positions contiguous', () => {
    let doc = start();
    const newSeId = newId();
    doc = workoutReducer(doc, {
      type: 'addExercise',
      newSeId,
      exerciseId: 'face-pull',
      repMin: 12,
      repMax: 20,
      targetRir: 1,
      restSec: 90,
      prescription: suggestion(20, [15, 15]),
      warmups: [],
      newSetIds: [newId(), newId()],
      at: at(1),
    });
    expect(doc.exercises[3]).toMatchObject({ id: newSeId, position: 3, routineExerciseId: null });
    doc = workoutReducer(doc, { type: 'moveExercise', seId: newSeId, direction: 'up', at: at(2) });
    doc = workoutReducer(doc, { type: 'moveExercise', seId: newSeId, direction: 'up', at: at(3) });
    const order = () =>
      [...doc.exercises].sort((a, b) => a.position - b.position).map((e) => e.exerciseId);
    expect(order()).toEqual([
      'barbell-bench-press',
      'face-pull',
      'dumbbell-bench-press',
      'dumbbell-lateral-raise',
    ]);
    const firstId = doc.exercises.find((e) => e.position === 0)?.id ?? '';
    const before = order();
    doc = workoutReducer(doc, { type: 'moveExercise', seId: firstId, direction: 'up', at: at(4) });
    expect(order()).toEqual(before);
    expect(doc.clientUpdatedAt).toBe(at(4));
    doc = workoutReducer(doc, {
      type: 'moveExercise',
      seId: firstId,
      direction: 'down',
      at: at(5),
    });
    expect(order()[1]).toBe('barbell-bench-press');
    expect(positionsContiguous(doc)).toBe(true);

    doc = workoutReducer(doc, { type: 'skipExercise', seId: newSeId, skipped: true, at: at(6) });
    expect(doc.exercises.find((e) => e.id === newSeId)?.skipped).toBe(true);
    expect(workoutSessionDocSchema.parse(doc)).toEqual(doc);
  });

  it('notes on the session and on exercises; discard', () => {
    let doc = start();
    doc = workoutReducer(doc, { type: 'setNote', seId: null, notes: 'Felt strong', at: at(1) });
    expect(doc.notes).toBe('Felt strong');
    const seId = doc.exercises[2]?.id ?? '';
    doc = workoutReducer(doc, { type: 'setNote', seId, notes: 'Lean forward', at: at(2) });
    expect(doc.exercises[2]?.notes).toBe('Lean forward');
    doc = workoutReducer(doc, { type: 'discard', at: at(3) });
    expect(doc).toMatchObject({ status: 'DISCARDED', clientUpdatedAt: at(3), finishedAt: null });
  });
});
