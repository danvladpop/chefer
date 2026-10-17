import { describe, expect, it } from 'vitest';
import { mergeRoutineChanges, summarizeRoutineChanges, type ChangeDay } from './routine-changes';

const names: Record<string, string> = {
  squat: 'Squat',
  bench: 'Bench press',
  rdl: 'Romanian deadlift',
  lunge: 'Lunge',
};
const nameOf = (id: string) => names[id] ?? 'Exercise';

const row = (id: string, exerciseId: string, sets = 3, repMin = 8, repMax = 8, note: string | null = null) => ({
  id,
  exerciseId,
  sets,
  repMin,
  repMax,
  trainerNote: note,
});

const before: ChangeDay[] = [
  { id: 'd1', name: 'Upper', plannedWeekday: 1, exercises: [row('r1', 'squat'), row('r2', 'bench')] },
];

describe('summarizeRoutineChanges', () => {
  it('lists added, changed and noted rows in plain words', () => {
    const after: ChangeDay[] = [
      {
        id: 'd1',
        name: 'Upper',
        plannedWeekday: 1,
        exercises: [
          row('r1', 'squat', 4, 6, 6),
          row('r2', 'bench', 3, 8, 8, 'Pause at the bottom'),
          { exerciseId: 'rdl', sets: 3, repMin: 8, repMax: 10, trainerNote: null },
        ],
      },
    ];
    expect(summarizeRoutineChanges(before, after, nameOf)).toEqual([
      { kind: 'changed', exercise: 'Squat', from: '3×8', to: '4×6' },
      { kind: 'note', exercise: 'Bench press' },
      { kind: 'added', exercise: 'Romanian deadlift' },
    ]);
  });

  it('lists removed rows and schedule changes, and ignores a pure reorder', () => {
    const after: ChangeDay[] = [
      { id: 'd1', name: 'Upper', plannedWeekday: 2, exercises: [row('r1', 'squat')] },
    ];
    expect(summarizeRoutineChanges(before, after, nameOf)).toEqual([
      { kind: 'removed', exercise: 'Bench press' },
      { kind: 'schedule' },
    ]);
    const reordered: ChangeDay[] = [
      { id: 'd1', name: 'Upper', plannedWeekday: 1, exercises: [row('r2', 'bench'), row('r1', 'squat')] },
    ];
    expect(summarizeRoutineChanges(before, reordered, nameOf)).toEqual([]);
  });

  it('a swapped exercise on the same row reads as one out, one in', () => {
    const after: ChangeDay[] = [
      { id: 'd1', name: 'Upper', plannedWeekday: 1, exercises: [row('r1', 'lunge'), row('r2', 'bench')] },
    ];
    expect(summarizeRoutineChanges(before, after, nameOf)).toEqual([
      { kind: 'removed', exercise: 'Squat' },
      { kind: 'added', exercise: 'Lunge' },
    ]);
  });

  it('clearing a note is not news; a new day is a schedule change', () => {
    const withNote: ChangeDay[] = [
      { id: 'd1', name: 'Upper', plannedWeekday: 1, exercises: [row('r1', 'squat', 3, 8, 8, 'x')] },
    ];
    const cleared: ChangeDay[] = [
      { id: 'd1', name: 'Upper', plannedWeekday: 1, exercises: [row('r1', 'squat')] },
      { name: 'Lower', plannedWeekday: 3, exercises: [] },
    ];
    expect(summarizeRoutineChanges(withNote, cleared, nameOf)).toEqual([{ kind: 'schedule' }]);
  });
});

describe('mergeRoutineChanges', () => {
  it('keeps the first "from" and the last "to", and drops a change that went back', () => {
    expect(
      mergeRoutineChanges(
        [{ kind: 'changed', exercise: 'Squat', from: '3×8', to: '4×6' }],
        [{ kind: 'changed', exercise: 'Squat', from: '4×6', to: '5×5' }],
      ),
    ).toEqual([{ kind: 'changed', exercise: 'Squat', from: '3×8', to: '5×5' }]);
    expect(
      mergeRoutineChanges(
        [{ kind: 'changed', exercise: 'Squat', from: '3×8', to: '4×6' }],
        [{ kind: 'changed', exercise: 'Squat', from: '4×6', to: '3×8' }],
      ),
    ).toEqual([]);
  });

  it('an add then a remove cancel out; duplicates collapse; the list is capped', () => {
    expect(
      mergeRoutineChanges(
        [{ kind: 'added', exercise: 'Lunge' }, { kind: 'schedule' }],
        [{ kind: 'removed', exercise: 'Lunge' }, { kind: 'schedule' }, { kind: 'note', exercise: 'Squat' }],
      ),
    ).toEqual([{ kind: 'schedule' }, { kind: 'note', exercise: 'Squat' }]);
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'added' as const, exercise: `E${i}` }));
    expect(mergeRoutineChanges([], many, 20)).toHaveLength(20);
  });

  it('a row added earlier stays "+ Exercise" whatever changed on it since', () => {
    expect(
      mergeRoutineChanges(
        [{ kind: 'added', exercise: 'Lunge' }],
        [
          { kind: 'changed', exercise: 'Lunge', from: '3×8', to: '4×6' },
          { kind: 'note', exercise: 'Lunge' },
        ],
      ),
    ).toEqual([{ kind: 'added', exercise: 'Lunge' }]);
  });

  it('treats null as nothing seen yet', () => {
    expect(mergeRoutineChanges(null, [{ kind: 'created' }])).toEqual([{ kind: 'created' }]);
  });
});
