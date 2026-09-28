import { useEffect, useState, useSyncExternalStore } from 'react';
import { createExternalStore } from '../offline/external-store';
import { kv } from '../offline/kv';

// ─── Cardio entry timer (T-42.3, UX-42 AC2) ───────────────────────────────────
// The "Timer" mode's wall clock. Stores ABSOLUTE timestamps (the same
// pattern as ../rest-timer.ts's `endsAt`), so it survives backgrounding, a
// kill and airplane mode — elapsed time is always computed from `Date.now()`
// against a stored instant, never from an in-memory tick count. Counts UP
// (vs. rest-timer's countdown) and supports pause/resume (a cardio session
// can be paused mid-entry; rest never is).
//
// NOT in offline/keys.ts — that file is L-HOME's this wave (see
// common-rules.md). Flagged in this lane's final report to backfill
// `KV_KEYS.cardioTimer = 'gym.cardio-timer'` there; the string below must
// never change once this ships (renaming orphans an in-progress timer that's
// already on a user's phone).
const CARDIO_TIMER_KEY = 'gym.cardio-timer';

/** Only one cardio timer runs at a time (UX-42: "one running timer"). */
export interface CardioTimerState {
  /** The session exercise (cardio slot) this timer belongs to. */
  seId: string;
  /** Epoch ms the CURRENT running segment started, or null while paused. */
  runningSince: number | null;
  /** Seconds banked from segments before the current one. */
  bankedSec: number;
}

/** UX-42: a forgotten running timer auto-pauses (stops accruing) after 3 h. */
export const CARDIO_TIMER_AUTO_PAUSE_SEC = 3 * 60 * 60;

const isState = (value: unknown): value is CardioTimerState =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CardioTimerState).seId === 'string' &&
  typeof (value as CardioTimerState).bankedSec === 'number';

const cardioTimerStore = createExternalStore<CardioTimerState | null>(() => {
  const stored = kv.getJSON(CARDIO_TIMER_KEY);
  return isState(stored) ? stored : null;
});

function write(next: CardioTimerState | null): void {
  if (next) kv.setJSON(CARDIO_TIMER_KEY, next);
  else kv.remove(CARDIO_TIMER_KEY);
  cardioTimerStore.set(next);
}

export function getCardioTimer(): CardioTimerState | null {
  return cardioTimerStore.get();
}

export const subscribeCardioTimer = cardioTimerStore.subscribe;

/** Elapsed seconds for `state` as of `now`, capped at the 3 h auto-pause. */
export function cardioElapsedSec(state: CardioTimerState | null, now = Date.now()): number {
  if (!state) return 0;
  const running =
    state.runningSince !== null ? Math.max(0, Math.floor((now - state.runningSince) / 1000)) : 0;
  return Math.min(CARDIO_TIMER_AUTO_PAUSE_SEC, state.bankedSec + running);
}

/** Whether `state` has hit the 3 h cap (effectively auto-paused, even if still marked running). */
export function isCardioTimerCapped(state: CardioTimerState | null, now = Date.now()): boolean {
  return cardioElapsedSec(state, now) >= CARDIO_TIMER_AUTO_PAUSE_SEC;
}

/** Starts (or restarts from zero) the one running cardio timer, for `seId` — replaces any other. */
export function startCardioTimer(seId: string, now = Date.now()): void {
  write({ seId, runningSince: now, bankedSec: 0 });
}

/** Pauses the running timer (banks its elapsed time so far). No-op if already paused/absent. */
export function pauseCardioTimer(now = Date.now()): void {
  const state = cardioTimerStore.get();
  if (state?.runningSince == null) return;
  write({ seId: state.seId, runningSince: null, bankedSec: cardioElapsedSec(state, now) });
}

/** Resumes a paused timer. A no-op once it's already hit the 3 h cap. */
export function resumeCardioTimer(now = Date.now()): void {
  const state = cardioTimerStore.get();
  if (state?.runningSince !== null) return;
  if (state.bankedSec >= CARDIO_TIMER_AUTO_PAUSE_SEC) return;
  write({ ...state, runningSince: now });
}

/** Clears the timer — after logging the entry, or cancelling it. */
export function clearCardioTimer(): void {
  write(null);
}

export function useCardioTimer(): CardioTimerState | null {
  return useSyncExternalStore(cardioTimerStore.subscribe, cardioTimerStore.get);
}

/** Ticking elapsed seconds for the running cardio-entry UI (re-renders ~1×/s while running). */
export function useCardioElapsedSec(): number {
  const state = useCardioTimer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state?.runningSince == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);
  return cardioElapsedSec(state, state?.runningSince !== null ? now : Date.now());
}

/** Test seam. */
export function resetCardioTimerForTests(): void {
  cardioTimerStore.reset();
}
