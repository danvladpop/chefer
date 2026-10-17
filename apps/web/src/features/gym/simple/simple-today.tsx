'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { capture } from '@/lib/analytics';
import {
  CalendarDays,
  ChevronRight,
  Flame,
  Play,
  Plus,
  Settings2,
  SkipForward,
} from 'lucide-react';
import type { GymBootstrap, RoutineDayDto, WorkoutType } from '@chefer/types';
import { Button, ProgressRing } from '@chefer/ui';
import {
  myWeekOf,
  myWeekPlanOf,
  myWeekSummary,
  routineDayLabel,
  simpleToday,
  streakWeeksLabel,
  workoutTypeLabel,
} from '@chefer/utils';
import { CardLabel, GymCard } from '../shared/gym-card';
import { SyncIndicator } from '../shared/sync-indicator';
import { WorkoutTypeSheet } from '../shared/workout-type-sheet';
import { buildBackfillWorkout } from '../today/log-past-workout-sheet';
import { LogWorkoutSheet } from '../today/log-workout-sheet';
import { RecentWorkouts } from '../today/RecentWorkouts';
import { ResumeBanner } from '../today/ResumeBanner';
import { getStorage } from '../workout/storage';
import { useActiveWorkout } from '../workout/use-active-workout';
import { doneTodayLine, readSimpleSkip, simpleWeekLine, writeSimpleSkip } from './simple-helpers';

// ─── "Keep it simple" Today (simple training mode §6.4 / §6.7) ───────────────
// Replaces the Gym Today body when `isSimpleTraining(profile, flags)`: the week
// ring with minutes and ~kcal, today's planned workout from My week (Start /
// Log a workout / Skip) or what was done, "Start a workout" with the type
// picker, the routine's unscheduled days as shortcuts, and a link to My week.
// No progression hints, offers or rotation. Missing a planned day is never red.

