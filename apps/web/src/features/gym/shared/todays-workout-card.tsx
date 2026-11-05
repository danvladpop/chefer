'use client';

import { useMemo } from 'react';
import { useAppMode } from '@/features/nav/mode-context';
import { useT } from '@/lib/i18n';
import { ChevronRight, Dumbbell } from 'lucide-react';
import { collectPrs, selectTodaysSession } from '@chefer/utils';
import { localDate } from '../use-gym-bootstrap';
import { useGymData } from './use-gym-data';
import { WeekRing } from './week-ring';

/**
 * "Today's workout" on the food dashboard (gym_plan.md D11, §6.3): the next
 * day's name, or "Done ✓ · 3 PRs", plus the week ring. Clicking switches to
 * Gym mode on Today.
 */
export function TodaysWorkoutCard() {
  const { t } = useT();
  const { data, today, ready } = useGymData();
  const { switchMode } = useAppMode();

  const todays = useMemo(() => {
    if (!data || !today) return { done: false, prs: 0 };
    const sessions = data.recentSessions.filter((s) => s.status === 'COMPLETED');
    // F-1 (2026-10-17): any workout done today, a logged one included.
    const done = sessions.some((s) => s.localDate === today);
    const prs = done ? collectPrs(sessions).filter((p) => p.localDate === today).length : 0;
    return { done, prs };
  }, [data, today]);

  if (!ready || !data) {
    return <div className="h-24 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }

  const hasProfile = data.profile !== null;
  // UX-FOOD-19: the Plan names the routine day pinned to today's weekday, so a
  // pinned day beats the rotation's "next" here too (one shared selector).
  const session = today
    ? selectTodaysSession({
        bootstrap: data,
        today,
        since: data.profile?.setupCompletedAt
          ? localDate(new Date(data.profile.setupCompletedAt))
          : null,
      })
    : { kind: 'none' as const };
  const pinnedDay =
    session.kind === 'planned' && session.dayId !== data.nextWorkout?.dayId
      ? data.activeRoutine?.days.find((d) => d.id === session.dayId)
      : undefined;
  const title = !hasProfile
    ? t('gym.todaysWorkout.startStrength')
    : todays.done
      ? todays.prs > 0
        ? t('gym.todaysWorkout.donePrs', { count: todays.prs })
        : t('gym.todaysWorkout.done')
      : (pinnedDay?.name ?? data.nextWorkout?.dayName ?? t('gym.todaysWorkout.freestyle'));
  const subtitle = !hasProfile
    ? t('gym.todaysWorkout.setup')
    : todays.done
      ? t('gym.todaysWorkout.next', { day: data.nextWorkout?.dayName ?? '—' })
      : pinnedDay
        ? t('gym.todaysWorkout.exercises', { count: pinnedDay.exercises.length })
        : data.nextWorkout
          ? t('gym.todaysWorkout.exercisesMin', {
              count: data.nextWorkout.exercises.length,
              min: data.nextWorkout.estimatedMin,
            })
          : t('gym.todaysWorkout.noRoutine');

  return (
    <button
      type="button"
      onClick={() => switchMode('gym')}
      className="flex w-full min-w-0 items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-[#944a00]/40 sm:p-5"
      data-testid="todays-workout-card"
    >
      {hasProfile ? (
        <WeekRing done={data.streak.thisWeekSessions} goal={data.streak.thisWeekGoal} size={56} />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fff3e8]">
          <Dumbbell className="h-6 w-6 text-[#944a00]" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('gym.todaysWorkout.title')}
        </span>
        <span className="mt-0.5 block truncate text-base font-semibold text-gray-900">{title}</span>
        <span className="block truncate text-xs text-gray-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  );
}
