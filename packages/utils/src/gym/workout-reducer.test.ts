import { describe, expect, it } from 'vitest';
import {
  workoutSessionDocSchema,
  type NextWorkoutExerciseDto,
  type Suggestion,
  type WorkoutSessionDoc,
} from '@chefer/types';
import { ENGINE_VERSION } from './progression';
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
      engineVersion: ENGINE_VERSION,
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

  it('T-42.3: completeSet/editSet carry the S20 cardio fields, omitted (not undefined) when unset', () => {
    const doc = start();
    const se = doc.exercises[0];
    const set = se?.sets[0];
    if (!se || !set) throw new Error('fixture');

    const logged = workoutReducer(doc, {
      type: 'completeSet',
      seId: se.id,
      setId: set.id,
      weightKg: 0,
      reps: 0,
      durationSec: 1200,
      distanceM: 5000,
      intensityRpe: 6,
      at: at(1),
    });
    const cardioSet = logged.exercises[0]?.sets[0];
    expect(cardioSet).toMatchObject({ durationSec: 1200, distanceM: 5000, intensityRpe: 6 });

    // A plain completeSet (no cardio fields) never gains the keys at all.
    const strength = workoutReducer(doc, {
      type: 'completeSet',
      seId: se.id,
      setId: set.id,
      at: at(1),
    });
    expect('durationSec' in (strength.exercises[0]?.sets[0] ?? {})).toBe(false);

    // editSet updates just one cardio field, leaves the others alone.
    const edited = workoutReducer(logged, {
      type: 'editSet',
      seId: se.id,
      setId: set.id,
      durationSec: 900,
      at: at(2),
    });
    expect(edited.exercises[0]?.sets[0]).toMatchObject({
      durationSec: 900,
      distanceM: 5000,
      intensityRpe: 6,
    });
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

  // Owner dogfood 2026-09-30: live workouts can remove an exercise, with Undo.
  it('restoreExercise (Undo) re-inserts a removed exercise at its original index, sets and all', () => {
    let doc = start();
    const target = doc.exercises[0];
    const firstSet = target?.sets[0];
    if (!target || !firstSet || doc.exercises.length < 2) {
      throw new Error('fixture');
    }
    doc = workoutReducer(doc, {
      type: 'completeSet',
      seId: target.id,
      setId: firstSet.id,
      at: at(1),
    });
    const ticked = doc.exercises[0];
    if (!ticked) {
      throw new Error('fixture');
    }
    const order = doc.exercises.map((e) => e.id);

    const removed = workoutReducer(doc, { type: 'removeExercise', seId: target.id, at: at(2) });
    expect(removed.exercises.some((e) => e.id === target.id)).toBe(false);
    expect(removed.exercises.map((e) => e.position)).toEqual(removed.exercises.map((_, i) => i));

    const restored = workoutReducer(removed, {
      type: 'restoreExercise',
      exercise: ticked,
      index: 0,
      at: at(3),
    });
    expect(restored.exercises.map((e) => e.id)).toEqual(order);
    expect(restored.exercises[0]?.sets[0]?.completedAt).toBe(at(1));
    expect(restored.exercises.map((e) => e.position)).toEqual(restored.exercises.map((_, i) => i));

    // A stale/duplicate Undo is a no-op.
    const again = workoutReducer(restored, {
      type: 'restoreExercise',
      exercise: ticked,
      index: 0,
      at: at(4),
    });
    expect(again).toBe(restored);
  });

  // UX-05 A1 (T-05.A1.2, PAT-16): Undo after removing any set re-inserts it
  // at the same index with the same id, values and completedAt.
  it('restoreSet (Undo) re-inserts a removed set at its original index, with its values and tick', () => {
    let doc = start();
    const se = doc.exercises[0];
    if (!se) {
      throw new Error('fixture');
    }
    const removedSet = se.sets[1];
    if (!removedSet) {
      throw new Error('fixture');
    }
    // Tick it first, so the Undo must restore the tick too.
    doc = workoutReducer(doc, {
      type: 'completeSet',
      seId: se.id,
      setId: removedSet.id,
      at: at(1),
    });
    const ticked = doc.exercises[0]?.sets.find((s) => s.id === removedSet.id);
    if (!ticked) {
      throw new Error('fixture');
    }
    expect(ticked.completedAt).not.toBeNull();

    const removed = workoutReducer(doc, {
      type: 'removeSet',
      seId: se.id,
      setId: removedSet.id,
      at: at(2),
    });
    expect(removed.exercises[0]?.sets.some((s) => s.id === removedSet.id)).toBe(false);
    expect(positionsContiguous(removed)).toBe(true);

    const restored = workoutReducer(removed, {
      type: 'restoreSet',
      seId: se.id,
      set: ticked,
      index: 1,
      at: at(3),
    });
    expect(restored.exercises[0]?.sets.map((s) => s.id)).toEqual(se.sets.map((s) => s.id));
    expect(restored.exercises[0]?.sets[1]).toMatchObject({
      id: removedSet.id,
      completedAt: ticked.completedAt,
      weightKg: removedSet.weightKg,
      reps: removedSet.reps,
    });
    expect(positionsContiguous(restored)).toBe(true);

    // A stale/duplicate Undo (the set is already back) is a no-op.
    const again = workoutReducer(restored, {
      type: 'restoreSet',
      seId: se.id,
      set: ticked,
      index: 1,
      at: at(4),
    });
    expect(again.exercises[0]?.sets).toEqual(restored.exercises[0]?.sets);

    // Unknown exercise id is a no-op (same reference, no stamp).
    const noop = workoutReducer(removed, {
      type: 'restoreSet',
      seId: 'nope',
      set: ticked,
      index: 1,
      at: at(5),
    });
    expect(noop).toBe(removed);
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

describe('workout supersets (plan-library-supersets S-D3)', () => {
  /** Session-exercise ids in position order (missing ones as ''). */
  const order = (doc: WorkoutSessionDoc): [string, string, string] => {
    const sorted = [...doc.exercises].sort((a, b) => a.position - b.position).map((e) => e.id);
    return [sorted[0] ?? '', sorted[1] ?? '', sorted[2] ?? ''];
  };
  const ids = (doc: WorkoutSessionDoc) =>
    [...doc.exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => `${e.exerciseId}:${e.supersetGroup ?? '-'}`);

  it('startSession copies the routine superset letters into the session', () => {
    const doc = startSession({
      id: newId(),
      newId,
      now: T0,
      localDate: '2026-09-24',
      routineId: 'r1',
      routineDayId: 'd1',
      name: 'Upper A',
      isDeload: false,
      exercises: [
        { ...planned('curl', 0, suggestion(10, [12, 12])), supersetGroup: 'A' },
        { ...planned('pushdown', 1, suggestion(20, [12, 12])), supersetGroup: 'A' },
        planned('raise', 2, suggestion(8, [15, 15])),
      ],
    });
    expect(ids(doc)).toEqual(['curl:A', 'pushdown:A', 'raise:-']);
    expect(workoutSessionDocSchema.parse(doc)).toEqual(doc);
  });

  it('creates and ungroups a superset for this session only', () => {
    const doc = start();
    const [bench, db, raise] = order(doc);
    const grouped = workoutReducer(doc, {
      type: 'createSuperset',
      seIds: [raise, bench],
      at: at(1),
    });
    expect(ids(grouped)).toEqual([
      'barbell-bench-press:A',
      'dumbbell-lateral-raise:A',
      'dumbbell-bench-press:-',
    ]);
    expect(grouped.clientUpdatedAt).toBe(at(1));
    expect(positionsContiguous(grouped)).toBe(true);

    const ungrouped = workoutReducer(grouped, {
      type: 'ungroupSuperset',
      seId: raise,
      at: at(2),
    });
    expect(ids(ungrouped)).toEqual([
      'barbell-bench-press:-',
      'dumbbell-lateral-raise:-',
      'dumbbell-bench-press:-',
    ]);
    expect(workoutReducer(doc, { type: 'createSuperset', seIds: [db, 'nope'], at: at(3) })).toBe(
      doc,
    );
  });

  it("keeps an older doc's derived supersets when it is first edited", () => {
    const doc = start();
    const legacy: WorkoutSessionDoc = {
      ...doc,
      exercises: doc.exercises.map(({ supersetGroup: _drop, ...se }) => se),
    };
    const [bench, db, raise] = order(legacy);
    const next = workoutReducer(legacy, {
      type: 'ungroupSuperset',
      seId: raise,
      derivedGroups: { [bench]: 'A', [db]: 'A', [raise]: null },
      at: at(1),
    });
    expect(ids(next)).toEqual([
      'barbell-bench-press:A',
      'dumbbell-bench-press:A',
      'dumbbell-lateral-raise:-',
    ]);
  });

  it('add, remove and move keep the session letters consistent', () => {
    const doc = start();
    const [bench, db] = order(doc);
    const grouped = workoutReducer(doc, {
      type: 'createSuperset',
      seIds: [bench, db],
      at: at(1),
    });
    const added = workoutReducer(grouped, {
      type: 'addExercise',
      newSeId: newId(),
      exerciseId: 'cable-biceps-curl',
      repMin: 10,
      repMax: 15,
      targetRir: 2,
      restSec: 90,
      prescription: suggestion(20, [12, 12]),
      warmups: [],
      newSetIds: [newId(), newId()],
      at: at(2),
    });
    expect(ids(added).at(-1)).toBe('cable-biceps-curl:-');

    // a step down from A2 hops over nothing: it swaps with its partner first
    const moved = workoutReducer(added, {
      type: 'moveExercise',
      seId: bench,
      direction: 'down',
      at: at(3),
    });
    expect(ids(moved).slice(0, 2)).toEqual(['dumbbell-bench-press:A', 'barbell-bench-press:A']);

    const removed = workoutReducer(added, { type: 'removeExercise', seId: db, at: at(4) });
    expect(ids(removed)[0]).toBe('barbell-bench-press:-'); // a superset of one dissolves
    expect(positionsContiguous(removed)).toBe(true);
  });
});
