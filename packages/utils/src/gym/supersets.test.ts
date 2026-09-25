import { describe, expect, it } from 'vitest';
import type { RoutineDto, SessionExerciseDoc, Suggestion, WorkoutSessionDoc } from '@chefer/types';
import {
  isSupersetWithNext,
  moveSupersetItem,
  moveSupersetItemTo,
  normalizeSupersets,
  removeSupersetItem,
  sessionSupersets,
  setSupersetWithNext,
  setTickOutcome,
  supersetGroupLookup,
  supersetRuns,
  supersetSlot,
  workoutFocus,
} from './supersets';

type Row = { key: string; supersetGroup: string | null };

/** 'a b c' with optional ':X' letters → rows. */
function rows(spec: string): Row[] {
  return spec.split(' ').map((token) => {
    const [key = '', group] = token.split(':');
    return { key, supersetGroup: group ?? null };
  });
}

/** Rows → the same compact spec, for readable assertions. */
function spec(list: Row[]): string {
  return list.map((r) => (r.supersetGroup ? `${r.key}:${r.supersetGroup}` : r.key)).join(' ');
}

describe('normalizeSupersets / supersetRuns', () => {
  it('relabels runs A, B… in order and clears lone letters', () => {
    expect(spec(normalizeSupersets(rows('a:Q b:Q c d:Z e:X f:X')))).toBe('a:A b:A c d e:B f:B');
  });

  it('splits one letter used by two separate runs into two supersets', () => {
    expect(spec(normalizeSupersets(rows('a:A b:A c d:A e:A')))).toBe('a:A b:A c d:B e:B');
  });

  it('keeps the identity of rows that are already canonical', () => {
    const list = rows('a:A b:A c');
    const out = normalizeSupersets(list);
    expect(out[0]).toBe(list[0]);
    expect(out[2]).toBe(list[2]);
  });

  it('reports runs and slots', () => {
    const list = rows('a b:A c:A d:A e');
    expect(supersetRuns(list)).toEqual([{ label: 'A', start: 1, end: 3 }]);
    expect(supersetSlot(list, 2)).toEqual({ label: 'A', position: 1, size: 3 });
    expect(supersetSlot(list, 0)).toBeNull();
  });
});

describe('setSupersetWithNext (link / unlink)', () => {
  it('links two plain exercises into a new superset', () => {
    const out = setSupersetWithNext(rows('a b c'), 0, true);
    expect(spec(out)).toBe('a:A b:A c');
    expect(isSupersetWithNext(out, 0)).toBe(true);
    expect(isSupersetWithNext(out, 1)).toBe(false);
  });

  it('extends an existing superset into a tri-set, and merges two supersets', () => {
    expect(spec(setSupersetWithNext(rows('a:A b:A c'), 1, true))).toBe('a:A b:A c:A');
    expect(spec(setSupersetWithNext(rows('a:A b:A c:B d:B'), 1, true))).toBe('a:A b:A c:A d:A');
  });

  it('labels a later superset B when an earlier one exists', () => {
    expect(spec(setSupersetWithNext(rows('a:A b:A c d'), 2, true))).toBe('a:A b:A c:B d:B');
  });

  it('unlinks a pair back to plain exercises', () => {
    expect(spec(setSupersetWithNext(rows('a:A b:A c'), 0, false))).toBe('a b c');
  });

  it('unlinks the middle of a group of four into two pairs', () => {
    expect(spec(setSupersetWithNext(rows('a:A b:A c:A d:A'), 1, false))).toBe('a:A b:A c:B d:B');
  });

  it('unlinking the tail of a tri-set leaves a pair', () => {
    expect(spec(setSupersetWithNext(rows('a:A b:A c:A'), 1, false))).toBe('a:A b:A c');
  });

  it('ignores the last row and no-op toggles', () => {
    expect(spec(setSupersetWithNext(rows('a b'), 1, true))).toBe('a b');
    expect(spec(setSupersetWithNext(rows('a:A b:A'), 0, true))).toBe('a:A b:A');
    expect(spec(setSupersetWithNext(rows('a b'), 0, false))).toBe('a b');
  });
});

describe('removeSupersetItem', () => {
  it('keeps the rest of a tri-set together', () => {
    expect(spec(removeSupersetItem(rows('a:A b:A c:A d'), 1))).toBe('a:A c:A d');
  });

  it('dissolves a pair left with one exercise and relabels later supersets', () => {
    expect(spec(removeSupersetItem(rows('a:A b:A c d:B e:B'), 0))).toBe('b c d:A e:A');
  });
});

