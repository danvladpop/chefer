import { describe, expect, it } from 'vitest';
import type { SessionExerciseDoc, WorkoutSessionDoc } from '@chefer/types';
import {
  carryOverItemsFrom,
  consumeCarryOver,
  mergeCarryOver,
  nextCarryOver,
  unstartedExercises,
  type CarryOverItem,
} from './carry-over';

function set(completed: boolean, position = 0) {
  return {
    id: `set-${String(position)}-${completed ? 'done' : 'open'}`,
    position,
    weightKg: 40,
    reps: 8,
    isWarmup: false,
    completedAt: completed ? '2026-09-27T10:00:00.000Z' : null,
  };
}

function exercise(
  id: string,
  exerciseId: string,
  opts: { skipped?: boolean; sets?: ReturnType<typeof set>[] } = {},
): SessionExerciseDoc {
  return {
    id,
    exerciseId,
    routineExerciseId: `re-${id}`,
    position: 0,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSec: 120,
    skipped: opts.skipped ?? false,
    swappedFromId: null,
    lastSetRir: null,
    prescription: {
      kind: 'start',
      weightKg: 40,
      reps: [8, 8, 8],
      sets: 3,
      reasonCode: 'START',
      inputs: {},
      deltaKg: 0,
      engineVersion: 3,
    },
    notes: null,
    sets: opts.sets ?? [set(false)],
  };
}

function doc(overrides: Partial<WorkoutSessionDoc> = {}): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: 'sess-1',
    routineId: 'r1',
    routineDayId: 'dA',
    name: 'Upper',
    status: 'COMPLETED',
    startedAt: '2026-09-27T09:00:00.000Z',
    finishedAt: '2026-09-27T10:00:00.000Z',
    localDate: '2026-09-27',
    isDeload: false,
    notes: null,
    clientUpdatedAt: '2026-09-27T10:00:00.000Z',
    engineVersion: 3,
    exercises: [exercise('e1', 'barbell-bench-press', { sets: [set(true)] })],
    ...overrides,
  };
}

describe('unstartedExercises', () => {
  it('finds exercises with zero logged sets, in position order', () => {
    const d = doc({
      exercises: [
        { ...exercise('e2', 'dumbbell-bench-press'), position: 1 },
        { ...exercise('e1', 'barbell-bench-press', { sets: [set(true)] }), position: 0 },
        { ...exercise('e3', 'seated-leg-curl'), position: 2 },
      ],
    });
    expect(unstartedExercises(d).map((e) => e.exerciseId)).toEqual([
      'dumbbell-bench-press',
      'seated-leg-curl',
    ]);
  });

  it('never counts a skipped exercise as unstarted', () => {
    const d = doc({ exercises: [exercise('e2', 'dumbbell-bench-press', { skipped: true })] });
    expect(unstartedExercises(d)).toEqual([]);
  });

  it('does not count a partially-logged exercise as unstarted', () => {
    const d = doc({
      exercises: [exercise('e2', 'dumbbell-bench-press', { sets: [set(true, 0), set(false, 1)] })],
    });
    expect(unstartedExercises(d)).toEqual([]);
  });
});

describe('carryOverItemsFrom', () => {
  it('builds one item per carryOverExerciseIds entry, tagged with the session and its day', () => {
    const d = doc({ carryOverExerciseIds: ['dumbbell-bench-press', 'seated-leg-curl'] });
    expect(carryOverItemsFrom(d)).toEqual([
      { exerciseId: 'dumbbell-bench-press', fromSessionId: 'sess-1', routineDayId: 'dA' },
      { exerciseId: 'seated-leg-curl', fromSessionId: 'sess-1', routineDayId: 'dA' },
    ]);
  });

  it('is empty for a freestyle session (no routineDayId) — edge case in UX-36', () => {
    const d = doc({ routineDayId: null, carryOverExerciseIds: ['dumbbell-bench-press'] });
    expect(carryOverItemsFrom(d)).toEqual([]);
  });

  it('is empty when nothing was flagged, or the doc is not COMPLETED', () => {
    expect(carryOverItemsFrom(doc())).toEqual([]);
    expect(carryOverItemsFrom(doc({ status: 'DISCARDED', carryOverExerciseIds: ['e'] }))).toEqual(
      [],
    );
  });
});

describe('mergeCarryOver', () => {
  it('moves a re-carried exercise to the front with its newer session', () => {
    const existing: CarryOverItem[] = [
      { exerciseId: 'a', fromSessionId: 's1', routineDayId: 'd1' },
      { exerciseId: 'b', fromSessionId: 's1', routineDayId: 'd1' },
    ];
    const incoming: CarryOverItem[] = [
      { exerciseId: 'a', fromSessionId: 's2', routineDayId: 'd2' },
    ];
    expect(mergeCarryOver(existing, incoming)).toEqual([
      { exerciseId: 'a', fromSessionId: 's2', routineDayId: 'd2' },
      { exerciseId: 'b', fromSessionId: 's1', routineDayId: 'd1' },
    ]);
  });

  it('caps the list so a long stall cannot grow it without bound', () => {
    const existing: CarryOverItem[] = Array.from({ length: 20 }, (_, i) => ({
      exerciseId: `e${String(i)}`,
      fromSessionId: 's1',
      routineDayId: 'd1',
    }));
    const incoming: CarryOverItem[] = [
      { exerciseId: 'new', fromSessionId: 's2', routineDayId: 'd1' },
    ];
    const merged = mergeCarryOver(existing, incoming);
    expect(merged).toHaveLength(20);
    expect(merged[0]?.exerciseId).toBe('new');
  });
});

describe('consumeCarryOver', () => {
  it('drops any item this newly-completed doc addressed, done or skipped again', () => {
    const existing: CarryOverItem[] = [
      { exerciseId: 'dumbbell-bench-press', fromSessionId: 's0', routineDayId: 'dA' },
      { exerciseId: 'untouched', fromSessionId: 's0', routineDayId: 'dA' },
    ];
    const d = doc({
      exercises: [exercise('e2', 'dumbbell-bench-press', { skipped: true, sets: [] })],
    });
    expect(consumeCarryOver(existing, d)).toEqual([
      { exerciseId: 'untouched', fromSessionId: 's0', routineDayId: 'dA' },
    ]);
  });
});

describe('nextCarryOver', () => {
  it('consumes what a session addressed and adds what it newly carries over, idempotently', () => {
    const existing: CarryOverItem[] = [
      { exerciseId: 'dumbbell-bench-press', fromSessionId: 's0', routineDayId: 'dA' },
    ];
    const d = doc({
      exercises: [
        exercise('e1', 'dumbbell-bench-press', { sets: [set(true)] }),
        exercise('e2', 'seated-leg-curl'),
      ],
      carryOverExerciseIds: ['seated-leg-curl'],
    });
    const once = nextCarryOver(existing, d);
    expect(once).toEqual([
      { exerciseId: 'seated-leg-curl', fromSessionId: 'sess-1', routineDayId: 'dA' },
    ]);
    // A re-send of the same doc (offline retry) must not duplicate the entry.
    expect(nextCarryOver(once, d)).toEqual(once);
  });
});
