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
}

/**
 * The user's explicit choice always wins — a landing never overrides it, it
 * only decides the FIRST landing for someone who has never switched (the
 * persisted mode starts at 'food' for every new account, so TRAIN-primary
 * users would otherwise never see Gym without hunting for the switch).
 */
export function landingFor(input: LandingInput): LandingSurface {
  if (input.persistedMode === 'gym') return 'gym';
  const trainOnly = input.jobs.length > 0 && input.jobs.every((job) => job === 'TRAIN');
  if (trainOnly && input.hasGymProfile) return 'gym';
  return 'food';
}
