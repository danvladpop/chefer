import type { RoutineDto } from '@chefer/types';
import {
  extractRoutineConflict,
  keepMineAfterConflict,
  loadTheirsAfterConflict,
} from '../../src/features/gym/routine/conflict';
import { routineDtoToDraft } from '../../src/features/gym/routine/mapping';
import type { RoutineDraft } from '../../src/features/gym/routine/types';

// routine.save CONFLICT handling (gym_plan.md §5.4): "Keep mine" resends the
// local edits with the server's newer version; "Use the other version"
// discards local edits and loads the server's copy. Pure, so both choices are
// unit-tested directly against apps/api/src/lib/conflict.ts's payload shape.

function makeCurrent(version: number): RoutineDto {
  return {
    id: 'r1',
    name: 'Server name',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version,
    archived: false,
    updatedAt: '2026-09-02T00:00:00.000Z',
    days: [{ id: 'd1', position: 0, name: 'Server day', plannedWeekday: null, exercises: [] }],
  };
}

const localDraft: RoutineDraft = {
  id: 'r1',
  name: 'My edited name',
  version: 3,
  days: [{ key: 'd1', id: 'd1', name: 'My edited day', plannedWeekday: 2, exercises: [] }],
};

describe('extractRoutineConflict', () => {
  it('reads the conflict payload off a routine CONFLICT error', () => {
    const current = makeCurrent(4);
    const error = { data: { conflict: { kind: 'routine', current } } };
    expect(extractRoutineConflict(error)).toEqual(current);
  });

  it('returns null for an unrelated error shape', () => {
    expect(extractRoutineConflict({ data: { conflict: null } })).toBeNull();
    expect(extractRoutineConflict({ data: {} })).toBeNull();
    expect(extractRoutineConflict(new Error('network down'))).toBeNull();
    expect(extractRoutineConflict(null)).toBeNull();
  });

  it('ignores a conflict payload of a different kind', () => {
    expect(extractRoutineConflict({ data: { conflict: { kind: 'other' } } })).toBeNull();
  });
});

describe('keepMineAfterConflict', () => {
  it('keeps every local edit and only bumps the version', () => {
    const current = makeCurrent(4);
    const resolved = keepMineAfterConflict(localDraft, current);
    expect(resolved.version).toBe(4);
    expect(resolved.name).toBe('My edited name');
    expect(resolved.days[0]?.name).toBe('My edited day');
    expect(resolved.days[0]?.plannedWeekday).toBe(2);
  });
});

describe('loadTheirsAfterConflict', () => {
  it('discards local edits and loads the server copy as a fresh draft', () => {
    const current = makeCurrent(4);
    const resolved = loadTheirsAfterConflict(current);
    expect(resolved).toEqual(routineDtoToDraft(current));
    expect(resolved.name).toBe('Server name');
    expect(resolved.version).toBe(4);
    expect(resolved.days[0]?.name).toBe('Server day');
  });
});
