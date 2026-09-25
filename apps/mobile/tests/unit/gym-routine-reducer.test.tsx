import type { RoutineDto } from '@chefer/types';
import { draftToRoutineDoc, routineDtoToDraft } from '../../src/features/gym/routine/mapping';
import { routineDraftReducer } from '../../src/features/gym/routine/reducer';
import {
  MAX_DAYS,
  MAX_EXERCISES_PER_DAY,
  type RoutineDraft,
} from '../../src/features/gym/routine/types';
import { makeExercise } from './gym-fixtures';

// Draft reducer (gym_plan.md §5.4). Ids are always passed in (never generated
// by the reducer), matching the workout reducer's testing convention.

const bench = makeExercise('bench', 'Bench Press');
const isolationCurl = { ...makeExercise('curl', 'Bicep Curl'), category: 'ISOLATION' as const };

function makeRoutineDto(): RoutineDto {
  return {
    id: 'r1',
    name: 'Full Body',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 3,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 'e1',
            exerciseId: 'bench',
            position: 0,
            sets: 3,
            repMin: 8,
            repMax: 12,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            notes: null,
          },
        ],
      },
    ],
  };
}

function draft(): RoutineDraft {
  return routineDtoToDraft(makeRoutineDto());
}

describe('routineDraftReducer — days', () => {
  it('adds a day up to MAX_DAYS', () => {
    let d = draft();
    d = routineDraftReducer(d, { type: 'addDay', dayId: 'new-1' });
    expect(d.days).toHaveLength(2);
    expect(d.days[1]).toMatchObject({
      key: 'new-1',
      name: 'Day 2',
      plannedWeekday: null,
      exercises: [],
    });

    // Fill up to the cap, then confirm one more is a no-op.
    for (let i = d.days.length; i < MAX_DAYS; i++) {
      d = routineDraftReducer(d, { type: 'addDay', dayId: `filler-${i}` });
    }
    expect(d.days).toHaveLength(MAX_DAYS);
    const atCap = routineDraftReducer(d, { type: 'addDay', dayId: 'overflow' });
    expect(atCap.days).toHaveLength(MAX_DAYS);
  });

  it('duplicates a day with fresh exercise keys and no server ids', () => {
    const d = routineDraftReducer(draft(), {
      type: 'duplicateDay',
      dayKey: 'd1',
      dayId: 'd1-copy',
      exerciseIds: ['e1-copy'],
    });
    expect(d.days).toHaveLength(2);
    const copy = d.days[1];
    expect(copy?.key).toBe('d1-copy');
    expect(copy?.id).toBeUndefined();
    expect(copy?.name).toBe('Day A (copy)');
    expect(copy?.exercises[0]).toMatchObject({ key: 'e1-copy', exerciseId: 'bench', sets: 3 });
    expect(copy?.exercises[0]?.id).toBeUndefined();
    // The original is untouched.
    expect(d.days[0]?.exercises[0]?.id).toBe('e1');
  });

  it('deletes a day', () => {
    const d = routineDraftReducer(draft(), { type: 'deleteDay', dayKey: 'd1' });
    expect(d.days).toHaveLength(0);
  });

  it('moves a day up/down and no-ops at the edges', () => {
    let d = draft();
    d = routineDraftReducer(d, { type: 'addDay', dayId: 'd2' });
    const moved = routineDraftReducer(d, { type: 'moveDay', dayKey: 'd2', direction: 'up' });
    expect(moved.days.map((x) => x.key)).toEqual(['d2', 'd1']);

    const noop = routineDraftReducer(moved, { type: 'moveDay', dayKey: 'd2', direction: 'up' });
    expect(noop.days.map((x) => x.key)).toEqual(['d2', 'd1']);
  });

  it('renames a day and sets its planned weekday', () => {
    let d = draft();
    d = routineDraftReducer(d, { type: 'renameDay', dayKey: 'd1', name: 'Upper A' });
    d = routineDraftReducer(d, { type: 'setPlannedWeekday', dayKey: 'd1', weekday: 3 });
    expect(d.days[0]).toMatchObject({ name: 'Upper A', plannedWeekday: 3 });
    d = routineDraftReducer(d, { type: 'setPlannedWeekday', dayKey: 'd1', weekday: null });
    expect(d.days[0]?.plannedWeekday).toBeNull();
  });
});

