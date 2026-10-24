import * as Notifications from 'expo-notifications';
import { resetLandingCacheForTests as resetLandingCache } from '../../navigation/landing-cache';
import { setHealthConsentDeclined } from '../../privacy/health-declined-store';
import { REVIEW_PROMPT_KEY } from '../../review/review-store';
import { shopOutbox } from '../../shopping-list/shop-outbox';
import { clearPendingRebalance } from '../../tracker/rebalance-store';
import { coachedOutboxes } from '../../trainer-coach/coached-outbox';
import { coachedSessionStore } from '../../trainer-coach/coached-session-store';
import { resetTrainerModeAvailableCache, SHELL_MODE_KEY } from '../../trainer-mode/mode-store';
import { resetModeForTests as resetModeStore } from '../mode-store';
import { resetRestTimerForTests as resetRestTimerStore } from '../rest-timer';
import { resetCardioTimerForTests as resetCardioTimerStore } from '../workout/cardio-timer';
import { activeSessionStore } from './active-session-store';
import { KV_KEYS } from './keys';
import { kv } from './kv';
import { outbox } from './outbox';
import { resetGymOwnerForTests as resetGymOwnerStore } from './owner';
import { resetSessionCorrectionsForTests as resetSessionCorrectionsStore } from './session-corrections';

// UX-ACC-02 / UX-ACC-12: what the device forgets when an account leaves.
//
// The on-device key-value store holds one account's state (gym outbox and
// active workout, gym read cache, Food/Gym mode, landing cache, per-exercise
// notes, plan banner dismissals, pantry/nudge/share preferences, the
// onboarding draft …). It is wiped by SCANNING for keys, not from a list: a
// key somebody adds next month is wiped too, and only what belongs to the
// DEVICE has to be named here.

/**
 * KV keys that belong to the phone, not the account — they survive sign-out.
 * `review.prompt-state` (REVIEW_PROMPT_KEY): the store rating prompt's 120-day
 * cooldown and active days — a sign-out must not reopen the prompt.
 * `shell.mode` (SHELL_MODE_KEY): personal or trainer mode, a per-device choice
 * (trainer mode §5.1). The account's "trainer mode available" answer is wiped,
 * so the next account opens in personal mode until its own answer arrives.
 */
export const DEVICE_KV_KEYS_KEPT: readonly string[] = [
  'analytics.consent',
  REVIEW_PROMPT_KEY,
  SHELL_MODE_KEY,
];

/** Gym keys that survive a session expiry so unsynced workouts upload on re-login. */
function isKeptGymKey(key: string): boolean {
  return key.startsWith('gym.') && key !== KV_KEYS.queryCache;
}

async function cancelRestTimerNotification(): Promise<void> {
  const id = kv.getString(`${KV_KEYS.restTimer}.notification`);
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already delivered or gone
  }
}

/**
 * Wipes the account-owned device state and resets the in-memory stores that
 * cached it. `keepGymData` (session expired, user did not choose to leave):
 * unsynced workouts, the in-progress session and the gym owner stay so they
 * upload when the same account signs back in — every other account's data is
 * still kept apart by the owner stamp on each outbox entry.
 */
export async function clearLocalUserData(opts: { keepGymData: boolean }): Promise<void> {
  if (!opts.keepGymData) await cancelRestTimerNotification();

  const kept = new Set(DEVICE_KV_KEYS_KEPT);
  for (const key of kv.keys()) {
    if (kept.has(key)) continue;
    if (opts.keepGymData && isKeptGymKey(key)) continue;
    kv.remove(key);
  }

  // In-memory copies of what was just removed (the names say "ForTests"; they
  // are the stores' only "forget the cached value" seam).
  resetModeStore();
  resetLandingCache();
  resetTrainerModeAvailableCache();
  setHealthConsentDeclined(false);
  clearPendingRebalance();
  // ADR 0003: the Shop outbox's key was just wiped (it is the account's, not `gym.`).
  shopOutbox.reload();
  if (!opts.keepGymData) {
    activeSessionStore.clear();
    outbox.reload();
    resetGymOwnerStore();
    resetRestTimerStore();
    resetCardioTimerStore();
    resetSessionCorrectionsStore();
    // Trainer mode M3: coached workouts follow the trainer's own (kept on expiry, wiped here).
    coachedSessionStore.reload();
    coachedOutboxes.reload();
  }
}
