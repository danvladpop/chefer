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

// PRD 2026-10 §4.3: a "Keep it simple" client's My week days carry a workout type.
describe('trainer draft: workout types (My week)', () => {
  function withYogaDay(): TrainerRoutineDto {
    const routine = trainerRoutine();
    return {
      ...routine,
      days: [
        ...routine.days,
        {
          id: 'd2',
          position: 1,
          name: 'Yoga',
          plannedWeekday: 1,
          workoutType: 'YOGA',
          exercises: [],
        },
      ],
    };
  }

  it('keeps a type-only day through load and save, and the doc is valid', () => {
    const doc = toTrainerRoutineDoc(fromTrainerRoutineDto(withYogaDay()));
    expect(doc.days[1]).toEqual({
      id: 'd2',
      name: 'Yoga',
      plannedWeekday: 1,
      workoutType: 'YOGA',
      exercises: [],
    });
    expect(doc.days[0]?.workoutType).toBeNull();
    expect(trainerRoutineDocSchema.safeParse(doc).success).toBe(true);
  });

  it('setting a type is a change; an exercise-less day takes the type as its name', () => {
    const baseline = fromTrainerRoutineDto(withYogaDay());
    let draft = draftReducer(baseline, { type: 'add_day' });
    const added = draft.days[2]!;
    draft = draftReducer(draft, {
      type: 'set_day_workout_type',
      dayKey: added.key,
      workoutType: 'PILATES',
    });
    draft = draftReducer(draft, {
      type: 'set_day_workout_type',
      dayKey: baseline.days[0]!.key,
      workoutType: 'LOWER_BODY',
    });
    expect(isDraftEqual(draft, baseline)).toBe(false);
    const doc = toTrainerRoutineDoc(draft);
    expect(doc.days[2]).toMatchObject({ name: 'Pilates', workoutType: 'PILATES', exercises: [] });
    // A day with exercises keeps its own name.
    expect(doc.days[0]).toMatchObject({ name: 'Day A', workoutType: 'LOWER_BODY' });
  });

  it('removing a type sends null; a new day with no type omits it', () => {
    const baseline = fromTrainerRoutineDto(withYogaDay());
    let draft = draftReducer(baseline, {
      type: 'set_day_workout_type',
      dayKey: baseline.days[1]!.key,
      workoutType: null,
    });
    draft = draftReducer(draft, { type: 'add_day' });
    const doc = toTrainerRoutineDoc(draft);
    expect(doc.days[1]?.workoutType).toBeNull();
    expect(doc.days[2]).not.toHaveProperty('workoutType');
  });

  it('adopts the other version from a conflict with its workout types', () => {
    const own = ownRoutine(null);
    const draft = fromRoutineDto({
      ...own,
      days: [
        ...own.days,
        {
          id: 'd2',
          position: 1,
          name: 'Spin',
          plannedWeekday: 4,
          workoutType: 'SPIN',
          exercises: [],
        },
      ],
    });
    expect(toTrainerRoutineDoc(draft).days[1]?.workoutType).toBe('SPIN');
    // The owner's document is unchanged: omitted keeps the stored type.
    expect(toRoutineDoc(draft).days[1]).not.toHaveProperty('workoutType');
  });
});
