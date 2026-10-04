import { describe, expect, it } from 'vitest';
import type { RoutineDto } from '@chefer/types';
import { toTrainerRoutineDoc } from '../gym/routine/draft';
import { draftFromOwnRoutine } from './fill-from-mine';

function own(): RoutineDto {
  const ex = (id: string, exerciseId: string, position: number, group: string | null = null) => ({
    id,
    exerciseId,
    position,
    sets: 4,
    repMin: 5,
    repMax: 5,
    targetRir: 1,
    restSec: 180,
    supersetGroup: group,
    notes: 'private note of the trainer',
    trainerNote: 'should not be copied',
  });
  return {
    id: 'own-1',
    name: 'My strength block',
    templateKey: null,
    isActive: false,
    nextDayId: null,
    version: 9,
    archived: false,
    updatedAt: '2026-10-01T00:00:00.000Z',
    days: [
      {
        id: 'od1',
        position: 0,
        name: 'Lower',
        plannedWeekday: 1,
        exercises: [
          ex('o1', 'back-squat', 0),
          ex('o2', 'my-custom-lift', 1),
          ex('o3', 'seated-leg-curl', 2),
        ],
      },
    ],
  };
}

describe('draftFromOwnRoutine', () => {
  const curated = new Set(['back-squat', 'seated-leg-curl']);

  it('keeps the client routine identity, copies curated rows as new rows without notes', () => {
    const { draft, skipped } = draftFromOwnRoutine(
      own(),
      { id: 'client-r', name: 'Maria routine' },
      curated,
    );
    expect(draft.id).toBe('client-r');
    expect(draft.name).toBe('Maria routine');
    expect(skipped).toBe(1);
    const rows = draft.days[0]!.exercises;
    expect(rows.map((r) => r.exerciseId)).toEqual(['back-squat', 'seated-leg-curl']);
    expect(
      rows.every((r) => r.id === undefined && r.notes === null && r.trainerNote === null),
    ).toBe(true);
    expect(draft.days[0]!.id).toBeUndefined();
    expect(draft.days[0]).toMatchObject({ name: 'Lower', plannedWeekday: 1 });
  });

  it('produces a document the server accepts (no ids, no notes)', () => {
    const { draft } = draftFromOwnRoutine(
      own(),
      { id: 'client-r', name: 'Maria routine' },
      curated,
    );
    const doc = toTrainerRoutineDoc(draft);
    expect(JSON.stringify(doc)).not.toContain('private note');
    expect(doc.days[0]?.exercises[0]).toMatchObject({
      exerciseId: 'back-squat',
      sets: 4,
      trainerNote: null,
    });
  });
});
