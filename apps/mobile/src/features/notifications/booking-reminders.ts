import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Translator } from '@chefer/i18n';
import type { ClientBookingDto, TrainerBookingDto } from '@chefer/types';
import {
  BOOKING_REMINDER_APP_TAG,
  bookingTime,
  bookingWhat,
  planClientReminders,
  planTrainerReminders,
  type BookingReminderPlan,
  type BookingReminderRole,
} from '@chefer/utils';
import { getTranslator } from '../../lib/i18n';
import { kv } from '../gym/offline/kv';
import { ensureGymReminderPermission, hasGymReminderPermission } from '../gym/reminders/permission';
import { bookingWhoText } from '../trainer-mode/bookings/booking-model';

// ─── Local booking reminders (docs/prd-2026-10/trainer-mode.md §7.3, O-5) ────
// A LOCAL notification 60 minutes before each upcoming booking in the next 14
// days — no push token, no native change (expo-notifications local scheduling
// is already in the binary). Two independent sides:
//  - client: the user's own bookings (`coaching.bookings.upcoming`),
//    "Session with Ana in 1 hour";
//  - trainer: the trainer's own bookings while the device is in trainer mode,
//    "18:00 Maria · Lower body A".
// Each reminder is keyed by role + booking id; every sync cancels that side's
// reminders and schedules the plan again (the plan is shared:
// `planClientReminders` / `planTrainerReminders` in @chefer/utils), so a
// moved or cancelled booking (or a switch turned off) leaves nothing stale. Each side has a switch (default
// on) in the device KV — account-owned: sign-out wipes it and cancels all.
// Permission is only CHECKED when scheduling; it is asked once, at a moment
// with value (the first booking card a client sees, the first booking a
// trainer makes — never at launch), see `askBookingReminderPermissionOnce`.
// A tap opens the booking in the right mode (§5.1): see open-booking.ts.

const KV_KEY = 'notifications.booking-reminders';
const ASKED_KEY = 'notifications.booking-reminders.asked';
const ANDROID_CHANNEL_ID = 'booking-reminders';

export type BookingReminderPrefs = Record<BookingReminderRole, boolean>;

/** The booking a tapped reminder is about, or null for any other notification. */
export function bookingReminderTarget(
  data: unknown,
): { role: BookingReminderRole; bookingId: string } | null {
  const d = data as { app?: unknown; role?: unknown; bookingId?: unknown } | null;
  if (d?.app !== BOOKING_REMINDER_APP_TAG) return null;
  if (d.role !== 'client' && d.role !== 'trainer') return null;
  if (typeof d.bookingId !== 'string' || d.bookingId === '') return null;
  return { role: d.role, bookingId: d.bookingId };
}

// ─── The reminder text, in the UI language ────────────────────────────────────
// `planClientReminders` / `planTrainerReminders` decide WHEN (shared with
// web); the body is written here with the app's translator, so a reminder
// reads in the same language as the screens.

/** The client's reminders: "Session with Ana in 1 hour". */
export function clientReminderPlan(
  bookings: readonly ClientBookingDto[],
  now: Date,
  tr: Translator = getTranslator(),
): BookingReminderPlan[] {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  return planClientReminders(bookings, now).map((item) => ({
    ...item,
    body: tr.t('trainer.bookings.reminders.clientBody', {
      trainer: byId.get(item.bookingId)?.trainer.name ?? '',
    }),
  }));
}

/** The trainer's reminders: "18:00 Maria · Lower body A". */
export function trainerReminderPlan(
  bookings: readonly TrainerBookingDto[],
  now: Date,
  zone: string,
  tr: Translator = getTranslator(),
): BookingReminderPlan[] {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  return planTrainerReminders(bookings, now, zone).map((item) => {
    const b = byId.get(item.bookingId);
    if (!b) return item;
    const body = [`${bookingTime(b.startsAt, zone)} ${bookingWhoText(tr, b)}`, bookingWhat(b)]
      .filter(Boolean)
      .join(' · ');
    return { ...item, body };
  });
}

// ─── The switches ─────────────────────────────────────────────────────────────

