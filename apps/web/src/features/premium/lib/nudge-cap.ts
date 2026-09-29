'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  canShowNudge as canShowNudgeRule,
  INITIAL_NUDGE_CAP_STATE,
  markNudgeDismissed as markDismissed,
  markNudgeShown as markShown,
  type NudgeCapState,
} from '@chefer/utils';

// ─── Contextual-nudge frequency cap (premium_plan.md §6.5, T-10.1) ─────────────
// Hard taste rules for every moment-based upgrade nudge:
//   1. At most ONE contextual nudge shown per day, across all sources.
//   2. Dismissing a nudge silences that source for 7 days.
//   3. State lives in localStorage — per-device is good enough for taste.
// The rule itself is the storage-agnostic `nudge-cap.ts` in @chefer/utils
// (shared with the mobile adapter); this file is only the localStorage
// adapter. All nudges must render through useNudge().

const STATE_KEY = 'chefer.nudge.cap';

function isState(value: unknown): value is NudgeCapState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { lastShownDay?: unknown; dismissedAt?: unknown };
  return (
    (v.lastShownDay === null || typeof v.lastShownDay === 'string') &&
    typeof v.dismissedAt === 'object' &&
    v.dismissedAt !== null
  );
}

function readState(): NudgeCapState {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isState(parsed) ? parsed : INITIAL_NUDGE_CAP_STATE;
  } catch {
    return INITIAL_NUDGE_CAP_STATE;
  }
}

function writeState(state: NudgeCapState): void {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode etc. — nudges just won't cap, worst case */
  }
}

/** Pure check — exported for tests and non-hook call sites. */
export function canShowNudge(source: string, now: Date = new Date()): boolean {
  return canShowNudgeRule(source, readState(), now);
}

/** Records that a nudge was shown today (consumes the daily slot). */
export function markNudgeShown(now: Date = new Date()): void {
  writeState(markShown(readState(), now));
}

/** Records a dismissal — silences the source for 7 days. */
export function markNudgeDismissed(source: string, now: Date = new Date()): void {
  writeState(markDismissed(source, readState(), now));
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
