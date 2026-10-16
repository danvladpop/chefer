import { formatPortion } from './meal-portion';
import { weekdayLongName } from './plan-training';

// ─── Day rebalance copy (boards: canvas page "Day rebalance — proposal") ─────
// One wording for web and mobile. The numbers come from the API's `dayFit`
// (meal-plan/day-fit.ts); nothing here decides anything.

/** "Monday" for 0 … "Sunday" for 6. */
export function dayFitDayName(dayOfWeek: number): string {
  return weekdayLongName(dayOfWeek);
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** "Breakfast" / "Dinner" / "Snack" for a meal type. */
export function dayFitMealLabel(mealType: string): string {
  return MEAL_LABEL[mealType] ?? 'Meal';
}

export interface DayFitChangeLike {
  mealType: string;
  to: number;
}

/**
 * The snackbar line after a day fit resized other meals, or null when it
 * resized nothing (the caller then shows its usual "Swapped to …").
 * `isToday` says "today" instead of the weekday.
 */
export function describeDayFit(
  fit: { dayOfWeek: number; changes: readonly DayFitChangeLike[] } | null | undefined,
  opts: { isToday?: boolean } = {},
): string | null {
  if (!fit || fit.changes.length === 0) return null;
  const day = opts.isToday ? 'today' : dayFitDayName(fit.dayOfWeek);
  const [c] = fit.changes;
  if (fit.changes.length === 1 && c) {
    return `${dayFitMealLabel(c.mealType)} is now ${formatPortion(c.to)} so ${day} stays on target`;
  }
  const names = fit.changes.map((c) => dayFitMealLabel(c.mealType).toLowerCase());
  const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} resized so ${day} stays on target`;
}

export interface DayFitSuggestionLike {
  kind: 'swap' | 'snack';
  mealType: string;
  recipeName: string;
  kcalDelta: number;
  proteinDelta: number;
}

const signed = (n: number, unit: string) =>
  `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('en-US')}${unit}`;

/** Copy for the "one change closes it" card (board 2). */
export function dayFitSuggestionCopy(
  s: DayFitSuggestionLike,
  day: { dayOfWeek: number; kcal: number },
): { lede: string; title: string; detail: string; action: string } {
  return {
    lede: `Resizing portions only gets ${dayFitDayName(day.dayOfWeek)} to ${Math.round(day.kcal).toLocaleString('en-US')} kcal. One change closes it:`,
    title:
      s.kind === 'snack'
        ? `Add ${s.recipeName}`
        : `${dayFitMealLabel(s.mealType)} → ${s.recipeName}`,
    detail: `${signed(s.kcalDelta, ' kcal')} · ${signed(s.proteinDelta, ' g protein')}`,
    action:
      s.kind === 'snack' ? 'Add a snack' : `Swap ${dayFitMealLabel(s.mealType).toLowerCase()}`,
  };
}

/** The day's status line (boards 1–3). */
export function dayFitStatus(day: {
  kcal: number;
  targetKcal: number;
  onTarget: boolean;
  nothingOpen: boolean;
}): { text: string; tone: 'ok' | 'short' | 'neutral' } {
  if (day.onTarget) return { text: 'On target', tone: 'ok' };
  const diff = Math.round(day.kcal - day.targetKcal);
  const amount = Math.abs(diff).toLocaleString('en-US');
  if (day.nothingOpen) {
    return {
      text: `${amount} kcal ${diff > 0 ? 'over' : 'under'} — your pick, nothing else to adjust`,
      tone: 'neutral',
    };
  }
  return { text: `${amount} kcal ${diff > 0 ? 'over' : 'short'}`, tone: 'short' };
}

export const DAY_FIT_COPY = {
  leaveIt: 'Leave it',
  undo: 'Undo',
  refitTitle: 'Portions updated for your new targets',
  refitBody: (days: number) =>
    `Same meals, resized on ${days} ${days === 1 ? 'day' : 'days'} to match.`,
  refitDismiss: 'Dismiss',
  refitUndone: 'Portions put back',
  suggestionApplied: (s: DayFitSuggestionLike) =>
    s.kind === 'snack'
      ? `Added ${s.recipeName}`
      : `${dayFitMealLabel(s.mealType)} swapped for ${s.recipeName}`,
  stale: 'That day changed — refresh and try again.',
} as const;
