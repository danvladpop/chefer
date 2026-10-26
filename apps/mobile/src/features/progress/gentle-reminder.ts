import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ProgressSettings } from '@chefer/types';
import { REMINDER_LINES } from '@chefer/utils';
import { kv } from '../gym/offline/kv';
import { hasGymReminderPermission } from '../gym/reminders/permission';

// The gentle reminder (idea 58, tech-plan §6): one local notification, off by
// default (D6), no push tokens, no server involvement beyond the settings.
//
//  - On every foreground the pending reminder is cancelled and ONE is scheduled
//    for the next day it may fire, at the chosen time. So it only ever fires on
//    a day the app wasn't opened before that time.
//  - Back-off. A reminder that fired before the next open counts as ignored; an
//    open before it fired resets the count (opening the app resets everything).
//    After 3 ignored in a row the next one is 3 days out; after 3 more, weekly.
//  - It skips a day that already has another Chefer notification (food nudges,
//    gym reminders, booking reminders): at most one a day in total.
//  - Copy is invitational (`REMINDER_LINES`), never guilt.
// Permission is only CHECKED here; asking happens from the switch in
// Rewards & motivation. expo-notifications is already installed: OTA-safe.

export const GENTLE_REMINDER_APP_TAG = 'progress-reminder';
export const GENTLE_REMINDER_KEY = 'progress.gentle-reminder';
const ANDROID_CHANNEL_ID = 'progress-reminders';
/** How many days ahead we look for a day without another notification. */
const SKIP_LIMIT_DAYS = 7;
const DAY_MS = 86_400_000;

export type ReminderState = {
  /** Reminders in a row that fired before the app was opened again. */
  ignored: number;
  /** When the reminder we scheduled is due (ISO), or null when none is pending. */
  scheduledAt: string | null;
};

const FRESH: ReminderState = { ignored: 0, scheduledAt: null };

export function readReminderState(): ReminderState {
  const raw = kv.getJSON(GENTLE_REMINDER_KEY);
  if (typeof raw !== 'object' || raw === null) return FRESH;
  const { ignored, scheduledAt } = raw as { ignored?: unknown; scheduledAt?: unknown };
  return {
    ignored: typeof ignored === 'number' && ignored >= 0 ? Math.floor(ignored) : 0,
    scheduledAt: typeof scheduledAt === 'string' ? scheduledAt : null,
  };
}

function writeReminderState(state: ReminderState): void {
  kv.setJSON(GENTLE_REMINDER_KEY, state);
}

/** Days between reminders after `ignored` in a row: daily, then every 3rd day, then weekly. */
export function reminderIntervalDays(ignored: number): number {
  if (ignored < 3) return 1;
  if (ignored < 6) return 3;
  return 7;
}

/** The counter after this open: a reminder that fired counts as ignored; an open before it resets. */
export function nextIgnoredCount(state: ReminderState, now: Date): number {
  if (state.scheduledAt === null) return state.ignored;
  return new Date(state.scheduledAt).getTime() <= now.getTime() ? state.ignored + 1 : 0;
}

function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 19, m ?? 30, 0, 0);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type ScheduledTrigger = { type?: string; value?: number; date?: number; weekday?: number } | null;

/** Whether a scheduled notification's trigger lands on `day` (one-shot dates and weekly repeats). */
export function triggerFallsOn(trigger: ScheduledTrigger, day: Date): boolean {
  if (!trigger) return false;
  const stamp = trigger.value ?? trigger.date;
  if (trigger.type === 'date' && typeof stamp === 'number') return sameDay(new Date(stamp), day);
  if (trigger.type === 'weekly' && typeof trigger.weekday === 'number') {
    // expo: 1 = Sunday … 7 = Saturday; Date#getDay: 0 = Sunday.
    return trigger.weekday === day.getDay() + 1;
  }
  if (trigger.type === 'daily') return true;
  return false;
}

export interface ReminderPlan {
  at: Date;
  state: ReminderState;
}

/**
 * Pure: when the next reminder should fire. `busyOn(day)` says whether another
 * Chefer notification already sits on that day.
 */
export function planReminder(input: {
  now: Date;
  time: string;
  state: ReminderState;
  busyOn: (day: Date) => boolean;
}): ReminderPlan {
  const ignored = nextIgnoredCount(input.state, input.now);
  const interval = reminderIntervalDays(ignored);
  let day = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate() + interval);
  for (let i = 0; i < SKIP_LIMIT_DAYS && input.busyOn(day); i += 1) {
    day = new Date(day.getTime() + DAY_MS);
    // DST: normalise back to local midnight of the next calendar day.
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  }
  const at = atTime(day, input.time);
  return { at, state: { ignored, scheduledAt: at.toISOString() } };
}

function isOurs(data: unknown): boolean {
  return (data as { app?: unknown } | null)?.app === GENTLE_REMINDER_APP_TAG;
}

/** Cancels the pending reminder (best effort) and forgets it; the back-off count is kept. */
export async function cancelGentleReminder(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => isOurs(n.content.data))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort
  }
}

/** Sign-out: cancel it and forget its state (the key is also wiped by the KV scan). */
export async function clearGentleReminder(): Promise<void> {
  kv.remove(GENTLE_REMINDER_KEY);
  await cancelGentleReminder();
}

// Two syncs at once (foreground + a settings change) would each cancel and
// schedule, leaving two reminders: they run one at a time.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Makes the one pending reminder match the setting. Kitchen progress off: does
 * nothing. Disabled: cancels what we scheduled before, and does nothing if we
 * never scheduled anything. Enabled: back-off, skip busy days, schedule.
 */
export function syncGentleReminder(
  reminder: ProgressSettings['reminder'] | null,
  options: { gateOn: boolean; now?: Date },
): Promise<void> {
  return enqueue(async () => {
    // Kitchen progress off: nothing to do. (A reminder armed before a rollback
    // fires at most once: only a foreground re-arms it.)
    if (!options.gateOn) return;
    const now = options.now ?? new Date();
    const state = readReminderState();
    if (!reminder?.enabled) {
      if (state.scheduledAt !== null) {
        await cancelGentleReminder();
        writeReminderState(FRESH);
      }
      return;
    }
    if (!(await hasGymReminderPermission())) {
      await cancelGentleReminder();
      return;
    }
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      const others = all.filter((n) => !isOurs(n.content.data));
      const plan = planReminder({
        now,
        time: reminder.time,
        state,
        busyOn: (day) => others.some((n) => triggerFallsOn(n.trigger as ScheduledTrigger, day)),
      });
      await cancelGentleReminder();
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Gentle reminder',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const line =
        REMINDER_LINES[Math.floor(plan.at.getTime() / DAY_MS) % REMINDER_LINES.length] ??
        REMINDER_LINES[0];
      if (!line) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: line.title,
          body: line.body,
          sound: false,
          data: { app: GENTLE_REMINDER_APP_TAG },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: plan.at,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
      writeReminderState(plan.state);
    } catch {
      // best effort: a failed schedule call must not crash the host
    }
  });
}

/** Keeps the reminder true: on mount, when the setting changes and on every foreground. */
export function useGentleReminder(
  reminder: ProgressSettings['reminder'] | null,
  gateOn: boolean,
): void {
  const enabled = reminder?.enabled ?? false;
  const time = reminder?.time ?? null;
  useEffect(() => {
    // Off, or the settings have not loaded yet: leave the pending reminder alone.
    if (!gateOn || time === null) return;
    const current = { enabled, time };
    const run = () => void syncGentleReminder(current, { gateOn });
    run();
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') run();
    });
    return () => sub.remove();
  }, [enabled, time, gateOn]);
}
