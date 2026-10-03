import type { GymBootstrap } from '@chefer/types';
import { selectTodaysSession } from '@chefer/utils';
import { setupLocalDate } from '../gym/today/today-helpers';
import type { CachedTrainingState } from './landing-cache';

// ─── Training state for the landing (UX-PO-10, T-04.3 row 4) ────────────────────
// `landingFor` needs "is today a planned training day?", "already trained?" and
// the reminder hour. They come from the gym bootstrap, so they are computed
// here (pure) and cached by `useSyncLandingCache` for the next synchronous read.

type BootstrapForLanding = Pick<
  GymBootstrap,
  'profile' | 'activeRoutine' | 'recentSessions' | 'nextWorkout' | 'activePause'
>;

/** "17:30" → 17.5; null for a missing or malformed time. */
export function reminderHourOf(time: string | null | undefined): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours + minutes / 60 : undefined;
}

/**
 * Row 4's inputs for `today`. A "planned training day" is a routine day pinned
 * to today's weekday (an unpinned rotation has no planned weekdays, so it never
 * counts), and a pause cancels it. Without a gym profile there is nothing.
 */
export function trainingLandingState(
  bootstrap: BootstrapForLanding,
  today: string,
): CachedTrainingState {
  const { profile } = bootstrap;
  if (!profile) return { date: today, isTrainingDay: false, workoutDone: false };
  const todays = selectTodaysSession({
    bootstrap,
    today,
    since: setupLocalDate(profile.setupCompletedAt),
  });
  const reminderHour = profile.reminderEnabled ? reminderHourOf(profile.reminderTime) : undefined;
  return {
    date: today,
    isTrainingDay: todays.kind === 'planned' && !bootstrap.activePause,
    workoutDone: todays.kind === 'completed',
    ...(reminderHour !== undefined && { reminderHour }),
  };
}