const DEFAULT_PREFS: BookingReminderPrefs = { client: true, trainer: true };

/** Missing = on (§7.3 "default on"); only an explicit `false` turns a side off. */
export function readBookingReminderPrefs(): BookingReminderPrefs {
  const raw = kv.getJSON(KV_KEY);
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const { client, trainer } = raw as { client?: unknown; trainer?: unknown };
  return { client: client !== false, trainer: trainer !== false };
}

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: BookingReminderPrefs | null = null;

export function getBookingReminderPrefs(): BookingReminderPrefs {
  snapshot ??= readBookingReminderPrefs();
  return snapshot;
}

export function setBookingReminderPref(role: BookingReminderRole, on: boolean): void {
  const next = { ...getBookingReminderPrefs(), [role]: on };
  kv.setJSON(KV_KEY, next);
  snapshot = next;
  listeners.forEach((l) => l());
}

export function subscribeBookingReminderPrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A re-sync request (after the permission was granted): the host listens. */
let syncTick = 0;
const tickListeners = new Set<Listener>();
export function requestBookingReminderSync(): void {
  syncTick += 1;
  tickListeners.forEach((l) => l());
}
export function getBookingReminderSyncTick(): number {
  return syncTick;
}
export function subscribeBookingReminderSyncTick(listener: Listener): () => void {
  tickListeners.add(listener);
  return () => {
    tickListeners.delete(listener);
  };
}

/**
 * Asks for notification permission once per account (a moment with value:
 * the first booking card / the first booking made), only while that side's
 * reminders are on. Never at launch. Re-syncs when the answer is yes.
 */
export async function askBookingReminderPermissionOnce(role: BookingReminderRole): Promise<void> {
  if (!getBookingReminderPrefs()[role]) return;
  if (kv.getString(ASKED_KEY) === '1') return;
  if (await hasGymReminderPermission()) return;
  kv.setString(ASKED_KEY, '1');
  if (await ensureGymReminderPermission()) requestBookingReminderSync();
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

function isRoleReminder(data: unknown, role: BookingReminderRole | null): boolean {
  const d = data as { app?: unknown; role?: unknown } | null;
  return d?.app === BOOKING_REMINDER_APP_TAG && (role === null || d.role === role);
}

async function cancelReminders(role: BookingReminderRole | null): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => isRoleReminder(n.content.data, role))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort — a stale reminder is an annoyance, not a crash
  }
}

// Overlapping syncs (data arriving while a switch flips) would each
// cancel-then-schedule and leave duplicates: one at a time.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Makes one side's scheduled reminders match `plan`: cancels them all, then
 * schedules the plan when that side's switch is on and the OS allows it
 * (checked, never asked). `plan: []` (or the switch off) only cancels.
 */
export function syncBookingReminders(
  role: BookingReminderRole,
  plan: readonly BookingReminderPlan[],
): Promise<void> {
  return enqueue(async () => {
    await cancelReminders(role);
    if (!getBookingReminderPrefs()[role] || plan.length === 0) return;
    if (!(await hasGymReminderPermission())) return;
    const title = getTranslator().t('trainer.bookings.reminders.setting');
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: title,
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      for (const item of plan) {
        await Notifications.scheduleNotificationAsync({
          identifier: item.identifier,
          content: {
            title,
            body: item.body,
            // Ids only (§7.2 "never health data in a payload"): the app fetches the rest.
            data: { app: BOOKING_REMINDER_APP_TAG, role: item.role, bookingId: item.bookingId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: item.at,
            channelId: ANDROID_CHANNEL_ID,
          },
        });
      }
    } catch {
      await cancelReminders(role);
    }
  });
}

/** Sign-out: cancels every booking reminder and forgets the cached switches (the KV keys are wiped by the scan). */
export async function clearBookingReminders(): Promise<void> {
  snapshot = null;
  listeners.forEach((l) => l());
  await enqueue(() => cancelReminders(null));
}

/** Tests: forget the cached switches. */
export function resetBookingReminderPrefsForTests(): void {
  snapshot = null;
  syncTick = 0;
}
