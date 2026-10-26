import type { ProgressEventKind } from '@chefer/types';

// ─── Kitchen progress XP table (docs/gamification-2026-10/README.md §5) ───────
// Every award is a constant here. Nothing below reads kcal, carbs, fat or body
// weight: the only intake number a rule may use is protein, and only upward.

/** Bump when a rule changes; stored on ledger rows so history can be re-scored. */
export const RULES_VERSION = 1;

export const XP = {
  LOGGED: 5,
  ON_PLAN: 5,
  /** At most this many meals a day earn XP. */
  MEALS_PER_DAY: 5,
  FULL_DAY: 15,
  PROTEIN_GOAL: 10,
  COOKED_AT_HOME: 25,
  FIRST_TIME: 10,
  WORKOUT_DONE: 40,
  PR: { e1rm: 20, weight: 15, reps: 10 },
  /** Only the best N PRs of a session earn. */
  PRS_PER_SESSION: 3,
  SHOP_DONE: 10,
  TODAYS_THREE: 40,
  WEEK_GOAL: 50,
  /** XP above this in one local day is halved. */
  DAILY_SOFT_CAP: 150,
} as const;

/** Bonuses: they are not reduced by the daily soft cap. */
export const UNCAPPED_KINDS: readonly ProgressEventKind[] = [
  'WEEK_GOAL',
  'TODAYS_THREE',
  'WELCOME',
];

/** Active days a week the Flame asks for until the user changes it. */
export const DEFAULT_ACTIVE_DAY_GOAL = 3;
