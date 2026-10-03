import { useEffect } from 'react';
import { landingFor, type LandingSurface } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { getMode, hasChosenMode } from '../gym/mode-store';
import { activeSessionStore } from '../gym/offline/active-session-store';
import { localDate } from '../gym/offline/ids';
import { getGymOwner } from '../gym/offline/owner';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';
import {
  getCachedHasGymProfile,
  getCachedJobs,
  getCachedTrainingState,
  setCachedHasGymProfile,
  setCachedJobs,
  setCachedTrainingState,
} from './landing-cache';
import { trainingLandingState } from './training-landing';

// ─── Landing (UX-04 §1, T-04.3, UX-PO-10) ───────────────────────────────────
// `landingFor()` applied on cold start — synchronous, no flash of the wrong
// mode — and again on a foreground after 30 minutes away
// (foreground-landing.ts). Live inputs:
//  - row 1: a workout in progress (the active-session store, read
//    synchronously) lands on Gym, where Today's Resume card is, even over an
//    explicit Food choice;
//  - row 4: today's training state (a pinned training day, not yet done, the
//    reminder hour), cached from the gym bootstrap by `useSyncLandingCache`;
//  - rows 2/3/5: jobs + whether gym is set up.
// An explicit Food/Gym choice still beats rows 2-5 (owner dogfood
// 2026-09-30: a TRAIN-only account tapping Food was sent straight back to Gym).

/**
 * Row 1: a workout is running for this account (a "Save for later" one is
 * parked, not in progress). The ownership rule mirrors `getResumableSession`
 * in use-active-workout.ts, which is not imported here to keep this module
 * (read synchronously at launch) free of the workout engine's dependencies.
 */
export function hasWorkoutInProgress(): boolean {
  const record = activeSessionStore.get();
  if (record?.pausedAt !== null) return false;
  const owner = getGymOwner();
  return owner === null || record.ownerId === null || record.ownerId === owner;
}

/** Local time as decimal hours, e.g. 14:30 → 14.5. */
function localHourOf(now: Date): number {
  return now.getHours() + now.getMinutes() / 60;
}

/**
 * Synchronous: the surface a plain launch (or a long-stale foreground) should
 * open. An explicit Food/Gym choice always wins — the jobs-based default only
 * decides for someone who has never picked — except for a workout in progress.
 */
export function landingSurfaceSync(now: Date = new Date()): LandingSurface {
  if (hasWorkoutInProgress()) return 'gym';
  if (hasChosenMode()) return getMode();
  const training = getCachedTrainingState(localDate(now));
  return landingFor({
    jobs: getCachedJobs(),
    persistedMode: getMode(),
    hasGymProfile: getCachedHasGymProfile(),
    workoutInProgress: false,
    ...(training && {
      isTrainingDayToday: training.isTrainingDay,
      workoutDoneToday: training.workoutDone,
      localHour: localHourOf(now),
      ...(training.reminderHour !== undefined && { reminderHour: training.reminderHour }),
    }),
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
  // Read-only subscription to the persisted gym bootstrap (Today / the Food
  // dashboard card fetch it); this never triggers a fetch itself.
  const { data: bootstrap } = useGymBootstrap({ enabled: false });

  useEffect(() => {
    if (prefs) setCachedJobs(prefs.jobs);
  }, [prefs]);

  useEffect(() => {
    if (gymProfile !== undefined) setCachedHasGymProfile(gymProfile !== null);
  }, [gymProfile]);

  // UX-PO-10: today's training state for the next synchronous landing read.
  useEffect(() => {
    if (bootstrap) setCachedTrainingState(trainingLandingState(bootstrap, localDate()));
  }, [bootstrap]);
}
