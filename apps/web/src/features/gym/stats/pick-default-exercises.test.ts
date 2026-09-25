import { describe, expect, it } from 'vitest';
import type { ExerciseDto, SessionSummaryDto } from '@chefer/types';
import { topCompoundsByFrequency } from './pick-default-exercises';

type Lib = Pick<ExerciseDto, 'id' | 'category' | 'archived'>;
type Session = Pick<SessionSummaryDto, 'exercises'>;

function session(entries: { exerciseId: string; skipped?: boolean }[]): Session {
  return {
    exercises: entries.map((e) => ({
      exerciseId: e.exerciseId,
      skipped: e.skipped ?? false,
      lastSetRir: null,
      sets: [],
    })),
  };
}

const library: Lib[] = [
  { id: 'bench', category: 'COMPOUND', archived: false },
  { id: 'squat', category: 'COMPOUND', archived: false },
  { id: 'row', category: 'COMPOUND', archived: false },
  { id: 'deadlift', category: 'COMPOUND', archived: false },
  { id: 'lateral-raise', category: 'ISOLATION', archived: false },
  { id: 'retired-lift', category: 'COMPOUND', archived: true },
];

describe('topCompoundsByFrequency', () => {
  it('ranks compounds by number of exposures, most frequent first', () => {
    const sessions: Session[] = [
      session([{ exerciseId: 'bench' }, { exerciseId: 'lateral-raise' }]),
      session([{ exerciseId: 'bench' }, { exerciseId: 'squat' }]),
      session([{ exerciseId: 'bench' }, { exerciseId: 'squat' }]),
      session([{ exerciseId: 'row' }]),
    ];
    expect(topCompoundsByFrequency(sessions, library)).toEqual(['bench', 'squat', 'row']);
  });

  it('excludes isolation exercises', () => {
    const sessions: Session[] = [
      session([{ exerciseId: 'lateral-raise' }, { exerciseId: 'lateral-raise' }]),
      session([{ exerciseId: 'bench' }]),
    ];
    expect(topCompoundsByFrequency(sessions, library)).toEqual(['bench']);
  });

  it('excludes skipped exercises', () => {
    const sessions: Session[] = [
      session([{ exerciseId: 'bench', skipped: true }]),
      session([{ exerciseId: 'squat' }]),
    ];
    expect(topCompoundsByFrequency(sessions, library)).toEqual(['squat']);
  });

  it('excludes archived exercises even if they appear in history', () => {
    const sessions: Session[] = [
      session([{ exerciseId: 'retired-lift' }, { exerciseId: 'retired-lift' }]),
      session([{ exerciseId: 'bench' }]),
    ];
    expect(topCompoundsByFrequency(sessions, library)).toEqual(['bench']);
  });

  it('returns fewer than `limit` when history is sparse, and empty when there is none', () => {
    expect(topCompoundsByFrequency([session([{ exerciseId: 'bench' }])], library)).toEqual([
      'bench',
    ]);
    expect(topCompoundsByFrequency([], library)).toEqual([]);
  });

  it('breaks ties alphabetically by id for a stable default', () => {
    const sessions: Session[] = [session([{ exerciseId: 'squat' }, { exerciseId: 'bench' }])];
    expect(topCompoundsByFrequency(sessions, library, 2)).toEqual(['bench', 'squat']);
  });

  it('respects a custom limit', () => {
    const sessions: Session[] = [
      session([
        { exerciseId: 'bench' },
        { exerciseId: 'squat' },
        { exerciseId: 'row' },
        { exerciseId: 'deadlift' },
      ]),
    ];
    expect(topCompoundsByFrequency(sessions, library, 2)).toHaveLength(2);
  });
});
