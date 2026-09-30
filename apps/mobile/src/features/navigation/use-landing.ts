import { useEffect } from 'react';
import { landingFor, type LandingSurface } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { getMode, hasChosenMode } from '../gym/mode-store';
import {
  getCachedHasGymProfile,
  getCachedJobs,
  setCachedHasGymProfile,
  setCachedJobs,
} from './landing-cache';

// ─── Landing (UX-04 §1, T-04.3) ─────────────────────────────────────────────
// `landingFor()` applied on cold start — synchronous, no flash of the wrong
// mode. Scope note (see the final report): this wires table rows 2/3/5
// (jobs + whether gym is set up) and the persisted-mode override; rows 1
// (a workout in progress) and 4 (a planned training day, not yet done,
// from 14:00 or the reminder-time rule) are fully implemented and tested
// in `landingFor` itself but aren't fed live data here yet — that needs
// the gym active-session store and today's training-day/session state,
// both out of this lane's ownership to wire safely in the time available.
// The foreground-after-30-minutes re-application (the other half of T-04.3)
// isn't wired either; only the cold-start read is.

/**
 * Synchronous: the surface a plain cold-start launch should open. An explicit
 * Food/Gym choice always wins — the jobs-based default only decides for
 * someone who has never picked (owner dogfood 2026-09-30: a TRAIN-only
 * account tapping Food was sent straight back to Gym).
 */
export function landingSurfaceSync(): LandingSurface {
  if (hasChosenMode()) return getMode();
  return landingFor({
    jobs: getCachedJobs(),
    persistedMode: getMode(),
    hasGymProfile: getCachedHasGymProfile(),
  });
}

/**
 * Keeps the landing cache fresh from the live queries, so the NEXT cold
 * start (this session's data wasn't available for THIS one) reads current
 * jobs / gym-setup state. Mount once, in the (food) layout.
 */
export function useSyncLandingCache(): void {
  const { data: prefs } = trpc.preferences.get.useQuery();
  const { data: gymProfile } = trpc.gym.profile.get.useQuery();

  useEffect(() => {
    if (prefs) setCachedJobs(prefs.jobs);
  }, [prefs]);

  useEffect(() => {
    if (gymProfile !== undefined) setCachedHasGymProfile(gymProfile !== null);
  }, [gymProfile]);
}
