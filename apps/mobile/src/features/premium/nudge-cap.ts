import { useEffect, useState } from 'react';
import { type PremiumSource } from '@chefer/types';
import {
  canShowNudge,
  INITIAL_NUDGE_CAP_STATE,
  markNudgeDismissed,
  markNudgeShown,
  type NudgeCapState,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { kv } from '../gym/offline/kv';

// ─── Mobile nudge cap (UX-10 §6, AC8, T-10.2) ──────────────────────────────────
// Storage adapter for the pure rule in @chefer/utils (`nudge-cap.ts`): at most
// ONE contextual nudge per day across every source, and a dismissed source
// stays quiet for 7 days. State lives in the KV store (per device, like web's
// localStorage). A user-initiated open (`openPremium` from a tap) is never a
// nudge and is never capped — only unprompted ones (a rating nudge, a Monday
// banner) go through `useNudge`.

// Its own key, not the gym `KV_KEYS` registry (owned by another lane).
const NUDGE_KEY = 'premium.nudge-cap';

function isState(value: unknown): value is NudgeCapState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<NudgeCapState>;
  return (
    (v.lastShownDay === null || typeof v.lastShownDay === 'string') &&
    typeof v.dismissedAt === 'object' &&
    v.dismissedAt !== null
  );
}

export function readNudgeState(): NudgeCapState {
  try {
    const raw = kv.getJSON(NUDGE_KEY);
    return isState(raw) ? raw : INITIAL_NUDGE_CAP_STATE;
  } catch {
    return INITIAL_NUDGE_CAP_STATE;
  }
}

function writeNudgeState(next: NudgeCapState): void {
  try {
    kv.setJSON(NUDGE_KEY, next);
  } catch {
    // Storage unavailable: nudges just won't cap, worst case.
  }
}

/** Whether a nudge for `source` may show now; consumes today's slot when it may. */
export function tryShowNudge(source: string, now: Date = new Date()): boolean {
  const state = readNudgeState();
  if (!canShowNudge(source, state, now)) {
    track('nudge_suppressed', { source: source as PremiumSource });
    return false;
  }
  writeNudgeState(markNudgeShown(state, now));
  return true;
}

export function dismissNudge(source: string, now: Date = new Date()): void {
  writeNudgeState(markNudgeDismissed(source, readNudgeState(), now));
}

/**
 * Gate for an unprompted upgrade nudge: `visible` turns true only when the
 * daily slot is free and the source is not in its 7-day cooldown. Mount the
 * nudge only when its trigger moment has come, and call `dismiss()` from its
 * close affordance.
 */
export function useNudge(source: string): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (tryShowNudge(source)) setVisible(true);
  }, [source]);
  return {
    visible,
    dismiss: () => {
      dismissNudge(source);
      setVisible(false);
    },
  };
}
