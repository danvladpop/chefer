import * as Notifications from 'expo-notifications';

// Notification permission for gym reminders (gym_plan.md §6.5): asked only
// from a user action — the settings toggle and the setup wizard's reminder
// step — NEVER on cold start or from the background reschedule effect. Mirrors
// the rest timer's `ensureRestNotificationPermission` (../rest-timer.ts), kept
// separate because the two features can be granted independently by the OS
// (a user may allow one kind of alert and not the other) and are asked at
// different moments in the app.

let askedThisSession = false;

/**
 * Requests notification permission at most once per process if the OS allows
 * asking again. Returns whether reminders can actually be scheduled.
 */
export async function ensureGymReminderPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (askedThisSession || !current.canAskAgain) return false;
    askedThisSession = true;
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return requested.granted;
  } catch {
    return false;
  }
}

/** Whether reminders can be scheduled right now, without prompting. */
export async function hasGymReminderPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.granted;
  } catch {
    return false;
  }
}

/** Test seam. */
export function resetGymReminderPermissionForTests(): void {
  askedThisSession = false;
}
