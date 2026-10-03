import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { kv } from '../gym/offline/kv';
import { hasGymReminderPermission } from '../gym/reminders/permission';

// Food re-engagement nudges (UX-PO-08, WP-13): two opt-in LOCAL notifications —
// "log dinner" and "plan Sunday" — no push tokens, no server field.
//
// - The choice lives in the device key-value store (`notifications.food-nudges`).
//   It belongs to the account: sign-out's key scan wipes it, and `signOut()`
//   also calls `cancelAllFoodNudges()` so nothing keeps firing for the next
//   person on the phone.
// - Dinner nudge: a ROLLING WINDOW of one-shot notifications at 20:30 for the
//   next 7 days (re-planned on launch, on foreground and whenever today's log
//   changes — see use-food-nudges.ts). A repeating trigger could not be skipped
//   on the evening dinner was already logged; a window can, and a user who
//   stops opening the app gets at most a week of nudges, never an endless one.
// - Plan-Sunday nudge: a WEEKLY trigger, Sunday 18:30 (the weekly recap, when
//   switched on, owns 18:00 — two notifications in the same minute would read
//   as spam).
//
// Permission is only ever CHECKED here (never prompted): asking stays in the
// user-action paths (the onboarding question, Settings → Notifications).

export const FOOD_NUDGE_APP_TAG = 'food-nudge';
const KV_KEY = 'notifications.food-nudges';
const ANDROID_CHANNEL_ID = 'food-nudges';

export const DINNER_NUDGE_HOUR = 20;
export const DINNER_NUDGE_MINUTE = 30;
/** How many evenings ahead the dinner nudge is scheduled. */
export const DINNER_NUDGE_DAYS = 7;
/** expo-notifications WEEKLY weekday: 1 = Sunday … 7 = Saturday. */
export const PLAN_NUDGE_WEEKDAY = 1;
export const PLAN_NUDGE_HOUR = 18;
export const PLAN_NUDGE_MINUTE = 30;

export type FoodNudgeKind = 'dinner' | 'plan-sunday';

export type FoodNudgePrefs = { dinner: boolean; planSunday: boolean };

export const NO_FOOD_NUDGES: FoodNudgePrefs = { dinner: false, planSunday: false };

const COPY: Record<FoodNudgeKind, { title: string; body: string }> = {
  dinner: {
    title: 'Dinner logged?',
    body: 'Add what you ate tonight — it takes a few taps.',
  },
  'plan-sunday': {
    title: 'Plan your week',
    body: 'Sunday evening is a good time to pick next week’s dinners.',
  },
};

/** The only screens a food nudge may open (never a payload-supplied path). */
const NUDGE_ROUTES = { dinner: '/tracker', 'plan-sunday': '/meal-plan' } as const;
export type FoodNudgeRoute = (typeof NUDGE_ROUTES)[FoodNudgeKind];

function isFoodNudgeTag(data: unknown): boolean {
  return (data as { app?: unknown } | null)?.app === FOOD_NUDGE_APP_TAG;
}

/** The route a tapped food nudge should open, or null for any other notification. */
export function foodNudgeNotificationUrl(data: unknown): FoodNudgeRoute | null {
  if (!isFoodNudgeTag(data)) return null;
  const kind = (data as { kind?: unknown }).kind;
  if (kind === 'dinner' || kind === 'plan-sunday') return NUDGE_ROUTES[kind];
  return null;
}

// ─── The stored choice ────────────────────────────────────────────────────────

/** The stored choice; anything missing or malformed reads as "both off". */
export function readFoodNudgePrefs(): FoodNudgePrefs {
  const raw = kv.getJSON(KV_KEY);
  if (typeof raw !== 'object' || raw === null) return NO_FOOD_NUDGES;
  const { dinner, planSunday } = raw as { dinner?: unknown; planSunday?: unknown };
  return { dinner: dinner === true, planSunday: planSunday === true };
}

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: FoodNudgePrefs | null = null;

