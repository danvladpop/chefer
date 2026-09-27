import { describe, expect, it } from 'vitest';
import { landingFor } from './landing';

describe('landingFor', () => {
  it('respects an explicit Gym choice regardless of jobs', () => {
    expect(landingFor({ jobs: ['PLAN_MEALS'], persistedMode: 'gym', hasGymProfile: true })).toBe(
      'gym',
    );
  });

  it('lands TRAIN-only, gym-set-up users on Gym', () => {
    expect(landingFor({ jobs: ['TRAIN'], persistedMode: 'food', hasGymProfile: true })).toBe('gym');
  });

  it('keeps TRAIN-only users on Food until gym setup is done', () => {
    expect(landingFor({ jobs: ['TRAIN'], persistedMode: 'food', hasGymProfile: false })).toBe(
      'food',
    );
  });

  it('lands mixed-job users on Food', () => {
    expect(
      landingFor({ jobs: ['TRAIN', 'PLAN_MEALS'], persistedMode: 'food', hasGymProfile: true }),
    ).toBe('food');
  });

  it('defaults new accounts (no jobs) to Food', () => {
    expect(landingFor({ jobs: [], persistedMode: 'food', hasGymProfile: false })).toBe('food');
  });
});
