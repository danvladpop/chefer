import { localDateStr } from './date';

// ─── Contextual-nudge frequency cap, pure rule (§2.7, T-10.1) ──────────────────
// Hard taste rules for every moment-based upgrade nudge:
//   1. At most ONE contextual nudge shown per day, across all sources.
//   2. Dismissing a nudge silences that source for 7 days.
// Storage-agnostic: callers (web `localStorage`, mobile gym KV) persist
// `NudgeCapState` however they like and pass it back in. See
// `apps/web/src/features/premium/lib/nudge-cap.ts` for the localStorage
// adapter this rule was extracted from.

export const NUDGE_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface NudgeCapState {
  /** YYYY-MM-DD of the last day any nudge was shown, or null. */
  lastShownDay: string | null;
  /** source -> epoch ms it was dismissed at. */
  dismissedAt: Record<string, number>;
}

export const INITIAL_NUDGE_CAP_STATE: NudgeCapState = { lastShownDay: null, dismissedAt: {} };

/** Whether a nudge for `source` may be shown right now. */
export function canShowNudge(
  source: string,
  state: NudgeCapState,
  now: Date = new Date(),
): boolean {
  const dismissedAt = state.dismissedAt[source];
  if (dismissedAt !== undefined && now.getTime() - dismissedAt < NUDGE_DISMISS_COOLDOWN_MS) {
    return false;
  }
  return state.lastShownDay !== localDateStr(now);
}

/** Consumes today's slot — call once a nudge is actually shown. */
export function markNudgeShown(state: NudgeCapState, now: Date = new Date()): NudgeCapState {
  return { ...state, lastShownDay: localDateStr(now) };
}

/** Silences `source` for 7 days. */
export function markNudgeDismissed(
  source: string,
  state: NudgeCapState,
  now: Date = new Date(),
): NudgeCapState {
  return { ...state, dismissedAt: { ...state.dismissedAt, [source]: now.getTime() } };
}
