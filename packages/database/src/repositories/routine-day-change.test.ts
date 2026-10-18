import { describe, expect, it } from 'vitest';
import { dayExercisesChanged, type DayExerciseShape } from './routine-day-change';

const row = (over: Partial<DayExerciseShape> = {}): DayExerciseShape => ({
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

describe('dayExercisesChanged', () => {
  it('the same rows in the same order: unchanged', () => {
    expect(
      dayExercisesChanged([row(), row({ exerciseId: 'row' })], [row(), row({ exerciseId: 'row' })]),
    ).toBe(false);
    expect(dayExercisesChanged([], [])).toBe(false);
  });

  it('an added or removed row is a change', () => {
    expect(dayExercisesChanged([row()], [row(), row({ exerciseId: 'row' })])).toBe(true);
    expect(dayExercisesChanged([row(), row({ exerciseId: 'row' })], [row()])).toBe(true);
  });

  it('a reorder is a change', () => {
    const a = row();
    const b = row({ exerciseId: 'row' });
    expect(dayExercisesChanged([a, b], [b, a])).toBe(true);
  });

  it.each([
    ['exerciseId', { exerciseId: 'bench' }],
    ['sets', { sets: 4 }],
    ['repMin', { repMin: 5 }],
    ['repMax', { repMax: 10 }],
    ['targetRir', { targetRir: 1 }],
    ['restSec', { restSec: 90 }],
    ['supersetGroup', { supersetGroup: 'A' }],
    ['trainerNote', { trainerNote: 'Slow down' }],
  ] as const)('a changed %s is a change', (_f, over) => {
    expect(dayExercisesChanged([row()], [row(over)])).toBe(true);
  });

  it('only the listed fields count (row ids, the owner note and stamps do not)', () => {
    const stored = { ...row(), id: 'r1', notes: 'mine', lastEditedAt: new Date(0) };
    const next = { ...row(), id: undefined, notes: 'changed', lastEditedAt: null };
    expect(dayExercisesChanged([stored], [next])).toBe(false);
  });
});
