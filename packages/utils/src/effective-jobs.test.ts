import { describe, expect, it } from 'vitest';
import { effectiveJobs, legacyIntentForJobs } from './effective-jobs';

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

describe('legacyIntentForJobs', () => {
  it('maps the first job with a legacy equivalent', () => {
    expect(legacyIntentForJobs(['TRAIN'])).toBe('TRAIN');
    expect(legacyIntentForJobs(['PLAN_MEALS'])).toBe('EAT_BETTER');
    expect(legacyIntentForJobs(['HOUSEHOLD'])).toBe('HOUSEHOLD');
  });

  it('skips jobs with no legacy equivalent to find the first that has one', () => {
    expect(legacyIntentForJobs(['USE_WHAT_I_HAVE', 'TRACK', 'TRAIN'])).toBe('TRAIN');
    expect(legacyIntentForJobs(['TRAIN', 'PLAN_MEALS'])).toBe('TRAIN');
  });

  it('is null when no job has a legacy equivalent', () => {
    expect(legacyIntentForJobs(['USE_WHAT_I_HAVE', 'SAVED_RECIPES', 'TRACK'])).toBeNull();
    expect(legacyIntentForJobs([])).toBeNull();
  });
});
