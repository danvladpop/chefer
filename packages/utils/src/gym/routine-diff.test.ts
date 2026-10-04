import { describe, expect, it } from 'vitest';
import { diffRoutineDoc, type DiffDay, type DiffDoc, type DiffExercise } from './routine-diff';

const ex = (id: string | undefined, over: Partial<DiffExercise> = {}): DiffExercise => ({
  id,
  exerciseId: 'squat',
  sets: 3,
  repMin: 6,
  repMax: 8,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  trainerNote: null,
  ...over,
});

const day = (
  id: string | undefined,
  exercises: DiffExercise[],
  over: Partial<DiffDay> = {},
): DiffDay => ({
  id,
  name: 'Day A',
  plannedWeekday: 0,
  exercises,
  ...over,
});

const doc = (days: DiffDay[], name = 'Plan'): DiffDoc => ({ name, days });

const rowOf = (d: DiffDoc, dayIndex: number, rowIndex: number): DiffExercise => {
  const found = d.days[dayIndex]?.exercises[rowIndex];
  if (!found) throw new Error(`no row ${dayIndex}:${rowIndex}`);
  return found;
};

const dayOf = (d: DiffDoc, index: number): DiffDay => {
  const found = d.days[index];
  if (!found) throw new Error(`no day ${index}`);
  return found;
};

const before = (): DiffDoc =>
  doc([
    day('d1', [ex('r1'), ex('r2', { exerciseId: 'bench' }), ex('r3', { exerciseId: 'row' })]),
    day('d2', [ex('r4', { exerciseId: 'ohp' })], { name: 'Day B', plannedWeekday: 3 }),
  ]);

describe('diffRoutineDoc', () => {
  it('an identical save changes nothing', () => {
    const diff = diffRoutineDoc(before(), before());
    expect(diff.routineChanged).toBe(false);
    expect(diff.changed).toEqual([[false, false, false], [false]]);
    expect(diff.removedRows).toBe(0);
  });

  it('stamps only the changed row (sets, reps, rest, rir, exercise, trainer note)', () => {
    for (const over of [
      { sets: 4 },
      { repMin: 5 },
      { repMax: 10 },
      { restSec: 150 },
      { targetRir: 1 },
      { exerciseId: 'leg-press' },
      { trainerNote: 'knees out' },
    ] as Partial<DiffExercise>[]) {
      const after = before();
      dayOf(after, 0).exercises[1] = ex('r2', { exerciseId: 'bench', ...over });
      const diff = diffRoutineDoc(before(), after);
      expect(diff.changed[0]).toEqual([false, true, false]);
      expect(diff.changed[1]).toEqual([false]);
      expect(diff.routineChanged).toBe(true);
    }
  });

  it('treats a blank trainer note like no note', () => {
    const after = before();
    dayOf(after, 0).exercises[0] = ex('r1', { trainerNote: '   ' });
    expect(diffRoutineDoc(before(), after).routineChanged).toBe(false);
  });

  it('a new row is changed, and so is the routine', () => {
    const after = before();
    dayOf(after, 1).exercises.push(ex(undefined, { exerciseId: 'curl' }));
    const diff = diffRoutineDoc(before(), after);
    expect(diff.changed[1]).toEqual([false, true]);
    expect(diff.routineChanged).toBe(true);
  });

  it('a row id that is not stored counts as new', () => {
    const after = before();
    dayOf(after, 0).exercises[0] = ex('not-in-db');
    expect(diffRoutineDoc(before(), after).changed[0]?.[0]).toBe(true);
  });

  it('a pure reorder (rows or days) is not a change', () => {
    const after = doc([
      day('d2', [ex('r4', { exerciseId: 'ohp' })], { name: 'Day B', plannedWeekday: 3 }),
      day('d1', [ex('r3', { exerciseId: 'row' }), ex('r1'), ex('r2', { exerciseId: 'bench' })]),
    ]);
    const diff = diffRoutineDoc(before(), after);
    expect(diff.routineChanged).toBe(false);
    expect(diff.changed).toEqual([[false], [false, false, false]]);
  });

  it('a deleted row changes the routine but no surviving row', () => {
    const after = before();
    dayOf(after, 0).exercises.splice(1, 1);
    const diff = diffRoutineDoc(before(), after);
    expect(diff.removedRows).toBe(1);
    expect(diff.routineChanged).toBe(true);
    expect(diff.changed[0]).toEqual([false, false]);
  });

  it('renamed day, weekday change, removed day and renamed routine each change the routine', () => {
    const renamed = before();
    dayOf(renamed, 0).name = 'Push';
    const weekday = before();
    dayOf(weekday, 1).plannedWeekday = 4;
    const removed = before();
    removed.days.pop();
    const routineName = before();
    routineName.name = 'New plan';
    for (const after of [renamed, weekday, removed, routineName]) {
      expect(diffRoutineDoc(before(), after).routineChanged).toBe(true);
    }
    // ...but none of them marks a row.
    expect(diffRoutineDoc(before(), renamed).changed.flat().some(Boolean)).toBe(false);
  });

  it('a row moved to another day is changed', () => {
    const after = doc([
      day('d1', [ex('r1'), ex('r3', { exerciseId: 'row' })]),
      day('d2', [ex('r2', { exerciseId: 'bench' }), ex('r4', { exerciseId: 'ohp' })], {
        name: 'Day B',
        plannedWeekday: 3,
      }),
    ]);
    const diff = diffRoutineDoc(before(), after);
    expect(diff.changed[1]).toEqual([true, false]);
  });

  describe('supersets', () => {
    const grouped = (): DiffDoc =>
      doc([
        day('d1', [
          ex('r1', { supersetGroup: 'A' }),
          ex('r2', { exerciseId: 'bench', supersetGroup: 'A' }),
          ex('r3', { exerciseId: 'row', supersetGroup: 'B' }),
          ex('r5', { exerciseId: 'curl', supersetGroup: 'B' }),
        ]),
      ]);

    it('renumbered letters with the same partners are not a change', () => {
      // Superset A disappears: B is renormalised to A. r3/r5 keep their partners.
      const stored = grouped();
      const after = grouped();
      dayOf(after, 0).exercises[0] = ex('r1');
      dayOf(after, 0).exercises[1] = ex('r2', { exerciseId: 'bench' });
      rowOf(after, 0, 2).supersetGroup = 'A';
      rowOf(after, 0, 3).supersetGroup = 'A';
      const diff = diffRoutineDoc(stored, after);
      expect(diff.changed[0]).toEqual([true, true, false, false]);
    });

    it('breaking a pair changes both rows; a new partner changes the existing one too', () => {
      const broken = grouped();
      rowOf(broken, 0, 1).supersetGroup = null;
      rowOf(broken, 0, 0).supersetGroup = null;
      expect(diffRoutineDoc(grouped(), broken).changed[0]).toEqual([true, true, false, false]);

      const joined = doc([
        day('d1', [
          ex('r1', { supersetGroup: 'A' }),
          ex('r2', { exerciseId: 'bench', supersetGroup: 'A' }),
          ex(undefined, { exerciseId: 'fly', supersetGroup: 'A' }),
          ex('r3', { exerciseId: 'row', supersetGroup: 'B' }),
          ex('r5', { exerciseId: 'curl', supersetGroup: 'B' }),
        ]),
      ]);
      expect(diffRoutineDoc(grouped(), joined).changed[0]).toEqual([
        true,
        true,
        true,
        false,
        false,
      ]);
    });
  });
});
