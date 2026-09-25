import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { localDate, nowIso } from '../offline/ids';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { hasGymReminderPermission } from './permission';
import { computeGymReminders, type GymReminder } from './schedule';

// Reminder scheduling effect (gym_plan.md §6.5). Cancels and reschedules
// every gym reminder notification whenever the bootstrap's reminder-relevant
// fields change, or the app comes back to the foreground — never on a raw
// bootstrap identity change (an offline optimistic fold after Finish touches
// unrelated fields constantly and must not spam the OS scheduler). Permission
// is only CHECKED here, never requested — asking happens from a user action
// (the settings toggle, ../settings/settings-screen.tsx, and the setup
// wizard's reminder step), per the "never on cold start" rule.

const APP_TAG = 'gym-reminder';
const ANDROID_CHANNEL_ID = 'gym-reminders';

async function cancelAllGymReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content.data as { app?: string } | null)?.app === APP_TAG)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best-effort cleanup; a stale notification is a minor annoyance, not a crash
  }
}

async function scheduleGymReminders(reminders: readonly GymReminder[]): Promise<void> {
  if (reminders.length === 0) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Training reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    for (const reminder of reminders) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: false,
          data: { app: APP_TAG, kind: reminder.kind },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.at),
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    }
  } catch {
    // best-effort; a failed schedule call shouldn't crash the effect
  }
}

/** The most recently COMPLETED session's localDate, or null. `recentSessions` is newest-first. */
function lastCompletedDate(recentSessions: { status: string; localDate: string }[]): string | null {
  return recentSessions.find((s) => s.status === 'COMPLETED')?.localDate ?? null;
}

/**
 * Mount this once in the gym Today screen AND somewhere always mounted in the
 * signed-in tree (the food dashboard's `TodaysWorkoutCard`), so reminders stay
 * correct whether the user lives on the food side or the gym side of the app.
 * Two mounts recomputing the same signature is harmless — scheduling is
 * idempotent (cancel-then-reschedule).
 */
export function useGymReminders(): void {
  const { data: bootstrap } = useGymBootstrap();

  const profile = bootstrap?.profile ?? null;
  const activeRoutine = bootstrap?.activeRoutine ?? null;
  const activePause = bootstrap?.activePause ?? null;
  const lastSessionDate = bootstrap ? lastCompletedDate(bootstrap.recentSessions) : null;

  // A stable signature of everything the schedule depends on, so an
  // unrelated bootstrap change (e.g. a synced set) never triggers a reschedule.
  const signature = profile
    ? JSON.stringify({
        enabled: profile.reminderEnabled,
        time: profile.reminderTime,
        days: activeRoutine?.days.map((d) => [d.plannedWeekday, d.name]) ?? null,
        last: lastSessionDate,
        pause: activePause,
      })
    : null;

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    const run = async () => {
      if (!profile.reminderEnabled || !profile.reminderTime) {
        await cancelAllGymReminders();
        return;
      }
      const granted = await hasGymReminderPermission();
      await cancelAllGymReminders();
      if (cancelled || !granted) return; // never prompt from here
      const reminders = computeGymReminders({
        profile,
        activeRoutine,
        lastSessionDate,
        today: localDate(),
        now: nowIso(),
        activePause,
      });
      await scheduleGymReminders(reminders);
    };

    void run();
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void run();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
    // `signature` captures every field `run` reads off `profile`/`activeRoutine`/
    // `activePause`/`lastSessionDate` — re-running on it alone keeps this effect
    // correct without an ever-growing, referentially-unstable dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
