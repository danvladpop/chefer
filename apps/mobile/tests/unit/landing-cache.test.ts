import { resetModeForTests, setMode } from '../../src/features/gym/mode-store';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import {
  getCachedHasGymProfile,
  getCachedJobs,
  getCachedTrainingState,
  resetLandingCacheForTests,
  setCachedHasGymProfile,
  setCachedJobs,
  setCachedTrainingState,
} from '../../src/features/navigation/landing-cache';
import { landingSurfaceSync } from '../../src/features/navigation/use-landing';
import { activeDoc } from './gym-workout-helpers';

// T-04.3: the cold-start landing cache + the synchronous decision it feeds
// landingFor. Fresh in-memory KV backend per test, same convention as
// gym-stores.test.ts.

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetLandingCacheForTests();
  resetModeForTests();
  resetGymOwnerForTests();
  activeSessionStore.clear();
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

  // ── UX-PO-10: the live inputs ───────────────────────────────────────────────
  describe('row 1: a workout in progress', () => {
    it('lands on Gym even over an explicit Food choice', () => {
      setMode('food');
      activeSessionStore.set(activeDoc(), null);
      expect(landingSurfaceSync()).toBe('gym');
    });

    it('a "Save for later" session is parked, not in progress', () => {
      setMode('food');
      activeSessionStore.set(activeDoc(), null);
      activeSessionStore.setPausedAt(new Date().toISOString());
      expect(landingSurfaceSync()).toBe('food');
    });

    it("another account's session never redirects this one", () => {
      setGymOwner('user-b');
      activeSessionStore.set(activeDoc(), 'user-a');
      expect(landingSurfaceSync()).toBe('food');
    });
  });

  describe('row 4: a planned training day, not yet done', () => {
    const at = (hours: number, minutes = 0) => new Date(2026, 8, 28, hours, minutes);
    const today = '2026-09-28';

    beforeEach(() => {
      setCachedJobs(['PLAN_MEALS', 'TRAIN']);
      setCachedHasGymProfile(true);
    });

    it('lands on Gym from 14:00 on a training day', () => {
      setCachedTrainingState({ date: today, isTrainingDay: true, workoutDone: false });
      expect(landingSurfaceSync(at(13, 59))).toBe('food');
      expect(landingSurfaceSync(at(14))).toBe('gym');
    });

    it('moves earlier when the reminder is earlier', () => {
      setCachedTrainingState({
        date: today,
        isTrainingDay: true,
        workoutDone: false,
        reminderHour: 10,
      });
      expect(landingSurfaceSync(at(8))).toBe('gym');
      expect(landingSurfaceSync(at(7, 59))).toBe('food');
    });

    it('stays on Food once the workout is done, or on a rest day', () => {
      setCachedTrainingState({ date: today, isTrainingDay: true, workoutDone: true });
      expect(landingSurfaceSync(at(18))).toBe('food');
      setCachedTrainingState({ date: today, isTrainingDay: false, workoutDone: false });
      expect(landingSurfaceSync(at(18))).toBe('food');
    });

    it('ignores a training state cached for another day', () => {
      setCachedTrainingState({ date: '2026-09-27', isTrainingDay: true, workoutDone: false });
      expect(getCachedTrainingState(today)).toBeNull();
      expect(landingSurfaceSync(at(18))).toBe('food');
    });

    it('an explicit Food choice still wins over the training-day default', () => {
      setMode('food');
      setCachedTrainingState({ date: today, isTrainingDay: true, workoutDone: false });
      expect(landingSurfaceSync(at(18))).toBe('food');
    });

    it('survives a restart (KV round-trip)', () => {
      setCachedTrainingState({
        date: today,
        isTrainingDay: true,
        workoutDone: false,
        reminderHour: 17.5,
      });
      resetLandingCacheForTests();
      expect(getCachedTrainingState(today)).toEqual({
        date: today,
        isTrainingDay: true,
        workoutDone: false,
        reminderHour: 17.5,
      });
    });
  });
});
