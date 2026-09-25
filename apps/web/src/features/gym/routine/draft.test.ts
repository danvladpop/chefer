import { describe, expect, it } from 'vitest';
import type { ExerciseMeta, RoutineDto } from '@chefer/types';
import {
  draftReducer,
  fromRoutineDto,
  isDraftEqual,
  toRoutineDoc,
  type DraftRoutine,
} from './draft';

function meta(overrides: Partial<ExerciseMeta> = {}): ExerciseMeta {
  return {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    category: 'COMPOUND',
    movementPattern: 'vertical-pull',
    equipment: 'CABLE',
    loadType: 'WEIGHTED',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps'],
    repMin: 8,
    repMax: 12,
    restSec: 90,
    incrementKg: 5,
    perHand: false,
    isLowerBody: false,
    isTimed: false,
    swapGroup: null,
    ...overrides,
  };
}

function routineDto(): RoutineDto {
  return {
    id: 'routine-1',
    name: 'Upper/Lower',
    templateKey: 'ul4-intermediate',
    isActive: true,
    nextDayId: null,
    version: 3,
    archived: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        id: 'day-a',
        position: 0,
        name: 'Upper A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 'ex-bench',
            exerciseId: 'barbell-bench-press',
            position: 0,
            sets: 3,
            repMin: 6,
            repMax: 10,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            notes: null,
          },
          {
            id: 'ex-row',
            exerciseId: 'barbell-row',
            position: 1,
            sets: 3,
            repMin: 8,
            repMax: 12,
            targetRir: 2,
            restSec: 90,
            supersetGroup: null,
            notes: null,
          },
        ],
      },
      {
        id: 'day-b',
        position: 1,
        name: 'Lower A',
        plannedWeekday: 2,
        exercises: [
          {
            id: 'ex-squat',
            exerciseId: 'barbell-squat',
            position: 0,
            sets: 4,
            repMin: 5,
            repMax: 8,
            targetRir: 2,
            restSec: 150,
            supersetGroup: null,
            notes: null,
          },
        ],
      },
    ],
  };
}

function draft(): DraftRoutine {
  return fromRoutineDto(routineDto());
}

describe('fromRoutineDto / toRoutineDoc round-trip', () => {
  it('preserves ids and produces an equivalent save payload', () => {
    const d = draft();
    const doc = toRoutineDoc(d);
    expect(doc).toEqual({
      id: 'routine-1',
      name: 'Upper/Lower',
      days: [
        {
          id: 'day-a',
          name: 'Upper A',
          plannedWeekday: 0,
          exercises: [
            {
              id: 'ex-bench',
              exerciseId: 'barbell-bench-press',
              sets: 3,
              repMin: 6,
              repMax: 10,
              targetRir: 2,
              restSec: 120,
              supersetGroup: null,
              notes: null,
            },
            {
              id: 'ex-row',
              exerciseId: 'barbell-row',
              sets: 3,
              repMin: 8,
              repMax: 12,
              targetRir: 2,
              restSec: 90,
              supersetGroup: null,
              notes: null,
            },
          ],
        },
        {
          id: 'day-b',
          name: 'Lower A',
          plannedWeekday: 2,
          exercises: [
            {
              id: 'ex-squat',
              exerciseId: 'barbell-squat',
              sets: 4,
              repMin: 5,
              repMax: 8,
              targetRir: 2,
              restSec: 150,
              supersetGroup: null,
              notes: null,
            },
          ],
        },
      ],
    });
  });

  it('is a no-op fixpoint: unchanged draft equals itself', () => {
    expect(isDraftEqual(draft(), draft())).toBe(true);
  });
});

