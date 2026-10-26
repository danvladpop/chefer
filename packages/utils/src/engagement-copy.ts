import type { PlanSlot } from '@chefer/types';

// Engagement copy (market review 2026-10, lane E): meal-time reminders and
// their onboarding offer. Warm, never guilt-based: a reminder invites, it
// never reports what didn't happen (no "you missed…", no "don't forget", no
// streak pressure). Duolingo's own research found guilt-style reminders
// backfire. Scanned by `chefer/no-forbidden-copy` and copy-lint.test.ts.

/** The notification each meal's reminder shows. */
export const MEAL_REMINDER_NOTIFICATION: Readonly<
  Record<PlanSlot, { title: string; body: string }>
> = {
  breakfast: { title: 'Breakfast time', body: 'Enjoy your breakfast. Tap to see today’s meals.' },
  lunch: { title: 'Lunch time', body: 'Time for a lunch break. Tap to see today’s meals.' },
  snack: { title: 'Snack time', body: 'A good moment for a snack. Tap to see today’s meals.' },
  dinner: { title: 'Dinner time', body: 'Time to think about dinner. Tap to see today’s meals.' },
};

export type EngagementCopyKey =
  | 'remindersStepTitle'
  | 'remindersStepBody'
  | 'remindersStepYes'
  | 'remindersStepNo'
  | 'remindersStepLater'
  | 'remindersCardTitle'
  | 'remindersCardBody'
  | 'remindersMasterLabel'
  | 'remindersWebNote'
  | 'remindersOff';

export const ENGAGEMENT_COPY: Record<EngagementCopyKey, string> = {
  remindersStepTitle: 'Remind me at mealtimes?',
  remindersStepBody:
    'A gentle nudge when it’s time to eat, so your plan is there when you need it. Nothing on days you’ve already logged that meal.',
  remindersStepYes: 'Yes, remind me',
  remindersStepNo: 'Not now',
  remindersStepLater: 'You can change the times any time in Settings → Notifications.',
  remindersCardTitle: 'Mealtime reminders',
  remindersCardBody: 'One gentle reminder per meal, skipped once that meal is logged.',
  remindersMasterLabel: 'Remind me at mealtimes',
  remindersWebNote: 'Reminders arrive on your phone through the Chefer app.',
  remindersOff: 'Mealtime reminders are off',
};

const SLOT_NAME: Readonly<Record<PlanSlot, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

/** "Breakfast", "Lunch"… — the row label for a meal's reminder. */
export function mealReminderLabel(slot: PlanSlot): string {
  return SLOT_NAME[slot];
}