describe('routineDraftReducer — exercises', () => {
  it('adds an exercise with catalog defaults (3 sets, its rep range/rest, defaultTargetRir)', () => {
    const d = routineDraftReducer(draft(), {
      type: 'addExercise',
      dayKey: 'd1',
      newExerciseKey: 'new-ex',
      exercise: isolationCurl,
    });
    const added = d.days[0]?.exercises[1];
    expect(added).toMatchObject({
      key: 'new-ex',
      exerciseId: 'curl',
      sets: 3,
      repMin: isolationCurl.repMin,
      repMax: isolationCurl.repMax,
      restSec: isolationCurl.restSec,
      targetRir: 1, // isolation → 1
    });
    expect(added?.id).toBeUndefined();
  });

  it('does not add past MAX_EXERCISES_PER_DAY', () => {
    let d = draft();
    for (let i = 0; i < MAX_EXERCISES_PER_DAY; i++) {
      d = routineDraftReducer(d, {
        type: 'addExercise',
        dayKey: 'd1',
        newExerciseKey: `ex-${i}`,
        exercise: bench,
      });
    }
    expect(d.days[0]?.exercises.length).toBe(MAX_EXERCISES_PER_DAY);
    const atCap = routineDraftReducer(d, {
      type: 'addExercise',
      dayKey: 'd1',
      newExerciseKey: 'overflow',
      exercise: bench,
    });
    expect(atCap.days[0]?.exercises.length).toBe(MAX_EXERCISES_PER_DAY);
  });

  it('swaps an exercise: adopts the new catalog rep range/rest/RIR, keeps sets', () => {
    const d = routineDraftReducer(draft(), {
      type: 'swapExercise',
      dayKey: 'd1',
      exerciseKey: 'e1',
      exercise: isolationCurl,
    });
    expect(d.days[0]?.exercises[0]).toMatchObject({
      key: 'e1',
      id: 'e1',
      exerciseId: 'curl',
      sets: 3, // unchanged
      repMin: isolationCurl.repMin,
      repMax: isolationCurl.repMax,
      restSec: isolationCurl.restSec,
      targetRir: 1,
    });
  });

  it('removes and reorders exercises', () => {
    let d = routineDraftReducer(draft(), {
      type: 'addExercise',
      dayKey: 'd1',
      newExerciseKey: 'e2',
      exercise: isolationCurl,
    });
    d = routineDraftReducer(d, {
      type: 'moveExercise',
      dayKey: 'd1',
      exerciseKey: 'e2',
      direction: 'up',
    });
    expect(d.days[0]?.exercises.map((e) => e.key)).toEqual(['e2', 'e1']);

    d = routineDraftReducer(d, { type: 'removeExercise', dayKey: 'd1', exerciseKey: 'e1' });
    expect(d.days[0]?.exercises.map((e) => e.key)).toEqual(['e2']);
  });

  it('clamps sets to [1,10]', () => {
    let d = routineDraftReducer(draft(), {
      type: 'setSets',
      dayKey: 'd1',
      exerciseKey: 'e1',
      sets: 99,
    });
    expect(d.days[0]?.exercises[0]?.sets).toBe(10);
    d = routineDraftReducer(d, { type: 'setSets', dayKey: 'd1', exerciseKey: 'e1', sets: -5 });
    expect(d.days[0]?.exercises[0]?.sets).toBe(1);
  });

  it('keeps repMin ≤ repMax by nudging the other bound (validation V-rule invariant)', () => {
    let d = routineDraftReducer(draft(), {
      type: 'setRepMin',
      dayKey: 'd1',
      exerciseKey: 'e1',
      repMin: 20,
    });
    expect(d.days[0]?.exercises[0]).toMatchObject({ repMin: 20, repMax: 20 });

    d = routineDraftReducer(draft(), {
      type: 'setRepMax',
      dayKey: 'd1',
      exerciseKey: 'e1',
      repMax: 3,
    });
    expect(d.days[0]?.exercises[0]).toMatchObject({ repMin: 3, repMax: 3 });
  });

  it('clamps rest seconds to [15,600] and target RIR to [0,4]', () => {
    let d = routineDraftReducer(draft(), {
      type: 'setRestSec',
      dayKey: 'd1',
      exerciseKey: 'e1',
      restSec: 1000,
    });
    expect(d.days[0]?.exercises[0]?.restSec).toBe(600);
    d = routineDraftReducer(d, { type: 'setRestSec', dayKey: 'd1', exerciseKey: 'e1', restSec: 1 });
    expect(d.days[0]?.exercises[0]?.restSec).toBe(15);

    d = routineDraftReducer(d, {
      type: 'setTargetRir',
      dayKey: 'd1',
      exerciseKey: 'e1',
      targetRir: 9,
    });
    expect(d.days[0]?.exercises[0]?.targetRir).toBe(4);
    d = routineDraftReducer(d, {
      type: 'setTargetRir',
      dayKey: 'd1',
      exerciseKey: 'e1',
      targetRir: -1,
    });
    expect(d.days[0]?.exercises[0]?.targetRir).toBe(0);
  });
});

