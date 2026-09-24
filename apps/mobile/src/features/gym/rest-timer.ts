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
 * called — from a user action inside a workout, never on cold start.
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
    return requested.granted;
  } catch {
    return false;
  }
}

async function cancelScheduled(): Promise<void> {
  const id = kv.getString(NOTIFICATION_KEY);
  if (!id) return;
  kv.remove(NOTIFICATION_KEY);
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already delivered or gone.
  }
}

async function scheduleForRest(state: RestTimerState): Promise<void> {
  if (state.endsAt - Date.now() < 1000) return;
  try {
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
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest is over',
        body: 'Time for your next set.',
        sound: true,
        data: { kind: 'gym-rest-timer' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: state.endsAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
    kv.setString(NOTIFICATION_KEY, id);
  } catch {
    // Notifications are a convenience; the timer itself is unaffected.
  }
}

/**
 * Schedules a local notification at `endsAt` when the app backgrounds with a
 * rest running, and cancels it when the app comes back. Returns a stop fn.
 */
export function startRestNotifications(): () => void {
  void cancelScheduled(); // a launch means we're in the foreground
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status === 'background') {
      const state = restStore.get();
      if (state) void scheduleForRest(state);
    } else if (status === 'active') {
      void cancelScheduled();
    }
  });
  return () => subscription.remove();
}

/** Test seam. */
export function resetRestTimerForTests(): void {
  restStore.reset();
  permissionAsked = false;
}
