import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { BOOKING_REMINDER_DAYS } from '@chefer/types';
import { deviceTimeZone, planClientReminders, planTrainerReminders } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useCoachingStatus } from '../coaching/use-coaching-status';
import { useShellMode } from '../trainer-mode/mode-store';
import { useLiveTrainerModeAvailability } from '../trainer-mode/use-trainer-mode';
import {
  getBookingReminderPrefs,
  getBookingReminderSyncTick,
  subscribeBookingReminderPrefs,
  subscribeBookingReminderSyncTick,
  syncBookingReminders,
  type BookingReminderPrefs,
} from './booking-reminders';
import { usePushActive } from './push/push-store';

// Keeps the local booking reminders true (§7.3): re-plans both sides on
// launch, whenever the app returns to the foreground, when a switch flips,
// after the permission is granted, and whenever the bookings change (every
// booking change invalidates these queries, use-bookings.ts). A side whose
// data has not arrived (loading, offline) keeps what is scheduled; a side that
// does not apply (no trainer / not in trainer mode / switch off) is cleared.
// M4 (§7.2 "reminders move from local to remote"): once this device is
// registered for push, the server sends the reminders — both sides are
// cleared and nothing is scheduled locally, so nothing fires twice. Push
// failing or the permission turned off later brings the local ones back.
// Mounted once in the root layout.

const DAY_MS = 24 * 60 * 60 * 1000;

export function useBookingReminderPrefs(): BookingReminderPrefs {
  return useSyncExternalStore(subscribeBookingReminderPrefs, getBookingReminderPrefs);
}

/** The reminder window's start, refreshed on every return to the foreground (a stable query key). */
function useWindowStart(): number {
  const [start, setStart] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') setStart(Math.floor(Date.now() / 60_000) * 60_000);
    });
    return () => sub.remove();
  }, []);
  return start;
}

export function useBookingReminders(): void {
  const prefs = useBookingReminderPrefs();
  const tick = useSyncExternalStore(subscribeBookingReminderSyncTick, getBookingReminderSyncTick);
  const windowStart = useWindowStart();
  const pushActive = usePushActive();
  const client = prefs.client && !pushActive;
  const trainer = prefs.trainer && !pushActive;

  // Client side: only for someone who has a trainer.
  const status = useCoachingStatus();
  const hasTrainer = status.enabled && Boolean(status.data?.trainer);
  const upcoming = trpc.coaching.bookings.upcoming.useQuery(undefined, {
    enabled: hasTrainer && client,
    retry: false,
  });

  // Trainer side: their own bookings, only while this device is in trainer mode.
  const mode = useShellMode();
  const trainerLive = useLiveTrainerModeAvailability();
  const inTrainerMode = mode === 'trainer' && trainerLive === true;
  const range = useMemo(
    () => ({
      from: new Date(windowStart).toISOString(),
      to: new Date(windowStart + (BOOKING_REMINDER_DAYS + 1) * DAY_MS).toISOString(),
    }),
    [windowStart],
  );
  const trainerBookings = trpc.trainer.bookings.range.useQuery(range, {
    enabled: inTrainerMode && trainer,
    retry: false,
  });

  const clientKnown = !status.enabled || status.data !== undefined;
  useEffect(() => {
    if (!hasTrainer || !client) {
      // Coaching status not answered yet: keep what is scheduled (push active: clear regardless).
      if (clientKnown || pushActive) void syncBookingReminders('client', []);
      return;
    }
    if (!upcoming.data) return;
    void syncBookingReminders('client', planClientReminders(upcoming.data, new Date()));
  }, [hasTrainer, clientKnown, client, pushActive, upcoming.data, windowStart, tick]);

  useEffect(() => {
    if (!inTrainerMode || !trainer) {
      // Still deciding whether trainer mode is available: keep what is scheduled.
      if (mode !== 'trainer' || trainerLive !== undefined || pushActive) {
        void syncBookingReminders('trainer', []);
      }
      return;
    }
    if (!trainerBookings.data) return;
    void syncBookingReminders(
      'trainer',
      planTrainerReminders(trainerBookings.data.bookings, new Date(), deviceTimeZone()),
    );
  }, [
    inTrainerMode,
    mode,
    trainerLive,
    trainer,
    pushActive,
    trainerBookings.data,
    windowStart,
    tick,
  ]);
}

function BookingReminderSync(): null {
  useBookingReminders();
  return null;
}

/** Renders nothing; mounts `useBookingReminders` inside the tRPC provider while signed in. */
export function BookingReminderHost({ signedIn }: { signedIn: boolean }) {
  return signedIn ? <BookingReminderSync /> : null;
}
