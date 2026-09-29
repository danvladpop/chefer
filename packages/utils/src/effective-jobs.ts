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

/** The reverse map — only these three jobs have a legacy intent at all. */
const JOB_TO_LEGACY_INTENT: Partial<Record<OnboardingJob, OnboardingIntent>> = {
  TRAIN: 'TRAIN',
  PLAN_MEALS: 'EAT_BETTER',
  HOUSEHOLD: 'HOUSEHOLD',
};

/**
 * `preferences.setJobs` (T-03.1) writes the legacy `onboardingIntent`
 * alongside the new `onboardingJobs`, so web and older binaries — which only
 * ever read the intent — keep routing sensibly. This is the first job, in
 * the order the user picked them, that has a legacy equivalent; `null` when
 * none does (e.g. only `USE_WHAT_I_HAVE` / `SAVED_RECIPES` / `TRACK`), in
 * which case the caller should leave the stored legacy intent as it was
 * rather than overwrite it with a guess.
 */
export function legacyIntentForJobs(jobs: readonly OnboardingJob[]): OnboardingIntent | null {
  for (const job of jobs) {
    const intent = JOB_TO_LEGACY_INTENT[job];
    if (intent) return intent;
  }
  return null;
}

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
