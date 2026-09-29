// ─── Live plan tailoring ("instant week, then the chef tailors it live") ────
// Premium `mealPlan.generate` returns a complete curated week at once; a
// background job then swaps AI-tailored days in one at a time (today first).
// The week-plan DTO carries this optional block so the Plan screens can show
// progress. Additive: clients that ignore it still get the curated week
// instantly and see tailored days on their next refetch.

/**
 * - RUNNING — days are still queued for the chef.
 * - DONE — every queued day was tailored (or left as the user changed it).
 * - PARTIAL — stopped early; the untailored days stay from the collection.
 * - FAILED — stopped before any day could be tailored.
 * - NONE — nothing to tailor (reads normally send `null` instead).
 */
export type PlanTailoringStatus = 'RUNNING' | 'DONE' | 'PARTIAL' | 'FAILED' | 'NONE';

export interface PlanTailoring {
  status: PlanTailoringStatus;
  /** Days (0 = Monday) whose meals the chef has replaced. */
  tailoredDays: number[];
  /** How many days this generation set out to tailor (planned days from today on). */
  totalDays: number;
  /** The day being tailored right now, or null. */
  currentDay: number | null;
  /** Days still waiting their turn, in order (includes `currentDay`). */
  queuedDays: number[];
  /** Days left alone because the user changed or logged them meanwhile. */
  keptDays: number[];
  /**
   * PARTIAL/FAILED only: whether `mealPlan.resumeTailoring` may re-queue the
   * untailored days (no new plan-generation quota; capped per plan).
   */
  canResume: boolean;
}

/** How often a Plan screen polls `mealPlan.getForWeek` while tailoring runs. */
export const PLAN_TAILORING_POLL_MS = 3_000;