describe('moveSupersetItem (step up / down)', () => {
  it('swaps inside a superset and keeps it', () => {
    expect(spec(moveSupersetItem(rows('a:A b:A c'), 1, 'up'))).toBe('b:A a:A c');
  });

  it('an edge member stepping out leaves its superset', () => {
    expect(spec(moveSupersetItem(rows('a:A b:A c:A d'), 2, 'down'))).toBe('a:A b:A d c');
    expect(spec(moveSupersetItem(rows('a:A b:A c'), 1, 'down'))).toBe('a c b');
  });

  it('hops over a neighbouring superset as a whole instead of cutting it', () => {
    expect(spec(moveSupersetItem(rows('a:A b:A c'), 2, 'up'))).toBe('c a:A b:A');
    expect(spec(moveSupersetItem(rows('c a:A b:A'), 0, 'down'))).toBe('a:A b:A c');
  });

  it('plain moves stay plain, and out-of-range moves change nothing', () => {
    expect(spec(moveSupersetItem(rows('a b c'), 1, 'up'))).toBe('b a c');
    expect(spec(moveSupersetItem(rows('a b'), 0, 'up'))).toBe('a b');
  });
});

describe('moveSupersetItemTo (drag and drop)', () => {
  it('dropping between two members joins the superset', () => {
    // rest = b:A c:A → insert d at 1.
    expect(spec(moveSupersetItemTo(rows('d b:A c:A'), 0, 1))).toBe('b:A d:A c:A');
  });

  it('reordering next to its own superset keeps it', () => {
    expect(spec(moveSupersetItemTo(rows('a:A b:A c'), 0, 1))).toBe('b:A a:A c');
  });

  it('dragging away leaves the superset (which dissolves at one)', () => {
    expect(spec(moveSupersetItemTo(rows('a:A b:A c d'), 0, 3))).toBe('b c d a');
  });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

const SUGGESTION: Suggestion = {
  kind: 'hold',
  weightKg: 50,
  reps: [10, 10, 10],
  sets: 3,
  reasonCode: 'ADD_REPS',
  inputs: { repMin: 8, repMax: 12 },
  deltaKg: 0,
  engineVersion: 1,
};

function exercise(
  id: string,
  position: number,
  opts: {
    routineExerciseId?: string | null;
    sets?: number;
    restSec?: number;
    warmup?: boolean;
  } = {},
): SessionExerciseDoc {
  const count = opts.sets ?? 3;
  const warm = opts.warmup
    ? [{ id: `${id}-w`, position: 0, weightKg: 20, reps: 8, isWarmup: true, completedAt: null }]
    : [];
  return {
    id,
    exerciseId: `ex-${id}`,
    routineExerciseId: opts.routineExerciseId === undefined ? `re-${id}` : opts.routineExerciseId,
    position,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: opts.restSec ?? 90,
    skipped: false,
    swappedFromId: null,
    lastSetRir: null,
    prescription: SUGGESTION,
    notes: null,
    sets: [
      ...warm,
      ...Array.from({ length: count }, (_, i) => ({
        id: `${id}-${i + 1}`,
        position: warm.length + i,
        weightKg: 50,
        reps: 10,
        isWarmup: false,
        completedAt: null,
      })),
    ],
  };
}

function session(exercises: SessionExerciseDoc[]): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: 'session',
    routineId: 'r',
    routineDayId: 'd',
    name: 'Upper',
    status: 'IN_PROGRESS',
    startedAt: '2026-09-25T10:00:00.000Z',
    finishedAt: null,
    localDate: '2026-09-25',
    isDeload: false,
    notes: null,
    clientUpdatedAt: '2026-09-25T10:00:00.000Z',
    engineVersion: 1,
    exercises,
  };
}

function tick(doc: WorkoutSessionDoc, setId: string): WorkoutSessionDoc {
  return {
    ...doc,
    exercises: doc.exercises.map((se) => ({
      ...se,
      sets: se.sets.map((s) =>
        s.id === setId ? { ...s, completedAt: '2026-09-25T10:05:00Z' } : s,
      ),
    })),
  };
}

const groups: Record<string, string> = { 're-a1': 'A', 're-a2': 'A' };
const groupOf = (id: string) => groups[id] ?? null;

describe('supersetGroupLookup', () => {
  it('reads letters from the active routine, falling back to the next workout', () => {
    const routine = {
      days: [
        {
          exercises: [
            { id: 're-1', supersetGroup: 'A' },
            { id: 're-2', supersetGroup: null },
          ],
        },
      ],
    } as unknown as RoutineDto;
    const lookup = supersetGroupLookup({
      activeRoutine: routine,
      nextWorkout: {
        exercises: [
          { routineExerciseId: 're-2', supersetGroup: 'B' },
          { routineExerciseId: 're-3', supersetGroup: 'C' },
        ],
      } as never,
    });
    expect(lookup('re-1')).toBe('A');
    expect(lookup('re-2')).toBeNull(); // the routine wins
    expect(lookup('re-3')).toBe('C');
    expect(lookup('nope')).toBeNull();
  });
});

