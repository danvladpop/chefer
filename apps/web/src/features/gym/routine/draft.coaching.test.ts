import { describe, expect, it } from 'vitest';
import {
  routineDocSchema,
  trainerRoutineDocSchema,
  type RoutineDto,
  type TrainerRoutineDto,
} from '@chefer/types';
import {
  clearedTrainerNoteIds,
  draftReducer,
  fromRoutineDto,
  fromTrainerRoutineDto,
  isDraftEqual,
  toRoutineDoc,
  toTrainerRoutineDoc,
} from './draft';

// Trainer coaching seams of the shared routine draft (WP-18 lane B).

function ownRoutine(trainerNote: string | null): RoutineDto {
  return {
    id: 'r1',
    name: 'Push Pull Legs',
    templateKey: null,
    isActive: true,
    nextDayId: 'd1',
    version: 4,
    archived: false,
    updatedAt: '2026-10-02T10:00:00.000Z',
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 're1',
            exerciseId: 'back-squat',
            position: 0,
            sets: 3,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            notes: 'my own note',
            trainerNote,
          },
          {
            id: 're2',
            exerciseId: 'seated-leg-curl',
            position: 1,
            sets: 3,
            repMin: 10,
            repMax: 12,
            targetRir: 2,
            restSec: 90,
            supersetGroup: null,
            notes: null,
          },
        ],
      },
    ],
  };
}

function trainerRoutine(): TrainerRoutineDto {
  return {
    id: 'r1',
    name: 'Push Pull Legs',
    templateKey: null,
    version: 4,
    nextDayId: 'd1',
    updatedAt: '2026-10-02T10:00:00.000Z',
    lastEditedByOther: null,
    exercises: [],
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 're1',
            exerciseId: 'back-squat',
            position: 0,
            sets: 3,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            trainerNote: 'knees out',
            lastEditedByOther: null,
            next: null,
          },
        ],
      },
    ],
  };
}

describe('owner draft with trainer notes', () => {
  it('reads the trainer note from the routine but never writes it in the owner document', () => {
    const draft = fromRoutineDto(ownRoutine('knees out'));
    expect(draft.days[0]?.exercises[0]?.trainerNote).toBe('knees out');
    expect(draft.days[0]?.exercises[1]?.trainerNote).toBeNull();
    const doc = toRoutineDoc(draft);
    expect(JSON.stringify(doc)).not.toContain('trainerNote');
    expect(routineDocSchema.safeParse(doc).success).toBe(true);
  });

  it('removing a note is a change, and names exactly the rows whose note was removed', () => {
    const baseline = fromRoutineDto(ownRoutine('knees out'));
    const dayKey = baseline.days[0]!.key;
    const exerciseKey = baseline.days[0]!.exercises[0]!.key;
    expect(clearedTrainerNoteIds(baseline, baseline)).toEqual([]);

    const draft = draftReducer(baseline, {
      type: 'update_exercise',
      dayKey,
      exerciseKey,
      patch: { trainerNote: null },
    });
    expect(isDraftEqual(draft, baseline)).toBe(false);
    expect(clearedTrainerNoteIds(draft, baseline)).toEqual(['re1']);
  });

  it('a removed row is not reported as a cleared note', () => {
    const baseline = fromRoutineDto(ownRoutine('knees out'));
    const dayKey = baseline.days[0]!.key;
    const exerciseKey = baseline.days[0]!.exercises[0]!.key;
    const draft = draftReducer(baseline, { type: 'remove_exercise', dayKey, exerciseKey });
    expect(clearedTrainerNoteIds(draft, baseline)).toEqual([]);
  });

  it('an unchanged draft is equal (no phantom dirty flag from notes)', () => {
    expect(isDraftEqual(fromRoutineDto(ownRoutine('x')), fromRoutineDto(ownRoutine('x')))).toBe(
      true,
    );
  });
});

describe('trainer draft', () => {
  it("builds the draft from the trainer routine without the client's own notes", () => {
    const draft = fromTrainerRoutineDto(trainerRoutine());
    const exercise = draft.days[0]!.exercises[0]!;
    expect(exercise.notes).toBeNull();
    expect(exercise.trainerNote).toBe('knees out');
  });

  it('saves a document with the note, trimmed, and no `notes`', () => {
    const baseline = fromTrainerRoutineDto(trainerRoutine());
    const dayKey = baseline.days[0]!.key;
    const exerciseKey = baseline.days[0]!.exercises[0]!.key;
    const draft = draftReducer(baseline, {
      type: 'update_exercise',
      dayKey,
      exerciseKey,
      patch: { trainerNote: '  knees out, slow eccentric  ' },
    });
    const doc = toTrainerRoutineDoc(draft);
    expect(doc.days[0]?.exercises[0]?.trainerNote).toBe('knees out, slow eccentric');
    expect(doc.days[0]?.exercises[0]).not.toHaveProperty('notes');
    expect(doc.days[0]?.exercises[0]?.id).toBe('re1');
    expect(trainerRoutineDocSchema.safeParse(doc).success).toBe(true);
  });

  it('an empty or blank note becomes null; a new row has no id', () => {
    const baseline = fromTrainerRoutineDto(trainerRoutine());
    const dayKey = baseline.days[0]!.key;
    const exerciseKey = baseline.days[0]!.exercises[0]!.key;
    let draft = draftReducer(baseline, {
      type: 'update_exercise',
      dayKey,
      exerciseKey,
      patch: { trainerNote: '   ' },
    });
    draft = draftReducer(draft, { type: 'duplicate_day', dayKey });
    const doc = toTrainerRoutineDoc(draft);
    expect(doc.days[0]?.exercises[0]?.trainerNote).toBeNull();
    expect(doc.days[1]).not.toHaveProperty('id');
    expect(doc.days[1]?.exercises[0]).not.toHaveProperty('id');
  });

  it('adopts the other version from a conflict with its trainer notes intact', () => {
    const draft = fromRoutineDto(ownRoutine('keep the bar tight'));
    expect(toTrainerRoutineDoc(draft).days[0]?.exercises[0]?.trainerNote).toBe(
      'keep the bar tight',
    );
  });
});
