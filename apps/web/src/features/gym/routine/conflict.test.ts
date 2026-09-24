import { describe, expect, it } from 'vitest';
import type { RoutineDto } from '@chefer/types';
import { keepMineExpectedVersion, resolveTheirsDraft } from './conflict';
import { toRoutineDoc } from './draft';

function routineDto(version: number): RoutineDto {
  return {
    id: 'routine-1',
    name: 'Server copy',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version,
    archived: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
    days: [
      {
        id: 'day-a',
        position: 0,
        name: 'Day A',
        plannedWeekday: null,
        exercises: [
          {
            id: 'ex-1',
            exerciseId: 'barbell-squat',
            position: 0,
            sets: 5,
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

describe('keepMineExpectedVersion', () => {
  it("re-submits against the server's current version", () => {
    expect(keepMineExpectedVersion(routineDto(7))).toBe(7);
  });
});

describe('resolveTheirsDraft', () => {
  it('replaces the local draft and baseline with the server document', () => {
    const current = routineDto(7);
    const { draft, baseline, version } = resolveTheirsDraft(current);

    expect(version).toBe(7);
    expect(draft.name).toBe('Server copy');
    expect(toRoutineDoc(draft)).toEqual(toRoutineDoc(baseline));
    // The new draft/baseline pair is a fresh save-payload fixpoint (not dirty).
    expect(toRoutineDoc(draft)).toEqual({
      id: 'routine-1',
      name: 'Server copy',
      days: [
        {
          id: 'day-a',
          name: 'Day A',
          plannedWeekday: null,
          exercises: [
            {
              id: 'ex-1',
              exerciseId: 'barbell-squat',
              sets: 5,
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
});
