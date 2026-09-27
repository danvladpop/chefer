import { describe, expect, it } from 'vitest';
import { effectiveJobs } from './effective-jobs';

describe('effectiveJobs', () => {
  it('returns stored jobs unchanged when present', () => {
    expect(effectiveJobs({ jobs: ['TRAIN', 'HOUSEHOLD'], intent: null })).toEqual([
      'TRAIN',
      'HOUSEHOLD',
    ]);
  });

  it('maps a legacy intent when jobs is empty', () => {
    expect(effectiveJobs({ jobs: [], intent: 'EAT_BETTER' })).toEqual(['PLAN_MEALS']);
    expect(effectiveJobs({ jobs: [], intent: 'HOUSEHOLD' })).toEqual(['HOUSEHOLD']);
    expect(effectiveJobs({ jobs: [], intent: 'TRAIN' })).toEqual(['TRAIN']);
  });

  it('is empty (unknown) with no jobs, no intent and no logging', () => {
    expect(effectiveJobs({ jobs: [], intent: null })).toEqual([]);
  });

  it('infers TRACK at >= 3 logged days in the last 7', () => {
    expect(effectiveJobs({ jobs: [], intent: null, loggedDaysLast7: 2 })).toEqual([]);
    expect(effectiveJobs({ jobs: [], intent: null, loggedDaysLast7: 3 })).toEqual(['TRACK']);
  });

  it('adds TRACK to existing jobs without duplicating', () => {
    expect(effectiveJobs({ jobs: ['TRACK', 'TRAIN'], intent: null, loggedDaysLast7: 5 })).toEqual([
      'TRACK',
      'TRAIN',
    ]);
  });
});