describe('sessionSupersets', () => {
  it('groups adjacent routine slots with the same letter, in session order', () => {
    const doc = session([exercise('a1', 0), exercise('a2', 1), exercise('c', 2)]);
    const map = sessionSupersets(doc.exercises, groupOf);
    expect(map.get('a1')).toEqual({ label: 'A', index: 0, size: 2, memberIds: ['a1', 'a2'] });
    expect(map.get('a2')?.index).toBe(1);
    expect(map.has('c')).toBe(false);
  });

  it('ignores exercises added mid-session and partners moved apart', () => {
    const added = session([
      exercise('a1', 0),
      exercise('x', 1, { routineExerciseId: null }),
      exercise('a2', 2),
    ]);
    expect(sessionSupersets(added.exercises, groupOf).size).toBe(0);
    expect(sessionSupersets(added.exercises, null).size).toBe(0);
  });
});

describe('setTickOutcome + workoutFocus (superset rounds)', () => {
  const start = session([
    exercise('a1', 0, { restSec: 120, warmup: true }),
    exercise('a2', 1, { restSec: 75 }),
    exercise('c', 2, { restSec: 60 }),
  ]);
  const map = sessionSupersets(start.exercises, groupOf);

  it('A1 set 1 → advance to A2 set 1 with no rest', () => {
    const doc = tick(start, 'a1-1');
    expect(setTickOutcome(doc, map, 'a1', 'a1-1')).toEqual({
      kind: 'advance',
      seId: 'a2',
      setId: 'a2-1',
    });
    expect(workoutFocus(doc, map)).toEqual({ seId: 'a2', setId: 'a2-1' });
  });

  it('the last exercise of the round starts the rest (the superset’s last rest)', () => {
    const doc = tick(tick(start, 'a1-1'), 'a2-1');
    expect(setTickOutcome(doc, map, 'a2', 'a2-1')).toEqual({
      kind: 'rest',
      restSec: 75,
      seId: 'a2',
    });
    expect(workoutFocus(doc, map)).toEqual({ seId: 'a1', setId: 'a1-2' });
  });

  it('out-of-order ticks wrap back to the member still missing that round', () => {
    const doc = tick(start, 'a2-1');
    expect(setTickOutcome(doc, map, 'a2', 'a2-1')).toEqual({
      kind: 'advance',
      seId: 'a1',
      setId: 'a1-1',
    });
  });

  it('skipped members drop out of the round', () => {
    const skipped: WorkoutSessionDoc = {
      ...start,
      exercises: start.exercises.map((e) => (e.id === 'a2' ? { ...e, skipped: true } : e)),
    };
    const doc = tick(skipped, 'a1-1');
    expect(setTickOutcome(doc, map, 'a1', 'a1-1')).toEqual({
      kind: 'rest',
      restSec: 120,
      seId: 'a1',
    });
  });

  it('uneven set counts: the extra set rests straight away', () => {
    const uneven = session([
      exercise('a1', 0, { sets: 4 }),
      exercise('a2', 1, { sets: 3, restSec: 45 }),
    ]);
    const m = sessionSupersets(uneven.exercises, groupOf);
    let doc = uneven;
    for (const id of ['a1-1', 'a2-1', 'a1-2', 'a2-2', 'a1-3', 'a2-3']) doc = tick(doc, id);
    expect(workoutFocus(doc, m)).toEqual({ seId: 'a1', setId: 'a1-4' });
    doc = tick(doc, 'a1-4');
    expect(setTickOutcome(doc, m, 'a1', 'a1-4')).toEqual({ kind: 'rest', restSec: 45, seId: 'a1' });
    expect(workoutFocus(doc, m)).toBeNull();
  });

  it('plain exercises rest with their own rest; warm-ups never rest', () => {
    const doc = tick(tick(start, 'c-1'), 'a1-w');
    expect(setTickOutcome(doc, map, 'c', 'c-1')).toEqual({ kind: 'rest', restSec: 60, seId: 'c' });
    expect(setTickOutcome(doc, map, 'a1', 'a1-w')).toEqual({ kind: 'none' });
    expect(setTickOutcome(doc, map, 'nope', 'x')).toEqual({ kind: 'none' });
  });

  it('without supersets the focus is the first unticked working set in order', () => {
    const plain = new Map();
    const doc = tick(start, 'a1-1');
    expect(workoutFocus(doc, plain)).toEqual({ seId: 'a1', setId: 'a1-2' });
  });
});
