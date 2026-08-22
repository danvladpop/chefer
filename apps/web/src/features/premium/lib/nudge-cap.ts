'use client';

import { useCallback, useEffect, useState } from 'react';

// ─── Contextual-nudge frequency cap (premium_plan.md §6.5) ────────────────────
// Hard taste rules for every moment-based upgrade nudge:
//   1. At most ONE contextual nudge shown per day, across all sources.
//   2. Dismissing a nudge silences that source for 7 days.
//   3. State lives in localStorage — per-device is good enough for taste.
// The soft paywall's credibility is a launch asset; this helper is what keeps
// nudge authors honest. All nudges must render through useNudge().

const DAY_KEY = 'chefer.nudge.lastShownDay';
const DISMISS_PREFIX = 'chefer.nudge.dismissedAt.';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function todayStr(now: Date = new Date()): string {
  return now.toISOString().split('T')[0]!;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — nudges just won't cap, worst case */
  }
}

/** Pure check — exported for tests and non-hook call sites. */
export function canShowNudge(source: string, now: Date = new Date()): boolean {
  const dismissedAt = safeGet(DISMISS_PREFIX + source);
  if (dismissedAt && now.getTime() - Number(dismissedAt) < DISMISS_COOLDOWN_MS) return false;
  const lastShownDay = safeGet(DAY_KEY);
  return lastShownDay !== todayStr(now);
}

/** Records that a nudge was shown today (consumes the daily slot). */
export function markNudgeShown(): void {
  safeSet(DAY_KEY, todayStr());
}

/** Records a dismissal — silences the source for 7 days. */
export function markNudgeDismissed(source: string): void {
  safeSet(DISMISS_PREFIX + source, String(Date.now()));
}

/**
 * Gate for a contextual upgrade nudge. `visible` turns true only when the
 * daily slot is free and the source isn't in dismissal cooldown — and the
 * slot is consumed as soon as it does, so a second nudge on the same day
 * stays hidden. Call `dismiss()` from the nudge's close affordance.
 */
export function useNudge(source: string): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);

  // Post-mount check: localStorage doesn't exist during SSR, and the
  // hydration render must match the server's (nudge hidden).
  useEffect(() => {
    if (canShowNudge(source)) {
      markNudgeShown();
      setVisible(true);
    }
  }, [source]);

  const dismiss = useCallback(() => {
    markNudgeDismissed(source);
    setVisible(false);
  }, [source]);

  return { visible, dismiss };
}
