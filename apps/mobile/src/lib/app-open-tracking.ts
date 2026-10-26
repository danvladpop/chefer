import type { AppStateStatus } from 'react-native';
import { track } from './analytics';

// ─── `app_opened` for D1/D7/D30 retention (market review 2026-10) ──────────────
// PostHog's retention insight counts the days a person fired `app_opened`.
// A cold start alone undercounts: iOS and Android keep a daily user's app
// alive in the background for days. A return to the foreground after
// RESUME_AFTER_MS away counts as an open too. That is PostHog's own session
// timeout, so a quick switch to another app and back is not a new open.

const RESUME_AFTER_MS = 30 * 60_000;

let launchTracked = false;
let backgroundedAt: number | null = null;

/**
 * The cold start's `app_opened`, at most once per JS runtime. `SessionUserHost`
 * calls it once the signed-in account is known (or known to be absent), so a
 * linked user's launch carries their account id, not the per-launch id.
 */
export function trackLaunchOpen(): void {
  if (launchTracked) return;
  launchTracked = true;
  track('app_opened', { from: 'launch' });
}

/** AppState listener: a foreground return after 30+ minutes in the background is a `resume` open. */
export function noteAppStateForOpens(status: AppStateStatus, now: number = Date.now()): void {
  if (status === 'background') {
    backgroundedAt ??= now;
    return;
  }
  if (status !== 'active') return; // iOS `inactive` (Control Center, a call) is not leaving the app
  const away = backgroundedAt === null ? 0 : now - backgroundedAt;
  backgroundedAt = null;
  if (launchTracked && away >= RESUME_AFTER_MS) track('app_opened', { from: 'resume' });
}

/** Test seam: forget the launch and the background time. */
export function resetAppOpenTrackingForTests(): void {
  launchTracked = false;
  backgroundedAt = null;
}