export function getFoodNudgePrefs(): FoodNudgePrefs {
  snapshot ??= readFoodNudgePrefs();
  return snapshot;
}

/** Stores the choice and tells every subscriber (the scheduler hook, the Settings screen). */
export function writeFoodNudgePrefs(next: FoodNudgePrefs): void {
  kv.setJSON(KV_KEY, next);
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeFoodNudgePrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drops the in-memory copy so the next read re-reads the store (sign-out wipes the key). */
export function resetFoodNudgePrefsCache(): void {
  snapshot = null;
  listeners.forEach((listener) => listener());
}

// ─── Pure planning ────────────────────────────────────────────────────────────

/**
 * The 20:30 moments the dinner nudge fires, for the next `DINNER_NUDGE_DAYS`
 * evenings starting today. Evenings already past are dropped, and so is today's
 * when dinner is already logged ("nothing logged for dinner" is the condition).
 */
export function dinnerNudgeDates(now: Date, dinnerLoggedToday: boolean): Date[] {
  const dates: Date[] = [];
  for (let offset = 0; offset < DINNER_NUDGE_DAYS; offset += 1) {
    const at = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      DINNER_NUDGE_HOUR,
      DINNER_NUDGE_MINUTE,
      0,
      0,
    );
    if (at.getTime() <= now.getTime()) continue;
    if (offset === 0 && dinnerLoggedToday) continue;
    dates.push(at);
  }
  return dates;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/** Cancels every scheduled food nudge. Best effort — never throws. */
export async function cancelAllFoodNudges(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => isFoodNudgeTag(n.content.data))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort — a stale nudge is an annoyance, not a crash
  }
}

/** Sign-out: cancels every nudge and forgets the cached choice (the key itself is wiped by the KV scan). */
export async function clearFoodNudges(): Promise<void> {
  resetFoodNudgePrefsCache();
  await cancelAllFoodNudges();
}

// Two syncs overlapping (the Settings toggle and the foreground hook) would
// each cancel-then-schedule and leave duplicates, so they run one at a time.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export interface SyncFoodNudgesInput {
  prefs: FoodNudgePrefs;
  /** Whether a dinner entry is already logged for today (skips tonight's nudge). */
  dinnerLoggedToday: boolean;
  now?: Date;
}

/**
 * Makes the scheduled notifications match `prefs`: cancels every food nudge,
 * then schedules the ones that are on. Needs notification permission — without
 * it nothing is scheduled and nothing is asked.
 */
export function syncFoodNudges({
  prefs,
  dinnerLoggedToday,
  now = new Date(),
}: SyncFoodNudgesInput): Promise<void> {
  return enqueue(async () => {
    await cancelAllFoodNudges();
    if (!prefs.dinner && !prefs.planSunday) return;
    if (!(await hasGymReminderPermission())) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Dinner & weekly planning nudges',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      if (prefs.dinner) {
        for (const date of dinnerNudgeDates(now, dinnerLoggedToday)) {
          await Notifications.scheduleNotificationAsync({
            content: {
              ...COPY.dinner,
              sound: false,
              data: { app: FOOD_NUDGE_APP_TAG, kind: 'dinner' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              channelId: ANDROID_CHANNEL_ID,
            },
          });
        }
      }
      if (prefs.planSunday) {
        await Notifications.scheduleNotificationAsync({
          content: {
            ...COPY['plan-sunday'],
            sound: false,
            data: { app: FOOD_NUDGE_APP_TAG, kind: 'plan-sunday' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: PLAN_NUDGE_WEEKDAY,
            hour: PLAN_NUDGE_HOUR,
            minute: PLAN_NUDGE_MINUTE,
            channelId: ANDROID_CHANNEL_ID,
          },
        });
      }
    } catch {
      // best effort — a failed schedule call must not crash the caller
      await cancelAllFoodNudges();
    }
  });
}
