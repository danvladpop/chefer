import * as Notifications from 'expo-notifications';

// The gym reminder notifications (gym_plan.md §6.5) all carry this tag in
// their `data`, so one pass can find and cancel exactly them. Kept free of
// hooks/tRPC imports so sign-out can use it without an import cycle.
export const GYM_REMINDER_APP_TAG = 'gym-reminder';

/** Cancels every scheduled gym reminder. Best effort — never throws. */
export async function cancelAllGymReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content.data as { app?: string } | null)?.app === GYM_REMINDER_APP_TAG)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best-effort cleanup; a stale notification is a minor annoyance, not a crash
  }
}
