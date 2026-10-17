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
 * none does (e.g. only `SAVED_RECIPES` / `TRACK`), in
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

/**
 * Jobs the product no longer offers (WP-24 / FB7-10: the "In my kitchen"
 * pantry is retired). The enum value stays valid — old clients can still send
 * it and rows already store it — but no picker shows it, and `effectiveJobs`
 * reads it as its closest live job so it never routes anyone to the pantry.
 */
export const RETIRED_ONBOARDING_JOBS: readonly OnboardingJob[] = ['USE_WHAT_I_HAVE'];

const RETIRED_JOB_REPLACEMENT: Partial<Record<OnboardingJob, OnboardingJob>> = {
  USE_WHAT_I_HAVE: 'PLAN_MEALS',
};

/** True when a picker may still offer this job to the user. */
export function isOfferedOnboardingJob(job: OnboardingJob): boolean {
  return !RETIRED_ONBOARDING_JOBS.includes(job);
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
  // A stored retired job (USE_WHAT_I_HAVE) reads as its live neighbour, in place.
  const jobs = new Set<OnboardingJob>(base.map((job) => RETIRED_JOB_REPLACEMENT[job] ?? job));

  if ((input.loggedDaysLast7 ?? 0) >= TRACK_INFERENCE_MIN_DAYS) {
    jobs.add('TRACK');
  }

  return [...jobs];
}

function mapLegacyIntent(intent: OnboardingIntent | null): OnboardingJob[] {
  if (!intent) return [];
  return [LEGACY_INTENT_TO_JOB[intent]];
}
