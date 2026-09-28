import { resetModeForTests, setMode } from '../../src/features/gym/mode-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  getCachedHasGymProfile,
  getCachedJobs,
  resetLandingCacheForTests,
  setCachedHasGymProfile,
  setCachedJobs,
} from '../../src/features/navigation/landing-cache';
import { landingSurfaceSync } from '../../src/features/navigation/use-landing';

// T-04.3: the cold-start landing cache + the synchronous decision it feeds
// landingFor. Fresh in-memory KV backend per test, same convention as
// gym-stores.test.ts.

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetLandingCacheForTests();
  resetModeForTests();
});

describe('landing cache', () => {
  it('defaults to no jobs / no gym profile before anything is cached', () => {
    expect(getCachedJobs()).toEqual([]);
    expect(getCachedHasGymProfile()).toBe(false);
  });

  it('round-trips through the KV backend (survives a cache reset)', () => {
    setCachedJobs(['TRAIN', 'PLAN_MEALS']);
    setCachedHasGymProfile(true);
    resetLandingCacheForTests();
    expect(getCachedJobs()).toEqual(['TRAIN', 'PLAN_MEALS']);
    expect(getCachedHasGymProfile()).toBe(true);
  });
});

describe('landingSurfaceSync', () => {
  it('defaults new accounts (no cached jobs) to Food', () => {
    expect(landingSurfaceSync()).toBe('food');
  });

  it('lands TRAIN-only, gym-set-up users on Gym (AC2)', () => {
    setCachedJobs(['TRAIN']);
    setCachedHasGymProfile(true);
    expect(landingSurfaceSync()).toBe('gym');
  });

  it('keeps TRAIN-only users on Food until gym setup is cached as done', () => {
    setCachedJobs(['TRAIN']);
    setCachedHasGymProfile(false);
    expect(landingSurfaceSync()).toBe('food');
  });

  it('an explicit persisted Gym choice always wins', () => {
    setCachedJobs(['PLAN_MEALS']);
    setMode('gym');
    expect(landingSurfaceSync()).toBe('gym');
  });
});
