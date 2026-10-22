import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { MealReminders, PlanSlot } from '@chefer/types';
import { MEAL_REMINDER_NOTIFICATION, mealReminderMoments } from '@chefer/utils';
import { hasGymReminderPermission } from '../gym/reminders/permission';

// Meal-time reminders (market review 2026-10, lane E1): one LOCAL notification
// per planned meal at the user's time ("Breakfast time", 08:00). The choice
// lives on the server (`notifications.getMealReminders`) so web can show it;
// this module only schedules.
//
// - A ROLLING WINDOW of one-shot notifications for the next few days
//   (MEAL_REMINDER_DAYS), re-planned on launch, on foreground and whenever
//   today's log changes (see use-meal-reminders.ts). A repeating trigger
//   could not skip a meal that is already logged or ticked; a window can, and
//   a user who stops opening the app gets a few days of reminders, never an
//   endless stream.
// - Permission is only ever CHECKED here (never prompted): asking stays in the
//   user-action paths (the onboarding offer, Settings → Notifications).

export const MEAL_REMINDER_APP_TAG = 'meal-reminder';
const ANDROID_CHANNEL_ID = 'meal-reminders';

/** The only screen a meal reminder opens (never a payload-supplied path). */
export const MEAL_REMINDER_ROUTE = '/tracker';

function isMealReminderTag(data: unknown): boolean {
  return (data as { app?: unknown } | null)?.app === MEAL_REMINDER_APP_TAG;
}

/** The route a tapped meal reminder should open, or null for any other notification. */
export function mealReminderNotificationUrl(data: unknown): typeof MEAL_REMINDER_ROUTE | null {
  return isMealReminderTag(data) ? MEAL_REMINDER_ROUTE : null;
}

/** Cancels every scheduled meal reminder. Best effort — never throws. */
export async function cancelAllMealReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => isMealReminderTag(n.content.data))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort — a stale reminder is an annoyance, not a crash
  }
}

// Two syncs overlapping (a Settings change and the foreground hook) would each
// cancel-then-schedule and leave duplicates, so they run one at a time.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export interface SyncMealRemindersInput {
  reminders: MealReminders;
  /** Planned weekdays, 0 = Monday (reminders only fire on plan days). */
  planDays: readonly number[];
  /** Meals already logged or ticked today (today's reminder for them is skipped). */
  doneToday: ReadonlySet<PlanSlot>;
  now?: Date;
}

/**
 * Makes the scheduled notifications match `reminders`: cancels every meal
 * reminder, then schedules the window. Without notification permission
 * nothing is scheduled and nothing is asked.
 */
export function syncMealReminders({
  reminders,
  planDays,
  doneToday,
  now = new Date(),
}: SyncMealRemindersInput): Promise<void> {
  return enqueue(async () => {
    await cancelAllMealReminders();
    const moments = mealReminderMoments(now, reminders, planDays, doneToday);
    if (moments.length === 0) return;
    if (!(await hasGymReminderPermission())) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Mealtime reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      for (const { slot, at } of moments) {
        await Notifications.scheduleNotificationAsync({
          content: {
            ...MEAL_REMINDER_NOTIFICATION[slot],
            sound: false,
            data: { app: MEAL_REMINDER_APP_TAG, slot },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
            channelId: ANDROID_CHANNEL_ID,
          },
        });
      }
    } catch {
      // best effort — a failed schedule call must not crash the caller
      await cancelAllMealReminders();
    }
  });
}
