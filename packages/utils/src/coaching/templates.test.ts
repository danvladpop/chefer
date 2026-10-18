import { describe, expect, it } from 'vitest';
import {
  EXERCISE_BY_ID,
  TEMPLATE_COPY,
  type TemplateDoc,
  type TrainerRoutineDto,
  type WorkoutTemplateAssignmentDto,
  type WorkoutTemplateSummaryDto,
} from '@chefer/types';
import {
  assignClientRoutine,
  assignTargetFor,
  canAssignAddDay,
  canAssignReplaceDay,
  defaultAssignChoice,
  defaultTemplateUpdateSelection,
  filterTemplates,
  hasTemplateContent,
  isTemplateSavable,
  outdatedTemplateClientCount,
  takesStartingWeight,
  templateAssignmentStatus,
  templateAssignmentStatusText,
  templateConflictCurrent,
  templateProblems,
  templateSummaryLine,
  templateWorkoutTypes,
  type AssignClientRoutine,
} from './templates';

function summary(over: Partial<WorkoutTemplateSummaryDto>): WorkoutTemplateSummaryDto {
  return {
    id: 't',
    name: 'Lower body A',
    workoutType: 'LOWER_BODY',
    exerciseCount: 4,
    estimatedMin: 45,
    assignedCount: 0,
    outdatedCount: 0,
    updatedAt: '2026-10-10T10:00:00.000Z',
    ...over,
  };
}

function assignment(over: Partial<WorkoutTemplateAssignmentDto>): WorkoutTemplateAssignmentDto {
  return {
    clientId: 'c1',
    clientName: 'Maria Pop',
    routineDayId: 'd1',
    dayName: 'Day A',
    templateVersion: 1,
    outdated: false,
    editedSince: false,
    assignedAt: '2026-10-10T10:00:00.000Z',
    ...over,
  };
}

function doc(over: Partial<TemplateDoc> = {}): TemplateDoc {
  return { name: 'Lower body A', workoutType: null, exercises: [], ...over };
}

describe('library filter', () => {
  const rows = [
    summary({ id: 'a', name: 'Lower body A', workoutType: 'LOWER_BODY' }),
    summary({ id: 'b', name: 'Upper push', workoutType: 'UPPER_BODY' }),
    summary({ id: 'c', name: 'Mobility', workoutType: null }),
    summary({ id: 'd', name: 'Lower body B', workoutType: 'LOWER_BODY' }),
  ];

  it('matches word prefixes, case-insensitively, and the workout type', () => {
    expect(filterTemplates(rows, 'low', 'ALL').map((r) => r.id)).toEqual(['a', 'd']);
    expect(filterTemplates(rows, 'LOWER b', 'ALL').map((r) => r.id)).toEqual(['a', 'd']);
    expect(filterTemplates(rows, 'ush', 'ALL')).toEqual([]);
    expect(filterTemplates(rows, '', 'UPPER_BODY').map((r) => r.id)).toEqual(['b']);
    expect(filterTemplates(rows, 'push', 'LOWER_BODY')).toEqual([]);
    expect(filterTemplates(rows, '  ', 'ALL')).toHaveLength(4);
  });

  it('a row reads type, size and minutes, leaving out what is unknown', () => {
    expect(templateSummaryLine(summary({ exerciseCount: 5 }))).toBe(
      'Lower body · 5 exercises · ~45 min',
    );
    expect(
      templateSummaryLine(summary({ workoutType: null, exerciseCount: 1, estimatedMin: null })),
    ).toBe('1 exercise');
  });

  it('offers only the workout types in use, once each, in the catalog order', () => {
    expect(templateWorkoutTypes(rows)).toEqual(['UPPER_BODY', 'LOWER_BODY']);
    expect(templateWorkoutTypes([summary({ workoutType: null })])).toEqual([]);
  });
});

describe('editor rules', () => {
  it('only weight × reps rows take a starting weight', () => {
    expect(takesStartingWeight(EXERCISE_BY_ID.get('back-squat'))).toBe(true);
    expect(takesStartingWeight(EXERCISE_BY_ID.get('pull-up'))).toBe(true);
    expect(takesStartingWeight(EXERCISE_BY_ID.get('push-up'))).toBe(false);
    expect(takesStartingWeight(EXERCISE_BY_ID.get('plank'))).toBe(false);
    expect(takesStartingWeight(undefined)).toBe(false);
  });

  it('a template needs a name, and stays within the name, note and size limits', () => {
    expect(isTemplateSavable(doc())).toBe(true);
    expect(templateProblems(doc({ name: '   ' })).nameMissing).toBe(true);
    expect(templateProblems(doc({ name: 'x'.repeat(41) })).nameTooLong).toBe(true);
    const row = {
      exerciseId: 'back-squat',
      sets: 3,
      repMin: 6,
      repMax: 8,
      targetRir: 2,
      restSec: 120,
      supersetGroup: null,
      defaultLoadKg: null,
      trainerNote: null,
    };
    expect(isTemplateSavable(doc({ exercises: Array.from({ length: 21 }, () => row) }))).toBe(
      false,
    );
    expect(
      templateProblems(doc({ exercises: [{ ...row, trainerNote: 'x'.repeat(1000) }] })).noteTooLong,
    ).toBe(true);
  });

  it('reads a template CONFLICT and ignores a routine one', () => {
    const current = { id: 'tpl1', version: 9 };
    expect(templateConflictCurrent({ data: { conflict: { kind: 'template', current } } })).toBe(
      current,
    );
    expect(
      templateConflictCurrent({ data: { conflict: { kind: 'routine', current: {} } } }),
    ).toBeNull();
    expect(templateConflictCurrent({ data: { conflict: { kind: 'template' } } })).toBeNull();
    expect(templateConflictCurrent(new Error('x'))).toBeNull();
    expect(templateConflictCurrent(null)).toBeNull();
  });
});

