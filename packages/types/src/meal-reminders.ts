import { z } from 'zod';
import type { PlanSlot } from './plan-shape';

// ─── Meal-time reminders (market review 2026-10, lane E1) ────────────────────
// One opt-in LOCAL notification per planned meal ("Breakfast time", 08:00),
// offered by onboarding V4 and edited in Settings → Notifications. The choice
// is stored on the server (`ChefProfile.mealReminders`, JSON) so web can show
// and edit it; only the phone schedules anything, and only while the OS
// permission is granted. `null` in the column = never chosen.

/** "HH:MM", 24-hour, 5-minute steps (what the time picker offers). */
export const mealReminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5][05]$/, 'Expected HH:MM in 5-minute steps');

/** Per meal: the time, or null when that meal has no reminder. */
export const mealReminderTimesSchema = z.object({
  breakfast: mealReminderTimeSchema.nullable(),
  lunch: mealReminderTimeSchema.nullable(),
  dinner: mealReminderTimeSchema.nullable(),
  snack: mealReminderTimeSchema.nullable(),
});
export type MealReminderTimes = z.infer<typeof mealReminderTimesSchema>;

export const mealRemindersSchema = z.object({
  /** The master switch. Off keeps the times, so turning it back on restores them. */
  enabled: z.boolean(),
  times: mealReminderTimesSchema,
});
export type MealReminders = z.infer<typeof mealRemindersSchema>;

/** `notifications.setMealReminders` input. */
export const setMealRemindersInputSchema = mealRemindersSchema;
export type SetMealRemindersInput = z.infer<typeof setMealRemindersInputSchema>;

/** `notifications.getMealReminders` output. */
export interface MealRemindersDto {
  reminders: MealReminders;
  /** False until the user has answered once (onboarding or Settings). */
  chosen: boolean;
  /** The user's planned meals (resolved plan shape) — what the defaults cover. */
  planSlots: PlanSlot[];
  /** Planned weekdays, 0 = Monday … 6 = Sunday (resolved plan shape). */
  planDays: number[];
}

/** Suggested time per meal, used to pre-fill a meal the user plans. */
export const MEAL_REMINDER_DEFAULT_TIMES: Readonly<Record<PlanSlot, string>> = {
  breakfast: '08:00',
  lunch: '12:30',
  snack: '16:00',
  dinner: '18:30',
};

/** Display order (the day's order, not the enum's). */
export const MEAL_REMINDER_SLOTS: readonly PlanSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
