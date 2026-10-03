import type { OnboardingJob } from '@chefer/types';
import { createExternalStore } from '../gym/offline/external-store';
import { kv } from '../gym/offline/kv';

// ─── Landing cache (T-04.3) ─────────────────────────────────────────────────
// `landingFor()` (@chefer/utils) needs to run SYNCHRONOUSLY at cold start
// (no flash of the wrong mode), before any query has resolved — so the two
// inputs it can't get from the synchronous mode-store (the effective jobs
// list, and whether gym is set up) are cached here, in the same KV backend
// `mode-store.ts` already reads (`kv`, from the gym feature — reused
// read-only, not owned by this cache). `useSyncLandingCache()` (mounted
// once, in the (food) layout) keeps it fresh from the live queries; a stale
// or missing cache just falls back to jobs: [] / hasGymProfile: false,
// which `landingFor` already treats safely (the persisted mode wins).

const JOBS_KEY = 'landing.jobs';
const HAS_GYM_PROFILE_KEY = 'landing.has-gym-profile';

const jobsStore = createExternalStore<OnboardingJob[]>(() => {
  const raw = kv.getJSON(JOBS_KEY);
  return Array.isArray(raw) ? (raw as OnboardingJob[]) : [];
});

// PO-10 (T-04.3 row 4): today's training state, from the gym bootstrap. Dated
// so a value cached yesterday is never read as today's.
const TRAINING_KEY = 'landing.training';

export type CachedTrainingState = {
  /** The device-local date this was computed for. */
  date: string;
  /** Today is one of the user's planned (pinned) training weekdays, and not paused. */
  isTrainingDay: boolean;
  /** A workout was already completed today. */
  workoutDone: boolean;
  /** Reminder time as decimal hours (e.g. 17.5), when reminders are on. */
  reminderHour?: number | undefined;
};

const trainingStore = createExternalStore<CachedTrainingState | null>(() => {
  const raw = kv.getJSON(TRAINING_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const { date, isTrainingDay, workoutDone, reminderHour } = raw as Partial<CachedTrainingState>;
  if (typeof date !== 'string') return null;
  return {
    date,
    isTrainingDay: isTrainingDay === true,
    workoutDone: workoutDone === true,
    ...(typeof reminderHour === 'number' && { reminderHour }),
  };
});

const hasGymProfileStore = createExternalStore<boolean>(
  () => kv.getString(HAS_GYM_PROFILE_KEY) === '1',
);

export function getCachedJobs(): OnboardingJob[] {
  return jobsStore.get();
}

export function setCachedJobs(jobs: readonly OnboardingJob[]): void {
  const next = [...jobs];
  kv.setJSON(JOBS_KEY, next);
  jobsStore.set(next);
}

export function getCachedHasGymProfile(): boolean {
  return hasGymProfileStore.get();
}

export function setCachedHasGymProfile(value: boolean): void {
  kv.setString(HAS_GYM_PROFILE_KEY, value ? '1' : '0');
  hasGymProfileStore.set(value);
}

/** The cached training state, only if it was computed for `today` (a local YYYY-MM-DD). */
export function getCachedTrainingState(today: string): CachedTrainingState | null {
  const cached = trainingStore.get();
  return cached?.date === today ? cached : null;
}

export function setCachedTrainingState(state: CachedTrainingState): void {
  const current = trainingStore.get();
  if (
    current?.date === state.date &&
    current.isTrainingDay === state.isTrainingDay &&
    current.workoutDone === state.workoutDone &&
    current.reminderHour === state.reminderHour
  ) {
    return; // unchanged: no KV write on every bootstrap refetch
  }
  kv.setJSON(TRAINING_KEY, state);
  trainingStore.set(state);
}

/** Test seam: forget cached values so the next read hits the KV store. */
export function resetLandingCacheForTests(): void {
  jobsStore.reset();
  hasGymProfileStore.reset();
  trainingStore.reset();
}
