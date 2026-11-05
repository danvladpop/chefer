import {
  MEAL_REMINDER_DEFAULT_TIMES,
  MEAL_REMINDER_SLOTS,
  mealRemindersSchema,
  type MealReminders,
  type PlanSlot,
} from '@chefer/types';

// ─── Meal-time reminders (lane E1) ────────────────────────────────────────────
// The pure half of the reminders: defaults pre-filled from the planned meals,
// reading the stored JSON, and which moments the phone should schedule. The
// copy lives in engagement-copy.ts (scanned by `chefer/no-forbidden-copy`).

/** How many days ahead the phone schedules (a rolling window, re-planned on launch). */
export const MEAL_REMINDER_DAYS = 4;

/**
 * The never-chosen settings for these planned meals: off, with the suggested
 * time on every planned meal and no reminder on the others.
 */
export function defaultMealReminders(planSlots: readonly PlanSlot[]): MealReminders {
  const time = (slot: PlanSlot) =>
    planSlots.includes(slot) ? MEAL_REMINDER_DEFAULT_TIMES[slot] : null;
  return {
    enabled: false,
    times: {
      breakfast: time('breakfast'),
      lunch: time('lunch'),
      dinner: time('dinner'),
      snack: time('snack'),
    },
  };
}

/** The stored `ChefProfile.mealReminders` JSON, or null when unset or malformed. */
export function parseStoredMealReminders(raw: unknown): MealReminders | null {
  const parsed = mealRemindersSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The meals that have a reminder, in the day's order. Empty when the master switch is off. */
export function activeReminderSlots(reminders: MealReminders): PlanSlot[] {
  if (!reminders.enabled) return [];
  return MEAL_REMINDER_SLOTS.filter((slot) => reminders.times[slot] !== null);
}

export interface MealReminderMoment {
  slot: PlanSlot;
  at: Date;
}

/** Monday-first weekday (0 = Monday … 6 = Sunday), the plan shape's convention. */
function planWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * The local moments to schedule, soonest first, for the next `days` days from
 * `now`: every active meal at its time, on planned weekdays only. Moments
 * already past are dropped, and so is today's reminder for any meal that is
 * already logged or ticked — a reminder is never sent for a meal that is done.
 */
export function mealReminderMoments(
  now: Date,
  reminders: MealReminders,
  planDays: readonly number[],
  doneToday: ReadonlySet<PlanSlot>,
  days: number = MEAL_REMINDER_DAYS,
): MealReminderMoment[] {
  const slots = activeReminderSlots(reminders);
  const moments: MealReminderMoment[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (planDays.length > 0 && !planDays.includes(planWeekday(day))) continue;
    for (const slot of slots) {
      const time = reminders.times[slot];
      if (time === null) continue;
      const [hour, minute] = time.split(':').map(Number) as [number, number];
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
      if (at.getTime() <= now.getTime()) continue;
      if (offset === 0 && doneToday.has(slot)) continue;
      moments.push({ slot, at });
    }
  }
  return moments.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The meals done today, from a day's logged meals (`mealType` is the stored
 * BREAKFAST/LUNCH/… string; ticking a planned meal logs it, so ticks count).
 */
export function loggedMealSlots(loggedMeals: readonly { mealType: string }[]): Set<PlanSlot> {
  const done = new Set<PlanSlot>();
  for (const meal of loggedMeals) {
    const slot = meal.mealType.toLowerCase();
    if (isPlanSlot(slot)) done.add(slot);
  }
  return done;
}

function isPlanSlot(value: string): value is PlanSlot {
  return (MEAL_REMINDER_SLOTS as readonly string[]).includes(value);
}