describe('draftReducer — exercises', () => {
  it('adds a new exercise with no id (server assigns one)', () => {
    const d = draft();
    const next = draftReducer(d, {
      type: 'add_exercise',
      dayKey: d.days[0]!.key,
      exercise: meta(),
    });
    const day = next.days[0]!;
    expect(day.exercises).toHaveLength(3);
    const added = day.exercises[2]!;
    expect(added.id).toBeUndefined();
    expect(added.exerciseId).toBe('lat-pulldown');
    expect(added.sets).toBe(3);

    const doc = toRoutineDoc(next);
    expect(doc.days[0]!.exercises[2]!.id).toBeUndefined();
    // existing rows keep their ids
    expect(doc.days[0]!.exercises[0]!.id).toBe('ex-bench');
  });

  it('removes an exercise', () => {
    const d = draft();
    const [, second] = d.days[0]!.exercises;
    const next = draftReducer(d, {
      type: 'remove_exercise',
      dayKey: d.days[0]!.key,
      exerciseKey: second!.key,
    });
    expect(next.days[0]!.exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press']);
  });

  it('swaps an exercise, keeping its slot id and configuration', () => {
    const d = draft();
    const first = d.days[0]!.exercises[0]!;
    const next = draftReducer(d, {
      type: 'swap_exercise',
      dayKey: d.days[0]!.key,
      exerciseKey: first.key,
      newExerciseId: 'dumbbell-bench-press',
    });
    const swapped = next.days[0]!.exercises[0]!;
    expect(swapped.exerciseId).toBe('dumbbell-bench-press');
    expect(swapped.id).toBe('ex-bench');
    expect(swapped.sets).toBe(3);
  });

  it('updates set/rep/rest/RIR fields', () => {
    const d = draft();
    const target = d.days[0]!.exercises[0]!;
    const next = draftReducer(d, {
      type: 'update_exercise',
      dayKey: d.days[0]!.key,
      exerciseKey: target.key,
      patch: { sets: 5, repMin: 4, repMax: 6, targetRir: 1, restSec: 180 },
    });
    const updated = next.days[0]!.exercises[0]!;
    expect(updated).toMatchObject({ sets: 5, repMin: 4, repMax: 6, targetRir: 1, restSec: 180 });
  });

  it('reorders an exercise within the same day', () => {
    const d = draft();
    const [first, second] = d.days[0]!.exercises;
    const next = draftReducer(d, {
      type: 'move_exercise',
      fromDayKey: d.days[0]!.key,
      exerciseKey: first!.key,
      toDayKey: d.days[0]!.key,
      toIndex: 1,
    });
    expect(next.days[0]!.exercises.map((e) => e.key)).toEqual([second!.key, first!.key]);
  });

  it('moves an exercise across days, preserving its id', () => {
    const d = draft();
    const moved = d.days[0]!.exercises[0]!;
    const next = draftReducer(d, {
      type: 'move_exercise',
      fromDayKey: d.days[0]!.key,
      exerciseKey: moved.key,
      toDayKey: d.days[1]!.key,
      toIndex: 0,
    });
    expect(next.days[0]!.exercises.map((e) => e.exerciseId)).toEqual(['barbell-row']);
    expect(next.days[1]!.exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'barbell-squat',
    ]);
    expect(next.days[1]!.exercises[0]!.id).toBe('ex-bench');

    // The save payload keeps every existing id, so the server updates the
    // row's day rather than re-creating it, and session links survive.
    const doc = toRoutineDoc(next);
    expect(doc.days[1]!.exercises[0]!.id).toBe('ex-bench');
  });

  it('clamps an out-of-range target index instead of throwing', () => {
    const d = draft();
    const moved = d.days[0]!.exercises[0]!;
    const next = draftReducer(d, {
      type: 'move_exercise',
      fromDayKey: d.days[0]!.key,
      exerciseKey: moved.key,
      toDayKey: d.days[1]!.key,
      toIndex: 999,
    });
    expect(next.days[1]!.exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-squat',
      'barbell-bench-press',
    ]);
  });
});