export function SimpleTodayBody({ data, today }: { data: GymBootstrap; today: string }) {
  const router = useRouter();
  const { session, start } = useActiveWorkout();
  const [skipped, setSkipped] = useState(() => readSimpleSkip(getStorage(), today));
  const [pickOpen, setPickOpen] = useState(false);
  const [logType, setLogType] = useState<WorkoutType | null | undefined>(undefined);

  const view = simpleToday({ bootstrap: data, today, skipped });
  const routine = data.activeRoutine;
  const weekSummary = myWeekSummary(myWeekPlanOf(myWeekOf(routine)));
  const { week, plan } = view;
  const ringLabel = `${week.done} of ${week.goal} workouts this week`;

  const go = (input: Parameters<typeof start>[0], source: string) => {
    if (!session) {
      start(input);
      capture('workout_started', { source });
    }
    router.push('/gym/workout');
  };

  /** Start a routine day live: its type (or Strength (other)), its exercises ready to tick. */
  const startDay = (day: RoutineDayDto, source: string) => {
    const exercises =
      day.exercises.length > 0 ? (buildBackfillWorkout(data, day.id, today)?.exercises ?? []) : [];
    go(
      {
        kind: 'simple',
        workoutType: day.workoutType ?? 'STRENGTH_OTHER',
        name: routineDayLabel(day),
        routine: routine ? { routineId: routine.id, dayId: day.id } : null,
        exercises,
      },
      source,
    );
  };

  const startType = (type: WorkoutType) => {
    setPickOpen(false);
    go({ kind: 'simple', workoutType: type, name: workoutTypeLabel(type) }, 'simple_type');
  };

  return (
    <>
      {session && (
        <ResumeBanner
          session={session}
          bootstrap={data}
          today={today}
          onResume={() => router.push('/gym/workout')}
        />
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {plan.kind === 'planned' && (
            <GymCard data-testid="gym-simple-planned">
              <CardLabel>{view.weekdayLabel}</CardLabel>
              <h2 className="mt-1 truncate font-serif text-xl font-bold text-gray-900">
                {plan.label}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Button
                  size="lg"
                  className="bg-[#944a00] hover:bg-[#7a3d00]"
                  onClick={() => startDay(plan.day, 'simple_planned')}
                  data-testid="gym-simple-start-planned"
                >
                  <Play aria-hidden="true" />
                  {session ? 'Resume workout' : 'Start'}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setLogType(plan.workoutType ?? 'STRENGTH_OTHER')}
                  data-testid="gym-simple-log-planned"
                >
                  Log a workout
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  disabled={session !== null}
                  onClick={() => {
                    writeSimpleSkip(getStorage(), today);
                    setSkipped(true);
                  }}
                  data-testid="gym-simple-skip"
                >
                  <SkipForward aria-hidden="true" />
                  Skip
                </Button>
              </div>
            </GymCard>
          )}

          {plan.kind === 'done' && (
            <GymCard data-testid="gym-simple-done">
              <CardLabel>{view.weekdayLabel}</CardLabel>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {doneTodayLine(plan.session, data.bodyweightKg)}
              </p>
            </GymCard>
          )}

          <GymCard data-testid="gym-simple-something-else">
            <h2 className="text-base font-semibold text-gray-900">
              {plan.kind === 'open' ? 'Nothing planned today' : 'Something else today?'}
            </h2>
            {plan.kind === 'open' && (
              <p className="mt-1 text-sm text-gray-600">Pick what you&apos;re training and go.</p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                size="lg"
                className={plan.kind === 'planned' ? undefined : 'bg-[#944a00] hover:bg-[#7a3d00]'}
                variant={plan.kind === 'planned' ? 'outline' : 'default'}
                onClick={() => (session ? router.push('/gym/workout') : setPickOpen(true))}
                data-testid="gym-simple-start"
              >
                <Plus aria-hidden="true" />
                {session ? 'Resume workout' : 'Start a workout'}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setLogType(view.defaultType)}
                data-testid="gym-simple-log"
              >
                Log a workout
              </Button>
            </div>

            {view.unscheduled.length > 0 && (
              <div className="mt-5">
                <CardLabel>From your routine</CardLabel>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {view.unscheduled.map((day) => (
                    <li key={day.id}>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => startDay(day, 'simple_unscheduled')}
                        data-testid={`gym-simple-unscheduled-${day.id}`}
                      >
                        <Play aria-hidden="true" />
                        {routineDayLabel(day)}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GymCard>

          <RecentWorkouts data={data} today={today} />
        </div>

        {/* The week ring leads on phones (PRD §6.8 Today); it is the rail from lg. */}
        <div className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
          <GymCard data-testid="gym-simple-week">
            <div className="flex items-center gap-4">
              <ProgressRing
                progress={week.goal > 0 ? week.done / week.goal : 0}
                label={ringLabel}
                color={week.goal > 0 && week.done >= week.goal ? '#059669' : '#944a00'}
                data-testid="gym-simple-week-ring"
              >
                <span className="text-sm font-bold text-gray-800">
                  {week.done}/{week.goal}
                </span>
              </ProgressRing>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-gray-900">
                  This week · {week.done} of {week.goal}
                </p>
                <p className="text-gray-700" data-testid="gym-simple-week-line">
                  {simpleWeekLine(week)}
                </p>
                {week.kcal === null && data.bodyweightKg === null && (
                  <p className="text-xs text-gray-500">Log your weight to see calories</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Flame className="h-3.5 w-3.5 shrink-0 text-[#944a00]" aria-hidden="true" />
                  <span className="min-w-0">{streakWeeksLabel(data.streak.current)}</span>
                </p>
              </div>
            </div>
          </GymCard>

          <Link
            href="/gym/my-week"
            className="flex min-h-11 items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:bg-gray-50"
            data-testid="gym-simple-my-week"
          >
            <CalendarDays className="h-5 w-5 shrink-0 text-[#944a00]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">My week</span>
              <span className="block truncate text-xs text-gray-500">{weekSummary}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <SyncIndicator />
            <Link
              href="/gym/settings"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Gym settings
            </Link>
          </div>
        </div>
      </div>

      <WorkoutTypeSheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        initial={view.defaultType}
        confirmLabel="Start"
        testIdPrefix="gym-simple-type"
        onPick={(type) => type && startType(type)}
      />

      <LogWorkoutSheet
        open={logType !== undefined}
        onClose={() => setLogType(undefined)}
        initialType={logType ?? null}
      />
    </>
  );
}
