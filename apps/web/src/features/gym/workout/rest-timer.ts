import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createExternalStore } from './external-store';
import { getStorage, GYM_KEYS, readJson } from './storage';

// Rest timer (gym_plan.md §5.3 on web). Stores an ABSOLUTE `endsAt`, so a
// reload mid-rest resumes the countdown. It lives in its own store: only the
// timer bar subscribes to the per-tick updates, never the exercise list.
// At zero: a short beep, plus a system notification ONLY when the tab is
// hidden and the user already granted permission — the web never prompts
// during a workout (the workout screen stays free of modals).

export interface RestTimerState {
  /** Epoch ms when the rest is over. */
  endsAt: number;
  /** Planned rest length (progress bar); updated by ±15 s. */
  durationSec: number;
  /** Session exercise the rest follows. */
  seId: string | null;
}

export const REST_ADJUST_STEP_SEC = 15;

const isState = (value: unknown): value is RestTimerState =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as RestTimerState).endsAt === 'number' &&
  typeof (value as RestTimerState).durationSec === 'number';

const restStore = createExternalStore<RestTimerState | null>(() => {
  const stored = readJson(getStorage(), GYM_KEYS.restTimer);
  return isState(stored) ? stored : null;
});

function write(next: RestTimerState | null): void {
  if (next) getStorage().setItem(GYM_KEYS.restTimer, JSON.stringify(next));
  else getStorage().removeItem(GYM_KEYS.restTimer);
  restStore.set(next);
}

export function getRestTimer(): RestTimerState | null {
  return restStore.get();
}

/** Start (or restart) a rest of `seconds`. 0 or less clears it. */
export function startRest(seconds: number, seId: string | null = null, now = Date.now()): void {
  if (seconds <= 0) {
    write(null);
    return;
  }
  write({ endsAt: now + seconds * 1000, durationSec: seconds, seId });
}

/** ±15 s (or any delta). Running past zero ends the rest. */
export function adjustRest(deltaSec: number, now = Date.now()): void {
  const current = restStore.get();
  if (!current) return;
  const endsAt = current.endsAt + deltaSec * 1000;
  if (endsAt <= now) {
    write(null);
    return;
  }
  write({ ...current, endsAt, durationSec: Math.max(1, current.durationSec + deltaSec) });
}

export function skipRest(): void {
  write(null);
}

/** Seconds left, rounded up (0 when done or idle). */
export function restRemainingSec(state: RestTimerState | null, now = Date.now()): number {
  if (!state) return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

const serverSnapshot = () => null;

export function useRestTimer(): RestTimerState | null {
  return useSyncExternalStore(restStore.subscribe, restStore.get, serverSnapshot);
}

/**
 * Ticking countdown for the timer bar ONLY (~4 renders/s while resting).
 * `onDone` fires once when the countdown reaches zero, and the finished
 * timer is cleared.
 */
export function useRestRemaining(onDone?: () => void): {
  remainingSec: number;
  state: RestTimerState | null;
} {
  const state = useRestTimer();
  const [now, setNow] = useState(() => Date.now());
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!state) return;
    if (Date.now() >= state.endsAt) {
      // Ran out while the page was closed — clear quietly, no late beep.
      if (restStore.get()?.endsAt === state.endsAt) write(null);
      return;
    }
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= state.endsAt) {
        clearInterval(id);
        if (restStore.get()?.endsAt === state.endsAt) write(null);
        onDoneRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [state]);

  const startedAt = state ? state.endsAt - state.durationSec * 1000 : now;
  return { remainingSec: restRemainingSec(state, Math.max(now, startedAt)), state };
}

// ── Alerts ───────────────────────────────────────────────────────────────────

/** Two short sine beeps through Web Audio (no asset to load, works offline). */
export function playRestDoneSound(): void {
  try {
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return;
    const ctx = new Ctor();
    const beep = (at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    };
    beep(0);
    beep(0.3);
    setTimeout(() => void ctx.close().catch(() => undefined), 800);
  } catch {
    // Sound is a convenience.
  }
}

/** A system notification — only if already permitted and the tab is in the background. */
export function notifyRestDone(): void {
  try {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted' || !document.hidden) return;
    new Notification('Rest is over', { body: 'Time for your next set.', tag: 'gym-rest-timer' });
  } catch {
    // Some browsers (Android Chrome) only allow notifications from a service worker.
  }
}

/** Test seam. */
export function resetRestTimerForTests(): void {
  restStore.reset();
}
