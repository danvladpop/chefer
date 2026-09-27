import type { OnboardingIntent, OnboardingJob } from '@chefer/types';

// ─── Effective jobs (§2.4, T-03.1) ─────────────────────────────────────────────
// Maps a legacy `onboardingIntent` onto the new `onboardingJobs` set on read,
// so every surface written before jobs existed keeps working with no
// backfill. Rev 2 also infers TRACK for users who logged food often enough
// to already be "tracking" before the jobs question ever asked them (UX-03
// pre-selection).

const LEGACY_INTENT_TO_JOB: Record<OnboardingIntent, OnboardingJob> = {
  EAT_BETTER: 'PLAN_MEALS',
  HOUSEHOLD: 'HOUSEHOLD',
  TRAIN: 'TRAIN',
};

/** Logged on this many of the last 7 days (or more) counts as already tracking. */
export const TRACK_INFERENCE_MIN_DAYS = 3;

export interface EffectiveJobsInput {
  /** `ChefProfile.onboardingJobs` as stored — [] when the user predates jobs. */
  jobs: readonly OnboardingJob[];
  /** `ChefProfile.onboardingIntent` (legacy), read when `jobs` is empty. */
  intent: OnboardingIntent | null;
  /** Distinct days with a food log in the last 7, for the TRACK inference. */
  loggedDaysLast7?: number;
}

/**
 * The job list every surface should read instead of `jobs`/`intent`
 * directly. Never empty when either input carries information; `[]` only
 * when the user has no jobs, no intent and isn't logging yet ("unknown").
 */
export function effectiveJobs(input: EffectiveJobsInput): OnboardingJob[] {
  const base = input.jobs.length > 0 ? [...input.jobs] : mapLegacyIntent(input.intent);
  const jobs = new Set<OnboardingJob>(base);

  if ((input.loggedDaysLast7 ?? 0) >= TRACK_INFERENCE_MIN_DAYS) {
    jobs.add('TRACK');
  }

  return [...jobs];
}

function mapLegacyIntent(intent: OnboardingIntent | null): OnboardingJob[] {
  if (!intent) return [];
  return [LEGACY_INTENT_TO_JOB[intent]];
}
