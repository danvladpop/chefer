import { z } from 'zod';

// ─── Weekly recap (market review 2026-10, lane E2) ───────────────────────────
// "Your week in review": what was cooked and trained in one Monday–Sunday
// week. Reached from the Monday email and from Today on Monday. Counts only
// what happened — never a "missed" number.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** `recap.week` input. Omitted `weekStart` = the last COMPLETED week before `localDate`. */
export const weeklyRecapInputSchema = z
  .object({
    /** The Monday of the week to recap. */
    weekStart: isoDate.optional(),
    /** The client's local day, so "last week" follows the phone's calendar. */
    localDate: isoDate.optional(),
  })
  .optional();
export type WeeklyRecapInput = z.infer<typeof weeklyRecapInputSchema>;

export interface WeeklyRecapRecipe {
  id: string;
  name: string;
}

export interface WeeklyRecapPr {
  exerciseName: string;
  /** "62.5 kg × 5", in the lifter's own unit. */
  label: string;
}

export interface WeeklyRecapDto {
  /** Monday, "YYYY-MM-DD". */
  weekStart: string;
  /** "13–19 Oct". */
  label: string;
  food: {
    plannedMeals: number;
    cookedFromPlan: number;
    newRecipesTried: number;
    /** Up to five of them, in the order first logged. */
    newRecipes: WeeklyRecapRecipe[];
    /** Days the protein target was reached, out of logged days; null without a target. */
    proteinDays: { hit: number; logged: number } | null;
  };
  /** Null for accounts that never set up training. */
  gym: {
    sessions: number;
    prCount: number;
    /** Up to three of the week's PRs (first-ever lifts are baselines, not PRs). */
    prs: WeeklyRecapPr[];
    /** Current weekly streak; 0 renders as "starts when you hit this week's goal". */
    streakWeeks: number;
  } | null;
  /** True when nothing at all happened that week (no logs, no sessions). */
  empty: boolean;
}
