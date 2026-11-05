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

// ─── Weekly recap (lane E2) ──────────────────────────────────────────────────
// Only what happened, never a denominator that reads as a shortfall ("9 meals
// cooked from your plan", not "9 of 14") and never a zero row. The one ratio
// is protein days, which is opt-in on the share card and hidden in
// "Hide numbers" mode.

export const RECAP_COPY = {
  title: 'Your week in review',
  todayCardTitle: 'Your week in review',
  todayCardBody: 'What you cooked and trained last week.',
  foodHeading: 'Food',
  gymHeading: 'Training',
  newRecipesHeading: 'New recipes you tried',
  quietTitle: 'A quiet week',
  quietBody: 'Your recap fills in as you cook, log and train.',
  foodQuiet: 'Nothing cooked or logged from your plan that week.',
  share: 'Share your week',
  shareSheetTitle: 'What goes on the card?',
  shareCooking: 'Cooking',
  shareProtein: 'Protein days',
  shareTraining: 'Training',
  shareNote: 'Your card never shows your weight, allergies or what you logged.',
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
} as const;

/** The text that travels with a shared recap card. */
export function recapShareMessage(label: string): string {
  return `My week with Chefer, ${label}.`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The food lines of a recap: only non-zero facts. */
export function recapFoodLines(food: {
  cookedFromPlan: number;
  newRecipesTried: number;
  proteinDays: { hit: number; logged: number } | null;
}): string[] {
  const lines: string[] = [];
  if (food.cookedFromPlan > 0) {
    lines.push(`${count(food.cookedFromPlan, 'meal', 'meals')} cooked from your plan`);
  }
  if (food.newRecipesTried > 0) {
    lines.push(`${count(food.newRecipesTried, 'new recipe', 'new recipes')} tried`);
  }
  if (food.proteinDays && food.proteinDays.hit > 0) {
    lines.push(
      `Protein goal reached on ${food.proteinDays.hit} of ${count(food.proteinDays.logged, 'logged day', 'logged days')}`,
    );
  }
  return lines;
}

/** The training lines of a recap: only non-zero facts. */
export function recapGymLines(gym: {
  sessions: number;
  prCount: number;
  streakWeeks: number;
}): string[] {
  const lines: string[] = [];
  if (gym.sessions > 0) lines.push(count(gym.sessions, 'workout', 'workouts'));
  if (gym.prCount > 0) lines.push(count(gym.prCount, 'new personal best', 'new personal bests'));
  if (gym.streakWeeks > 0) lines.push(`${gym.streakWeeks}-week streak`);
  return lines;
}

// ─── Hide numbers (lane E3) ──────────────────────────────────────────────────
// What shows where a calorie or macro figure would be: portions, "on plan"
// ticks and qualitative progress. Never "over", never a shortfall.

export const HIDE_NUMBERS_COPY = {
  onPlanTitle: 'Today so far',
  onPlanEmpty: 'Your meals for today are planned. Tick them off as you go.',
  onPlanDone: 'Every planned meal eaten today.',
  noPlan: 'Log what you eat to see your day here.',
  recipeNutritionHidden: 'Nutrition is hidden in your settings.',
  weekOnPlan: 'Planned to suit you, all week.',
  estimateHidden: 'We’ll estimate it for you.',
} as const;

/** "2 of 3 planned meals eaten" — the qualitative line in "Hide numbers". */
export function onPlanLine(eaten: number, planned: number): string {
  if (planned <= 0) return HIDE_NUMBERS_COPY.noPlan;
  if (eaten <= 0) return HIDE_NUMBERS_COPY.onPlanEmpty;
  if (eaten >= planned) return HIDE_NUMBERS_COPY.onPlanDone;
  return `${eaten} of ${planned} planned meals eaten`;
}
