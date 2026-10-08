import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createExternalStore } from './offline/external-store';
import { KV_KEYS } from './offline/keys';
import { kv } from './offline/kv';

// Rest timer (gym_plan.md §5.3). Stores an ABSOLUTE `endsAt`, so it survives
// backgrounding and even a kill. It lives in its own store: only the timer
// bar subscribes to the per-second tick, never the workout list.

export interface RestTimerState {
  /** Epoch ms when the rest is over. */
  endsAt: number;
  /** Planned rest length (for a progress bar); updated by ±15 s. */
  durationSec: number;
  /** Session exercise the rest follows. */
  seId: string | null;
}

export const REST_ADJUST_STEP_SEC = 15;
const NOTIFICATION_KEY = `${KV_KEYS.restTimer}.notification`;
const ANDROID_CHANNEL_ID = 'rest-timer';

const isState = (value: unknown): value is RestTimerState =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as RestTimerState).endsAt === 'number' &&
  typeof (value as RestTimerState).durationSec === 'number';

const restStore = createExternalStore<RestTimerState | null>(() => {
  const stored = kv.getJSON(KV_KEYS.restTimer);
  return isState(stored) ? stored : null;
});

function write(next: RestTimerState | null): void {
  if (next) kv.setJSON(KV_KEYS.restTimer, next);
  else kv.remove(KV_KEYS.restTimer);
  restStore.set(next);
  // UX-GYM-09/10: the "Rest is over" alert is (re)scheduled the moment the rest
  // STARTS or changes — not when the app later backgrounds, when the OS may
  // have already suspended JS — and cancelled the moment it is cleared.
  void syncNotification();
}

export function getRestTimer(): RestTimerState | null {
  return restStore.get();
}

export const subscribeRestTimer = restStore.subscribe;

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

export function useRestTimer(): RestTimerState | null {
  return useSyncExternalStore(restStore.subscribe, restStore.get);
}

/**
 * Ticking countdown for the timer bar ONLY. Re-renders its caller ~4×/s while
 * a rest runs. `onDone` fires once when the countdown reaches zero (haptic /
 * sound there), and the finished timer is cleared.
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
      // Ran out while the app was closed — clear quietly, no late buzz.
      if (restStore.get()?.endsAt === state.endsAt) write(null);
      return;
    }
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= state.endsAt) {
        clearInterval(id);
        // Only clear if nobody restarted the timer in the meantime.
        if (restStore.get()?.endsAt === state.endsAt) write(null);
        onDoneRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [state]);

  // `now` is the last tick; a just-started rest must not read an older tick.
  const startedAt = state ? state.endsAt - state.durationSec * 1000 : now;
  return { remainingSec: restRemainingSec(state, Math.max(now, startedAt)), state };
}

// ── Background notification ───────────────────────────────────────────────────

let permissionAsked = false;

/**
 * Asks for notification permission at most once per process, and only when
 * called — from a user action (the rationale sheet's "Allow" tap), never on
 * cold start.
 */
export async function ensureRestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (permissionAsked || !current.canAskAgain) return false;
    permissionAsked = true;
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    // A rest already running when the user taps Allow gets its alert now.
    if (requested.granted) void syncNotification();
    return requested.granted;
  } catch {
    return false;
  }
}

/** Whether the OS already granted (or already permanently denied) the permission. */
export async function hasRestNotificationPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * UX-GYM-11: true when asking again would do nothing — the OS has the
 * permission denied and won't show its prompt (iOS after one answer, Android
 * once "don't ask again"), or we already asked in this process. The rationale
 * sheet's "Allow" then opens the phone's Settings instead of silently closing.
 */
export async function restPermissionNeedsSettings(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return false;
    return !current.canAskAgain || permissionAsked;
  } catch {
    return false;
  }
}

const RATIONALE_SHOWN_KEY = KV_KEYS.restPermissionRationaleShown;

/** B-40: the rationale sheet is shown at most once, ever, on this device. */
export function hasShownRestPermissionRationale(): boolean {
  return kv.getString(RATIONALE_SHOWN_KEY) === '1';
}

