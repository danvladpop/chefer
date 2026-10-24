import { addDaysLocal } from './gym/weeks';
import { proteinGapG } from './meal-portion';
import { matchLoggedToSlots, type LoggedMealRef, type PlannedMealSlot } from './today';

// ─── Weekly recap (market review 2026-10, lane E2) ───────────────────────────
// The food half of "your week in review", computed from the week's daily logs
// and plan. Pure, so the API's RecapService and its tests share one rule.
// Counting only what happened: there is no "missed" number anywhere, and a
// week with nothing logged is simply an empty recap.

export interface RecapLogDay {
  /** "YYYY-MM-DD" (the log's local day). */
  date: string;
  loggedMeals: readonly LoggedMealRef[];
  totalProtein: number;
}

export interface RecapPlanDay {
  /** 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
  meals: readonly PlannedMealSlot[];
}

export interface RecapFoodCounts {
  /** Planned meals in the week's plan (0 without a plan). */
  plannedMeals: number;
  /** Planned meals that were logged or ticked as eaten (cook mode's "Made it!" counts). */
  cookedFromPlan: number;
  /** Recipes logged this week that were never logged before, in the order first logged. */
  newRecipeIds: string[];
  /** Logged days that reached the protein target; null without a target. */
  proteinDays: { hit: number; logged: number } | null;
}

/** 0 = Monday … 6 = Sunday, for a "YYYY-MM-DD" date. */
function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function recapFoodCounts(input: {
  logs: readonly RecapLogDay[];
  plan: readonly RecapPlanDay[] | null;
  /** Every recipe id logged before the week started. */
  earlierRecipeIds: ReadonlySet<string>;
  proteinTargetG: number | null;
}): RecapFoodCounts {
  const byWeekday = new Map(input.logs.map((log) => [weekdayOf(log.date), log]));

  let plannedMeals = 0;
  let cookedFromPlan = 0;
  for (const day of input.plan ?? []) {
    plannedMeals += day.meals.length;
    const logged = byWeekday.get(day.dayOfWeek)?.loggedMeals ?? [];
    const slots = day.meals.map((meal, slotIndex) => ({ ...meal, slotIndex }));
    cookedFromPlan += matchLoggedToSlots(slots, logged, { crossType: true }).filter(Boolean).length;
  }

  const newRecipeIds: string[] = [];
  for (const log of [...input.logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const entry of log.loggedMeals) {
      const id = entry.recipeId;
      if (!id || entry.custom || input.earlierRecipeIds.has(id) || newRecipeIds.includes(id)) {
        continue;
      }
      newRecipeIds.push(id);
    }
  }

  const loggedDays = input.logs.filter((log) => log.loggedMeals.length > 0);
  const proteinDays =
    input.proteinTargetG && input.proteinTargetG > 0
      ? {
          hit: loggedDays.filter(
            (log) => proteinGapG(log.totalProtein, input.proteinTargetG) === null,
          ).length,
          logged: loggedDays.length,
        }
      : null;

  return { plannedMeals, cookedFromPlan, newRecipeIds, proteinDays };
}

// A fixed table, not Intl: ICU versions disagree on "Sep" vs "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (date: Date): string => MONTHS[date.getUTCMonth()] ?? '';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "22–28 Sep", or "29 Sep – 5 Oct" across a month boundary. `monday` is UTC
 * midnight. Shared by the weekly emails and the recap (moved from the API's
 * weekly-email.service.ts).
 */
export function weekLabel(monday: Date): string {
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const startMonth = monthOf(monday);
  const endMonth = monthOf(sunday);
  return startMonth === endMonth
    ? `${monday.getUTCDate()}–${sunday.getUTCDate()} ${endMonth}`
    : `${monday.getUTCDate()} ${startMonth} – ${sunday.getUTCDate()} ${endMonth}`;
}

/** The Monday ("YYYY-MM-DD") of the week containing `date`. */
export function mondayOf(date: string): string {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysLocal(date, -weekday);
}

/** The Monday of the last COMPLETED week before `localDate` — what "your week in review" shows. */
export function lastCompletedWeekStart(localDate: string): string {
  return addDaysLocal(mondayOf(localDate), -7);
}
