import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Weekly phone notifications (audit P2-5): a Monday "Your week is ready" and
// a Sunday "Your week in review", as LOCAL repeating notifications — no push
// tokens or server infrastructure. They fire at the phone's own local time
// (Monday 08:00, Sunday 18:00), which the emails can't do (the server stores
// no time zone). The scheduled notifications themselves are the state: "on"
// means they are scheduled, so there is nothing else to persist or drift.
//
// Permission is only ever requested from the Preferences switch (a user
// action), never on launch — see ../gym/reminders/permission.ts.

export const WEEKLY_APP_TAG = 'weekly-digest';
const ANDROID_CHANNEL_ID = 'weekly-digest';

export interface WeeklyNotificationSpec {
  kind: 'week-ready' | 'weekly-recap';
  /** expo-notifications WEEKLY trigger weekday: 1 = Sunday … 7 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
  title: string;
  body: string;
  /** Route opened when the notification is tapped. */
  url: string;
}

export const WEEKLY_NOTIFICATIONS: readonly WeeklyNotificationSpec[] = [
  {
    kind: 'week-ready',
    weekday: 2, // Monday
    hour: 8,
    minute: 0,
    title: 'Your week is ready',
    body: "See this week's dinners and your shopping list.",
    url: '/meal-plan',
  },
  {
    kind: 'weekly-recap',
    weekday: 1, // Sunday
    hour: 18,
    minute: 0,
    title: 'Your week in review',
    body: 'What you cooked, logged and trained this week.',
    url: '/progress',
  },
];

function isWeeklyTag(data: unknown): boolean {
  return (data as { app?: unknown } | null)?.app === WEEKLY_APP_TAG;
}

/** The route a tapped weekly notification should open, or null for any other notification. */
export function weeklyNotificationUrl(data: unknown): string | null {
  if (!isWeeklyTag(data)) return null;
  const url = (data as { url?: unknown }).url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}

async function scheduledWeekly(): Promise<Notifications.NotificationRequest[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) => isWeeklyTag(n.content.data));
}

/** Whether the weekly notifications are scheduled on this phone. */
export async function areWeeklyNotificationsOn(): Promise<boolean> {
  try {
    return (await scheduledWeekly()).length > 0;
  } catch {
    return false;
  }
}

export async function cancelWeeklyNotifications(): Promise<void> {
  try {
    const scheduled = await scheduledWeekly();
    await Promise.all(
      scheduled.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort — a stale notification is an annoyance, not a crash
  }
}

/** Replaces any existing weekly notifications with the two repeating ones. */
export async function scheduleWeeklyNotifications(): Promise<boolean> {
  await cancelWeeklyNotifications();
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Weekly plan & recap',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    for (const spec of WEEKLY_NOTIFICATIONS) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: spec.title,
          body: spec.body,
          sound: false,
          data: { app: WEEKLY_APP_TAG, kind: spec.kind, url: spec.url },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: spec.weekday,
          hour: spec.hour,
          minute: spec.minute,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    }
    return true;
  } catch {
    await cancelWeeklyNotifications();
    return false;
  }
}
