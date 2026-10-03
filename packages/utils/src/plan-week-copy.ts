import { shoppingWindowLabel } from './shopping-window';

// ─── Which week, which days — one wording for web and mobile (UX-PLAN-07) ─────
// A plan's cost, the "share dinners" text and the toggles around them used to
// say "this week" / "Mon–Sun" whatever week was open and whichever days the
// estimate really covered.

/** "this week" · "next week" · "last week" · "that week" for a `weekOffset`. */
export function weekRelationLabel(weekOffset: number): string {
  if (weekOffset === 0) return 'this week';
  if (weekOffset === 1) return 'next week';
  if (weekOffset === -1) return 'last week';
  return 'that week';
}

/** Sentence-start form of `weekRelationLabel`: "This week", "Next week". */
export function weekRelationTitle(weekOffset: number): string {
  const label = weekRelationLabel(weekOffset);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

/** "This week’s dinners" / "Next week’s dinners" for the share heading. */
export function dinnersHeadingFor(weekOffset: number): string {
  return `${weekRelationTitle(weekOffset)}’s dinners`;
}

/**
 * The days a plan's cost estimate covers: "Mon–Sun" for a whole week, or the
 * remaining days ("Fri–Sun", "Sun only") for a plan made mid-week — the same
 * window the shopping list uses (`shoppingFromDay` on the plan).
 */
export function planCostCoverageLabel(shoppingFromDay: number | null | undefined): string {
  return shoppingWindowLabel(shoppingFromDay) ?? 'Mon–Sun';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "28 Sep – 4 Oct" for the week starting `monday` (fixed table — "Sep" never varies by ICU build). */
export function weekRangeLabel(monday: Date): string {
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
  return `${fmt(monday)} – ${fmt(end)}`;
}

/** The default name for a week saved from a past week: "Week of 28 Sep" (≤ 40 characters). */
export function defaultSavedWeekName(monday: Date): string {
  return `Week of ${monday.getDate()} ${MONTHS[monday.getMonth()] ?? ''}`;
}
