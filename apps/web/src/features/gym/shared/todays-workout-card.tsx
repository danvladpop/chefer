'use client';

import { useMemo } from 'react';
import { useAppMode } from '@/features/nav/mode-context';
import { ChevronRight, Dumbbell } from 'lucide-react';
import { collectPrs } from '@chefer/utils';
import { useGymData } from './use-gym-data';
import { WeekRing } from './week-ring';

/**
 * "Today's workout" on the food dashboard (gym_plan.md D11, §6.3): the next
 * day's name, or "Done ✓ · 3 PRs", plus the week ring. Clicking switches to
 * Gym mode on Today.
 */
export function TodaysWorkoutCard() {
  const { data, today, ready } = useGymData();
  const { switchMode } = useAppMode();

  const todays = useMemo(() => {
    if (!data || !today) return { done: false, prs: 0 };
    const sessions = data.recentSessions.filter((s) => s.status === 'COMPLETED');
    const done = sessions.some((s) => s.localDate === today);
    const prs = done ? collectPrs(sessions).filter((p) => p.localDate === today).length : 0;
    return { done, prs };
  }, [data, today]);

  if (!ready || !data) {
    return <div className="h-24 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }

  const hasProfile = data.profile !== null;
  const title = !hasProfile
    ? 'Start strength training'
    : todays.done
      ? `Done ✓${todays.prs > 0 ? ` · ${todays.prs} PR${todays.prs === 1 ? '' : 's'}` : ''}`
      : (data.nextWorkout?.dayName ?? 'Freestyle workout');
  const subtitle = !hasProfile
    ? 'A 90-second setup picks a program for you.'
    : todays.done
      ? `Next: ${data.nextWorkout?.dayName ?? '—'}`
      : data.nextWorkout
        ? `${data.nextWorkout.exercises.length} exercises · ~${data.nextWorkout.estimatedMin} min`
        : 'No active routine';

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
        <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Today&apos;s workout
        </span>
        <span className="mt-0.5 block truncate text-base font-semibold text-gray-900">{title}</span>
        <span className="block truncate text-xs text-gray-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  );
}
