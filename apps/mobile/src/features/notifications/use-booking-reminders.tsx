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

// Keeps the local booking reminders true (§7.3): re-plans both sides on
// launch, whenever the app returns to the foreground, when a switch flips,
// after the permission is granted, and whenever the bookings change (every
// booking change invalidates these queries, use-bookings.ts). A side whose
// data has not arrived (loading, offline) keeps what is scheduled; a side that
// does not apply (no trainer / not in trainer mode / switch off) is cleared.
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

  // Client side: only for someone who has a trainer.
  const status = useCoachingStatus();
  const hasTrainer = status.enabled && Boolean(status.data?.trainer);
  const upcoming = trpc.coaching.bookings.upcoming.useQuery(undefined, {
    enabled: hasTrainer && prefs.client,
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
    enabled: inTrainerMode && prefs.trainer,
    retry: false,
  });

  const clientKnown = !status.enabled || status.data !== undefined;
  useEffect(() => {
    if (!hasTrainer || !prefs.client) {
      // Coaching status not answered yet: keep what is scheduled.
      if (clientKnown) void syncBookingReminders('client', []);
      return;
    }
    if (!upcoming.data) return;
    void syncBookingReminders('client', planClientReminders(upcoming.data, new Date()));
  }, [hasTrainer, clientKnown, prefs.client, upcoming.data, windowStart, tick]);

  useEffect(() => {
    if (!inTrainerMode || !prefs.trainer) {
      // Still deciding whether trainer mode is available: keep what is scheduled.
      if (mode !== 'trainer' || trainerLive !== undefined) {
        void syncBookingReminders('trainer', []);
      }
      return;
    }
    if (!trainerBookings.data) return;
    void syncBookingReminders(
      'trainer',
      planTrainerReminders(trainerBookings.data.bookings, new Date(), deviceTimeZone()),
    );
  }, [inTrainerMode, mode, trainerLive, prefs.trainer, trainerBookings.data, windowStart, tick]);
}

function BookingReminderSync(): null {
  useBookingReminders();
  return null;
}

/** Renders nothing; mounts `useBookingReminders` inside the tRPC provider while signed in. */
export function BookingReminderHost({ signedIn }: { signedIn: boolean }) {
  return signedIn ? <BookingReminderSync /> : null;
}
