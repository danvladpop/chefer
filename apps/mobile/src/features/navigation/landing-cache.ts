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

/** Test seam: forget cached values so the next read hits the KV store. */
export function resetLandingCacheForTests(): void {
  jobsStore.reset();
  hasGymProfileStore.reset();
}