describe('draftReducer — days', () => {
  it('adds a day', () => {
    const d = draft();
    const next = draftReducer(d, { type: 'add_day' });
    expect(next.days).toHaveLength(3);
    expect(next.days[2]!.id).toBeUndefined();
    expect(next.days[2]!.exercises).toEqual([]);
  });

  it('duplicates a day with fresh ids for the day and its exercises', () => {
    const d = draft();
    const next = draftReducer(d, { type: 'duplicate_day', dayKey: d.days[0]!.key });
    expect(next.days).toHaveLength(3);
    const copy = next.days[1]!;
    expect(copy.id).toBeUndefined();
    expect(copy.name).toBe('Upper A copy');
    expect(copy.exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press', 'barbell-row']);
    expect(copy.exercises.every((e) => e.id === undefined)).toBe(true);
  });

  it('deletes a day', () => {
    const d = draft();
    const next = draftReducer(d, { type: 'delete_day', dayKey: d.days[0]!.key });
    expect(next.days.map((day) => day.name)).toEqual(['Lower A']);
  });

  it('renames a day and sets its planned weekday', () => {
    const d = draft();
    let next = draftReducer(d, { type: 'rename_day', dayKey: d.days[0]!.key, name: 'Push' });
    next = draftReducer(next, { type: 'set_day_weekday', dayKey: d.days[0]!.key, weekday: 4 });
    expect(next.days[0]!).toMatchObject({ name: 'Push', plannedWeekday: 4 });
  });

  it('reorders days', () => {
    const d = draft();
    const next = draftReducer(d, { type: 'move_day', fromIndex: 0, toIndex: 1 });
    expect(next.days.map((day) => day.name)).toEqual(['Lower A', 'Upper A']);
  });
});

describe('isDraftEqual', () => {
  it('detects a dirty draft', () => {
    const d = draft();
    const next = draftReducer(d, { type: 'rename_routine', name: 'New name' });
    expect(isDraftEqual(d, next)).toBe(false);
  });
});

describe('draftReducer — supersets (G4-B)', () => {
  const groups = (d: DraftRoutine, day = 0) => d.days[day]!.exercises.map((e) => e.supersetGroup);

  function linked(): DraftRoutine {
    const d = draft();
    return draftReducer(d, {
      type: 'set_superset_with_next',
      dayKey: d.days[0]!.key,
      exerciseKey: d.days[0]!.exercises[0]!.key,
      linked: true,
    });
  }

  it('links and unlinks with the next exercise, and saves the letters', () => {
    const d = linked();
    expect(groups(d)).toEqual(['A', 'A']);
    expect(toRoutineDoc(d).days[0]!.exercises.map((e) => e.supersetGroup)).toEqual(['A', 'A']);
    const off = draftReducer(d, {
      type: 'set_superset_with_next',
      dayKey: d.days[0]!.key,
      exerciseKey: d.days[0]!.exercises[0]!.key,
      linked: false,
    });
    expect(groups(off)).toEqual([null, null]);
  });

  it('removing a member of a pair dissolves the superset', () => {
    const d = linked();
    const next = draftReducer(d, {
      type: 'remove_exercise',
      dayKey: d.days[0]!.key,
      exerciseKey: d.days[0]!.exercises[1]!.key,
    });
    expect(groups(next)).toEqual([null]);
  });

  it('step and drag moves inside the superset keep it', () => {
    const d = linked();
    const [bench, row] = d.days[0]!.exercises;
    const stepped = draftReducer(d, {
      type: 'step_exercise',
      dayKey: d.days[0]!.key,
      exerciseKey: row!.key,
      direction: 'up',
    });
    expect(stepped.days[0]!.exercises.map((e) => e.key)).toEqual([row!.key, bench!.key]);
    expect(groups(stepped)).toEqual(['A', 'A']);

    const dragged = draftReducer(d, {
      type: 'move_exercise',
      fromDayKey: d.days[0]!.key,
      exerciseKey: bench!.key,
      toDayKey: d.days[0]!.key,
      toIndex: 1,
    });
    expect(groups(dragged)).toEqual(['A', 'A']);
  });

  it('a cross-day move leaves the superset on both sides', () => {
    const d = linked();
    const next = draftReducer(d, {
      type: 'move_exercise',
      fromDayKey: d.days[0]!.key,
      exerciseKey: d.days[0]!.exercises[0]!.key,
      toDayKey: d.days[1]!.key,
      toIndex: 0,
    });
    expect(groups(next, 0)).toEqual([null]);
    expect(groups(next, 1)).toEqual([null, null]);
  });

  it('loads stray server letters in canonical form', () => {
    const dto = routineDto();
    dto.days[0]!.exercises[0]!.supersetGroup = 'Q';
    dto.days[0]!.exercises[1]!.supersetGroup = 'Q';
    dto.days[1]!.exercises[0]!.supersetGroup = 'Z';
    const d = fromRoutineDto(dto);
    expect(groups(d, 0)).toEqual(['A', 'A']);
    expect(groups(d, 1)).toEqual([null]);
  });
});
