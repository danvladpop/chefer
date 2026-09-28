import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  CARDIO_TIMER_AUTO_PAUSE_SEC,
  cardioElapsedSec,
  clearCardioTimer,
  getCardioTimer,
  isCardioTimerCapped,
  pauseCardioTimer,
  resetCardioTimerForTests,
  resumeCardioTimer,
  startCardioTimer,
} from '../../src/features/gym/workout/cardio-timer';

// T-42.3 / UX-42 AC2: the timer stores absolute epoch instants (the same
// pattern as rest-timer.ts), so "survives a kill" is simulated here by
// resetting the in-memory store (a fresh process re-reading the same KV
// backend) mid-test rather than by any special "kill" API.

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetCardioTimerForTests();
});

describe('cardio timer (AC2: survives a kill in airplane mode)', () => {
  it('starts at zero and accrues elapsed seconds from the stored instant, not a tick count', () => {
    const t0 = 1_000_000;
    startCardioTimer('se-bike', t0);
    expect(cardioElapsedSec(getCardioTimer(), t0)).toBe(0);
    expect(cardioElapsedSec(getCardioTimer(), t0 + 65_000)).toBe(65);
  });

  it('survives a "kill": a fresh store instance reads the same persisted state and keeps ticking', () => {
    const t0 = 1_000_000;
    startCardioTimer('se-bike', t0);

    // Simulate the app relaunching: drop the in-memory cache, re-read from KV.
    resetCardioTimerForTests();

    const state = getCardioTimer();
    expect(state?.seId).toBe('se-bike');
    expect(cardioElapsedSec(state, t0 + 120_000)).toBe(120);
  });

  it('pause banks the elapsed time; resume continues from there, not from zero', () => {
    const t0 = 1_000_000;
    startCardioTimer('se-bike', t0);
    pauseCardioTimer(t0 + 30_000); // 30 s elapsed, banked
    expect(cardioElapsedSec(getCardioTimer(), t0 + 90_000)).toBe(30); // paused: no further accrual

    resumeCardioTimer(t0 + 90_000);
    expect(cardioElapsedSec(getCardioTimer(), t0 + 90_000 + 15_000)).toBe(45); // 30 banked + 15 more
  });

  it('pausing an already-paused (or absent) timer is a no-op', () => {
    expect(getCardioTimer()).toBeNull();
    pauseCardioTimer(1_000_000); // no timer running — no-op, no throw
    expect(getCardioTimer()).toBeNull();

    startCardioTimer('se-bike', 1_000_000);
    pauseCardioTimer(1_030_000);
    const paused = getCardioTimer();
    pauseCardioTimer(1_090_000); // already paused — no-op
    expect(getCardioTimer()).toEqual(paused);
  });

  it('starting a new timer replaces any other (only one running timer)', () => {
    startCardioTimer('se-bike', 1_000_000);
    startCardioTimer('se-run', 2_000_000);
    expect(getCardioTimer()?.seId).toBe('se-run');
  });

  it('auto-pauses at 3 h: elapsed caps there and isCardioTimerCapped flips true', () => {
    const t0 = 1_000_000;
    startCardioTimer('se-bike', t0);
    const justUnder = t0 + (CARDIO_TIMER_AUTO_PAUSE_SEC - 1) * 1000;
    const atCap = t0 + CARDIO_TIMER_AUTO_PAUSE_SEC * 1000;
    const wayOver = t0 + (CARDIO_TIMER_AUTO_PAUSE_SEC + 3600) * 1000;

    expect(isCardioTimerCapped(getCardioTimer(), justUnder)).toBe(false);
    expect(cardioElapsedSec(getCardioTimer(), atCap)).toBe(CARDIO_TIMER_AUTO_PAUSE_SEC);
    expect(isCardioTimerCapped(getCardioTimer(), atCap)).toBe(true);
    // Even hours past the cap, elapsed never exceeds it.
    expect(cardioElapsedSec(getCardioTimer(), wayOver)).toBe(CARDIO_TIMER_AUTO_PAUSE_SEC);
  });

  it('resume is a no-op once the banked time already hit the cap', () => {
    const t0 = 1_000_000;
    startCardioTimer('se-bike', t0);
    pauseCardioTimer(t0 + CARDIO_TIMER_AUTO_PAUSE_SEC * 1000);
    resumeCardioTimer(t0 + CARDIO_TIMER_AUTO_PAUSE_SEC * 1000 + 60_000);
    expect(getCardioTimer()?.runningSince).toBeNull(); // resume refused
  });

  it('clearCardioTimer removes it entirely (after Log it, or Cancel)', () => {
    startCardioTimer('se-bike', 1_000_000);
    clearCardioTimer();
    expect(getCardioTimer()).toBeNull();
  });
});