describe('draftToRoutineDoc — save payload shape', () => {
  it('keeps existing ids and omits ids for brand-new rows', () => {
    let d = draft();
    d = routineDraftReducer(d, { type: 'addDay', dayId: 'd2' });
    d = routineDraftReducer(d, {
      type: 'addExercise',
      dayKey: 'd2',
      newExerciseKey: 'new-ex',
      exercise: bench,
    });

    const doc = draftToRoutineDoc(d);
    expect(doc.id).toBe('r1');
    expect(doc.days[0]).toMatchObject({ id: 'd1' });
    expect(doc.days[0]?.exercises[0]).toMatchObject({ id: 'e1', exerciseId: 'bench' });
    // The new day and its new exercise carry no `id` — the API assigns fresh ones.
    expect(doc.days[1]).not.toHaveProperty('id');
    expect(doc.days[1]?.exercises[0]).not.toHaveProperty('id');
  });

  it('trims names', () => {
    let d = draft();
    d = routineDraftReducer(d, { type: 'renameRoutine', name: '  Padded  ' });
    expect(draftToRoutineDoc(d).name).toBe('Padded');
  });
});

describe('routineDraftReducer — supersets (G4-B)', () => {
  function threeRows(): RoutineDraft {
    let d = draft();
    d = routineDraftReducer(d, {
      type: 'addExercise',
      dayKey: 'd1',
      newExerciseKey: 'e2',
      exercise: isolationCurl,
    });
    d = routineDraftReducer(d, {
      type: 'addExercise',
      dayKey: 'd1',
      newExerciseKey: 'e3',
      exercise: bench,
    });
    return d;
  }
  const groups = (d: RoutineDraft) => d.days[0]?.exercises.map((e) => e.supersetGroup);

  it('links and unlinks with the next exercise, and saves the letters', () => {
    let d = routineDraftReducer(threeRows(), {
      type: 'setSupersetWithNext',
      dayKey: 'd1',
      exerciseKey: 'e1',
      linked: true,
    });
    expect(groups(d)).toEqual(['A', 'A', null]);
    expect(draftToRoutineDoc(d).days[0]?.exercises.map((e) => e.supersetGroup)).toEqual([
      'A',
      'A',
      null,
    ]);
    d = routineDraftReducer(d, {
      type: 'setSupersetWithNext',
      dayKey: 'd1',
      exerciseKey: 'e1',
      linked: false,
    });
    expect(groups(d)).toEqual([null, null, null]);
  });

  it('removing a member dissolves a pair; moving out of the group leaves it', () => {
    const linked = routineDraftReducer(threeRows(), {
      type: 'setSupersetWithNext',
      dayKey: 'd1',
      exerciseKey: 'e1',
      linked: true,
    });
    const removed = routineDraftReducer(linked, {
      type: 'removeExercise',
      dayKey: 'd1',
      exerciseKey: 'e2',
    });
    expect(groups(removed)).toEqual([null, null]);

    const moved = routineDraftReducer(linked, {
      type: 'moveExercise',
      dayKey: 'd1',
      exerciseKey: 'e2',
      direction: 'down',
    });
    expect(moved.days[0]?.exercises.map((e) => e.key)).toEqual(['e1', 'e3', 'e2']);
    expect(groups(moved)).toEqual([null, null, null]);

    const swapped = routineDraftReducer(linked, {
      type: 'moveExercise',
      dayKey: 'd1',
      exerciseKey: 'e2',
      direction: 'up',
    });
    expect(swapped.days[0]?.exercises.map((e) => e.key)).toEqual(['e2', 'e1', 'e3']);
    expect(groups(swapped)).toEqual(['A', 'A', null]);
  });

  it('loads stray server letters in canonical form', () => {
    const dtoWithLetters = makeRoutineDto();
    const first = dtoWithLetters.days[0];
    const base = first?.exercises[0];
    if (!first || !base) throw new Error('fixture has no exercise');
    first.exercises = [
      { ...base, id: 'x1', supersetGroup: 'Q' },
      { ...base, id: 'x2', position: 1, supersetGroup: 'Q' },
      { ...base, id: 'x3', position: 2, supersetGroup: 'Z' },
    ];
    expect(
      routineDtoToDraft(dtoWithLetters).days[0]?.exercises.map((e) => e.supersetGroup),
    ).toEqual(['A', 'A', null]);
  });
});
