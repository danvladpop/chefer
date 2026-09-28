import type { OnboardingJob } from '@chefer/types';

// ─── Landing (§2.4, T-04.3) ─────────────────────────────────────────────────────
// Which app mode a launch or a stale-tab foreground should land on. Pure and
// synchronous (fed by a KV read, no flash) — applied on cold start and on
// foreground after >= 30 min at a tab root; never during deep links,
// notification taps or an in-flight flow (the caller gates that, this
// function only answers "where does a plain open belong").

export type LandingSurface = 'food' | 'gym';

export interface LandingInput {
  /** The effective jobs list (`effectiveJobs()`). */
  jobs: readonly OnboardingJob[];
  /** The user's own explicit last choice (gym_plan.md §5.1 mode store). */
  persistedMode: LandingSurface;
  /** Whether gym setup is complete — TRAIN never lands on an unset-up Gym tab. */
  hasGymProfile: boolean;
  /**
   * Table row 1 (T-04.3, top priority): a workout is currently in progress
   * (the active-session store) — its Resume card must be the first thing
   * the user sees, even over an explicit Food choice.
   */
  workoutInProgress?: boolean;
  /** Table row 4: today is one of the user's planned training weekdays. */
  isTrainingDayToday?: boolean;
  /** Table row 4: a workout was already completed today. */
  workoutDoneToday?: boolean;
  /** Table row 4: the current local hour, e.g. `14.5` for 14:30. */
  localHour?: number;
  /** Table row 4: the user's reminder hour, same units as `localHour`, if they have one set. */
  reminderHour?: number;
}

/**
 * The user's explicit choice always wins over the JOBS-based default (rows
 * 2/3/5) — a landing never overrides it, it only decides the FIRST landing
 * for someone who has never switched (the persisted mode starts at 'food'
 * for every new account, so TRAIN-primary users would otherwise never see
 * Gym without hunting for the switch). A workout in progress (row 1) wins
 * over even that: its Resume card is the point of opening the app.
 * Row 4 (a planned training day, not yet done, from 14:00 — or 2 h before
 * the reminder if that's earlier) only applies once gym is set up, same
 * guard as row 2's TRAIN-only rule.
 */
export function landingFor(input: LandingInput): LandingSurface {
  if (input.workoutInProgress) return 'gym';
  if (input.persistedMode === 'gym') return 'gym';
  const trainOnly = input.jobs.length > 0 && input.jobs.every((job) => job === 'TRAIN');
  if (trainOnly && input.hasGymProfile) return 'gym';
  if (
    input.hasGymProfile &&
    input.jobs.includes('TRAIN') &&
    input.isTrainingDayToday &&
    !input.workoutDoneToday &&
    input.localHour !== undefined
  ) {
    const threshold = input.reminderHour !== undefined ? Math.min(14, input.reminderHour - 2) : 14;
    if (input.localHour >= threshold) return 'gym';
  }
  return 'food';
}
