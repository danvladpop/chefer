import { addDaysLocal, weekdayOf } from '@chefer/utils';

// Pure local-reminder scheduler (gym_plan.md §6.5, research §4.2 #7). Kept
// dependency-free of expo-notifications and React so the DST / pause / "max
// one a day" rules are trivial to unit test — `use-gym-reminders.ts` is the
// only place that turns this list into actual scheduled notifications.
//
// Tone rules (docs/gym/programming-research.md §4.3): never more than one
// reminder a day, and never guilt copy ("you missed", "broken streak", …).

export type GymReminderKind = 'planned' | 'missed';

export interface GymReminderProfile {
  reminderEnabled: boolean;
  /** "HH:MM", device-local. */
  reminderTime: string | null;
}

export interface GymReminderRoutineDay {
  name: string;
  /** 0 = Monday … 6 = Sunday (matches `weekdayOf`), or null when unplanned. */
  plannedWeekday: number | null;
}

export interface GymReminderRoutine {
  days: GymReminderRoutineDay[];
}

/** A date range that suppresses reminders, e.g. `GymBootstrap.activePause`. */
export interface GymReminderPause {
  startDate: string;
  endDate: string;
}

/** A local calendar date + "HH:MM" → an absolute ISO instant. */
export type LocalInstantFn = (date: string, time: string) => string;

export interface GymReminderInput {
  profile: GymReminderProfile;
  activeRoutine: GymReminderRoutine | null;
  /** localDate of the most recently COMPLETED session, or null if none yet. */
  lastSessionDate: string | null;
  /** Device-local "today" (YYYY-MM-DD). */
  today: string;
  /** Current instant (ISO) — a reminder at or before `now` is dropped instead of firing immediately. */
  now: string;
  /** The pause covering part of the scheduling window, if any. */
  activePause?: GymReminderPause | null;
  /**
   * Test seam: overrides the local-date+time → instant conversion (defaults
   * to `localInstant`, the real device-local/DST-aware one below). Letting
   * tests inject a synthetic zone with a known transition is what makes DST
   * correctness testable without depending on the test runner's own OS
   * timezone (which a JS engine may pin for the whole process).
   */
  toLocalInstant?: LocalInstantFn;
}

export interface GymReminder {
  /** ISO instant, in the runtime's own timezone — see `localInstant` below. */
  at: string;
  title: string;
  body: string;
  kind: GymReminderKind;
}

/** Reminders are scheduled at most this far ahead (gym_plan.md §6.5). */
export const REMINDER_HORIZON_DAYS = 14;

function insidePause(date: string, pause: GymReminderPause | null | undefined): boolean {
  return !!pause && pause.startDate <= date && date <= pause.endDate;
}

/**
 * "HH:MM" on a device-local calendar date → an absolute instant, using the
 * RUNTIME's own timezone (exactly like every other "device-local" gym date in
 * this codebase — see offline/ids.ts). `Date`'s local constructor already
 * handles DST correctly (a nonexistent or repeated wall-clock time resolves
 * to the real instant the OS would use), so no manual offset math is needed.
 */
export function localInstant(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    0,
    0,
  ).toISOString();
}

function plannedDayNames(routine: GymReminderRoutine | null): Map<number, string> {
  const map = new Map<number, string>();
  for (const day of routine?.days ?? []) {
    if (day.plannedWeekday !== null) map.set(day.plannedWeekday, day.name);
  }
  return map;
}

/** The next planned day's name strictly after `today`, within the horizon (for the missed-day nudge's copy). */
function nextPlannedDayName(planned: Map<number, string>, today: string): string | null {
  for (let offset = 1; offset <= 7; offset++) {
    const name = planned.get(weekdayOf(addDaysLocal(today, offset)));
    if (name !== undefined) return name;
  }
  return null;
}

/**
 * One reminder per planned weekday over the next 14 days (skipping a day
 * already trained or paused), plus at most one gentle "missed yesterday"
 * nudge — never on the same day as a planned reminder, so it's never more
 * than one notification a day.
 */
export function computeGymReminders(input: GymReminderInput): GymReminder[] {
  const { profile, activeRoutine, lastSessionDate, today, now, activePause } = input;
  if (!profile.reminderEnabled || !profile.reminderTime || !activeRoutine) {
    return [];
  }
  const planned = plannedDayNames(activeRoutine);
  if (planned.size === 0) {
    return [];
  }
  const reminderTime = profile.reminderTime;
  const toInstant = input.toLocalInstant ?? localInstant;

  const reminders: GymReminder[] = [];
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset++) {
    const date = addDaysLocal(today, offset);
    const dayName = planned.get(weekdayOf(date));
    if (dayName === undefined) continue;
    if (date === lastSessionDate) continue; // already trained that day
    if (insidePause(date, activePause)) continue;
    const at = toInstant(date, reminderTime);
    if (at <= now) continue;
    reminders.push({
      at,
      title: 'Ready when you are',
      body: `${dayName} is up next — whenever you're ready.`,
      kind: 'planned',
    });
  }

  // "Don't miss twice" (research §4.1/§4.2 #7): one gentle nudge the day
  // after a missed planned day, unless today already carries its own
  // planned reminder (max one a day) or today is paused.
  const yesterday = addDaysLocal(today, -1);
  const missedYesterday =
    planned.has(weekdayOf(yesterday)) &&
    lastSessionDate !== yesterday &&
    !insidePause(yesterday, activePause);
  const todayIsPlanned = planned.has(weekdayOf(today));
  if (missedYesterday && !todayIsPlanned && !insidePause(today, activePause)) {
    const at = toInstant(today, reminderTime);
    if (at > now) {
      const next = nextPlannedDayName(planned, today);
      reminders.push({
        at,
        title: "Back whenever you're ready",
        body: next
          ? `Tomorrow works too. Your next workout is ${next}.`
          : "Tomorrow works too — whenever you're ready.",
        kind: 'missed',
      });
    }
  }

  return reminders.sort((a, b) => a.at.localeCompare(b.at));
}