describe('who has the template', () => {
  const list = [
    assignment({ clientId: 'up', outdated: false }),
    assignment({ clientId: 'old', outdated: true }),
    assignment({ clientId: 'edited', outdated: true, editedSince: true }),
    assignment({ clientId: 'old', routineDayId: 'd2', outdated: true }),
  ];

  it('update for clients ticks the outdated unedited copies only, each client once', () => {
    expect(defaultTemplateUpdateSelection(list)).toEqual(['old']);
    expect(list.map(templateAssignmentStatus)).toEqual([
      'upToDate',
      'outdated',
      'editedSince',
      'outdated',
    ]);
  });

  it('counts clients (not copies) with an older version', () => {
    expect(outdatedTemplateClientCount(list)).toBe(2);
  });

  it('labels each copy, adding "Edited since" when the day was changed', () => {
    const { olderVersion, upToDate, editedSinceLabel } = TEMPLATE_COPY.update;
    expect(templateAssignmentStatusText(assignment({ outdated: true }))).toBe(olderVersion);
    expect(templateAssignmentStatusText(assignment({}))).toBe(upToDate);
    expect(templateAssignmentStatusText(assignment({ outdated: true, editedSince: true }))).toBe(
      `${olderVersion} · ${editedSinceLabel}`,
    );
    expect(templateAssignmentStatusText(assignment({ editedSince: true }))).toBe(
      `${upToDate} · ${editedSinceLabel}`,
    );
  });
});

describe('assign targets', () => {
  const ready: AssignClientRoutine = { state: 'ready', days: [{ id: 'd1', name: 'Day A' }] };
  const full: AssignClientRoutine = {
    state: 'ready',
    days: Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, name: `Day ${i}` })),
  };

  it('reads the routine query: loading, failed, none, or its days in order', () => {
    expect(assignClientRoutine({ isLoading: true, isError: false, data: undefined })).toEqual({
      state: 'loading',
    });
    expect(assignClientRoutine({ isLoading: false, isError: true, data: undefined })).toEqual({
      state: 'error',
    });
    expect(assignClientRoutine({ isLoading: false, isError: false, data: null })).toEqual({
      state: 'none',
    });
    const routine = {
      days: [
        { id: 'b', name: 'Day B', position: 1 },
        { id: 'a', name: 'Day A', position: 0 },
      ],
    } as unknown as TrainerRoutineDto;
    expect(assignClientRoutine({ isLoading: false, isError: false, data: routine })).toEqual({
      state: 'ready',
      days: [
        { id: 'a', name: 'Day A' },
        { id: 'b', name: 'Day B' },
      ],
    });
  });

  it('adds a day (with an optional weekday) or replaces a picked day', () => {
    expect(
      assignTargetFor('c1', { mode: 'ADD_DAY', weekday: 2, routineDayId: null }, ready),
    ).toEqual({ clientId: 'c1', mode: 'ADD_DAY', weekday: 2 });
    expect(
      assignTargetFor('c1', { mode: 'REPLACE_DAY', weekday: null, routineDayId: null }, ready),
    ).toBeNull();
    expect(
      assignTargetFor('c1', { mode: 'REPLACE_DAY', weekday: null, routineDayId: 'gone' }, ready),
    ).toBeNull();
    expect(
      assignTargetFor('c1', { mode: 'REPLACE_DAY', weekday: null, routineDayId: 'd1' }, ready),
    ).toEqual({ clientId: 'c1', mode: 'REPLACE_DAY', routineDayId: 'd1' });
  });

  it('no routine, a failed load or still loading: nothing is sent for that client', () => {
    const add = { mode: 'ADD_DAY' as const, weekday: null, routineDayId: null };
    for (const state of ['none', 'error', 'loading'] as const) {
      expect(assignTargetFor('c1', add, { state })).toBeNull();
      expect(canAssignAddDay({ state })).toBe(false);
      expect(canAssignReplaceDay({ state })).toBe(false);
      expect(defaultAssignChoice({ state }).mode).toBe('ADD_DAY');
    }
  });

  it('a full routine (7 days) starts on Replace and cannot add', () => {
    expect(canAssignAddDay(full)).toBe(false);
    expect(canAssignReplaceDay(full)).toBe(true);
    expect(defaultAssignChoice(full).mode).toBe('REPLACE_DAY');
    expect(defaultAssignChoice(ready).mode).toBe('ADD_DAY');
    expect(
      assignTargetFor('c1', { mode: 'ADD_DAY', weekday: null, routineDayId: null }, full),
    ).toBeNull();
  });
});

describe('hasTemplateContent', () => {
  const doc = { name: 'Lower A', workoutType: null, exercises: [] };
  it('needs a name plus an exercise or a workout type', () => {
    expect(hasTemplateContent(doc)).toBe(false);
    expect(hasTemplateContent({ ...doc, workoutType: 'LOWER_BODY' as const })).toBe(true);
    expect(hasTemplateContent({ ...doc, name: '  ', workoutType: 'LOWER_BODY' as const })).toBe(
      false,
    );
  });
});