export function markRestPermissionRationaleShown(): void {
  kv.setString(RATIONALE_SHOWN_KEY, '1');
}

// ── Announcements (UX-GYM-09) ─────────────────────────────────────────────────

/** How far into a rest the screen reader has already been told. */
export type RestAnnounceStage = 'idle' | 'started' | 'tenSeconds';

/** TalkBack/VoiceOver hear the rest at start, at 10 s left and at the end — never every second. */
export const REST_WARNING_SEC = 10;

/**
 * Pure: given the stage already announced and the seconds left, the stage to
 * move to and the message to speak (null = say nothing). Adding time with +15 s
 * past the warning re-arms it; a rest shorter than the warning skips straight
 * to the end.
 */
export function nextRestAnnouncement(
  stage: RestAnnounceStage,
  remainingSec: number,
): { stage: RestAnnounceStage; message: string | null } {
  if (stage === 'idle') {
    return {
      stage: remainingSec <= REST_WARNING_SEC ? 'tenSeconds' : 'started',
      message: `Rest started, ${remainingSec} seconds`,
    };
  }
  if (stage === 'started' && remainingSec <= REST_WARNING_SEC) {
    return { stage: 'tenSeconds', message: `${REST_WARNING_SEC} seconds left` };
  }
  if (stage === 'tenSeconds' && remainingSec > REST_WARNING_SEC) {
    return { stage: 'started', message: null };
  }
  return { stage, message: null };
}

export const REST_OVER_ANNOUNCEMENT = 'Rest is over';

// ── Scheduling the alert ──────────────────────────────────────────────────────

// The stored value is `${notificationId}@${endsAt}` so a second sync for the
// SAME end instant is a no-op (an older build stored just the id).
function readScheduled(): { id: string; endsAt: number } | null {
  const raw = kv.getString(NOTIFICATION_KEY);
  if (!raw) return null;
  const at = raw.lastIndexOf('@');
  if (at < 0) return { id: raw, endsAt: Number.NaN };
  return { id: raw.slice(0, at), endsAt: Number(raw.slice(at + 1)) };
}

async function cancelScheduled(): Promise<void> {
  const scheduled = readScheduled();
  if (!scheduled) return;
  kv.remove(NOTIFICATION_KEY);
  try {
    await Notifications.cancelScheduledNotificationAsync(scheduled.id);
  } catch {
    // Already delivered or gone.
  }
}

async function reconcileNotification(): Promise<void> {
  try {
    const state = restStore.get();
    if (!state || state.endsAt - Date.now() < 1000) {
      await cancelScheduled();
      return;
    }
    if (readScheduled()?.endsAt === state.endsAt) return; // already set for this end
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return; // never prompt from the background
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    await cancelScheduled();
    // The rest may have been skipped or changed while we awaited the OS.
    const latest = restStore.get();
    if (!latest || latest.endsAt - Date.now() < 1000) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest is over',
        body: 'Time for your next set.',
        sound: true,
        data: { kind: 'gym-rest-timer' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: latest.endsAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
    kv.setString(NOTIFICATION_KEY, `${id}@${latest.endsAt}`);
  } catch {
    // Notifications are a convenience; the timer itself is unaffected.
  }
}

// Reconciles run one at a time, each reading the CURRENT rest when it runs, so a
// quick start → +15 s → skip never leaves a stray or duplicate notification.
let reconcileChain: Promise<void> = Promise.resolve();

/** Makes the one scheduled "Rest is over" notification match the current rest (or none). */
export function syncNotification(): Promise<void> {
  reconcileChain = reconcileChain.then(reconcileNotification, reconcileNotification);
  return reconcileChain;
}

/**
 * Keeps the OS notification in step with the rest for the life of the app:
 * a launch re-syncs a rest that survived a kill (or drops a stale alert), and
 * a background transition re-syncs once more (e.g. permission was granted
 * after the rest began). Returns a stop fn.
 */
export function startRestNotifications(): () => void {
  void syncNotification();
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status === 'background') void syncNotification();
  });
  return () => subscription.remove();
}

/** Test seam. */
export function resetRestTimerForTests(): void {
  restStore.reset();
  permissionAsked = false;
}
