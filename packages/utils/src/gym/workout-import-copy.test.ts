import { describe, expect, it } from 'vitest';
import type { WorkoutImportResultDto } from '@chefer/types';
import {
  importResultDetails,
  importResultHeadline,
  importRowDetail,
  importWorkoutsBucket,
} from './workout-import-copy';

const result = (over: Partial<WorkoutImportResultDto> = {}): WorkoutImportResultDto => ({
  source: 'STRONG',
  imported: 120,
  alreadyImported: 0,
  skippedWorkouts: 0,
  createdExercises: 0,
  trimmedSets: 0,
  firstDate: '2020-01-02',
  lastDate: '2026-10-01',
  ...over,
});

describe('workout import copy', () => {
  it('describes a review row', () => {
    expect(importRowDetail({ sets: 1, workouts: 1 })).toBe('1 set in 1 workout');
    expect(importRowDetail({ sets: 12, workouts: 4 })).toBe('12 sets in 4 workouts');
  });

  it('headlines the result, and says when nothing new was there', () => {
    expect(importResultHeadline(result())).toBe('Imported 120 workouts from Strong.');
    expect(importResultHeadline(result({ imported: 0, alreadyImported: 120 }))).toBe(
      'Every workout in this file is already in Chefer.',
    );
  });

  it('lists only the details that apply', () => {
    expect(importResultDetails(result())).toEqual([]);
    expect(
      importResultDetails(
        result({ createdExercises: 1, alreadyImported: 3, skippedWorkouts: 2, trimmedSets: 4 }),
      ),
    ).toEqual([
      '1 new exercise was added to your library.',
      '3 were already in Chefer and were left as they are.',
      '2 workouts had only exercises you chose not to import.',
      '4 sets beyond 20 per exercise were left out.',
    ]);
  });

  it('buckets the workout count for analytics', () => {
    expect([0, 1, 10, 11, 50, 51, 200, 201].map(importWorkoutsBucket)).toEqual([
      '0',
      '1-10',
      '1-10',
      '11-50',
      '11-50',
      '51-200',
      '51-200',
      '201+',
    ]);
  });
});
