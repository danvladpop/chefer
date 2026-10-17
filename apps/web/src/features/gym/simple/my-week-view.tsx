'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { RoutineDto, WorkoutType } from '@chefer/types';
import { Button, ErrorState, pressControl } from '@chefer/ui';
import {
  cn,
  myWeekOf,
  myWeekPlanOf,
  plannedDayCount,
  routineDayLabel,
  userFacingErrorMessage,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  workoutTypeLabel,
} from '@chefer/utils';
import { CardLabel, GymCard, GymSkeleton } from '../shared/gym-card';
import { showGymToast } from '../shared/gym-toast';
import { Stepper } from '../shared/stepper';
import { useGymData } from '../shared/use-gym-data';
import { WorkoutTypeSheet } from '../shared/workout-type-sheet';
import { myWeekReturnPath, myWeekSaveError } from './simple-helpers';

// ─── My week (simple training mode §6.4, ADR 0001) ────────────────────────────
// Seven weekday rows, each Rest or a workout type — the "Keep it simple" view
// of the ONE active routine. Saved through `gym.routine.saveMyWeek` against
// the routine's version (a stale one reloads and says so). The weekly goal
// follows the planned-day count until the user changes it. Routine days with
// no weekday are listed read-only. Missing a planned day is never a failure.

export function MyWeekView() {
  const { data, ready, isError, refetch } = useGymData();
  const routine = data?.activeRoutine ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <Link
        href="/gym"
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Today
      </Link>
      <h1 className="font-serif text-2xl font-bold text-neutral-900">My week</h1>
      <p className="mt-1 text-sm text-gray-600">
        Plan a workout type for any day. Days you don&apos;t plan are rest days.
      </p>

      <div className="mt-6">
        {isError ? (
          <ErrorState title="Couldn’t load your week" onRetry={() => void refetch()} />
        ) : !ready || !data ? (
          <GymSkeleton rows={2} />
        ) : (
          <MyWeekEditor
            // A reload after a conflict starts the editor again from the server's week.
            key={`${routine?.id ?? 'none'}:${routine?.version ?? 0}`}
            routine={routine}
            onConflict={() => void refetch()}
          />
        )}
      </div>
    </div>
  );
}

function MyWeekEditor({
  routine,
  onConflict,
}: {
  routine: RoutineDto | null;
  onConflict: () => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const view = myWeekOf(routine);
  const [plan, setPlan] = useState<(WorkoutType | null)[]>(() => myWeekPlanOf(view));
  const [editing, setEditing] = useState<number | null>(null);
  const [goalTouched, setGoalTouched] = useState(false);
  const [goal, setGoal] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const shownGoal = goalTouched ? goal : Math.max(1, plannedDayCount(plan));

  const save = trpc.gym.routine.saveMyWeek.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      showGymToast({ message: 'My week saved' });
      router.replace(myWeekReturnPath(window.location.search));
    },
    onError: (e) => {
      const failure = myWeekSaveError(e, (err) => userFacingErrorMessage(err));
      if (failure.refetch) {
        // The reload remounts this editor, so the toast (which outlives it) says why.
        showGymToast({ message: failure.message, type: 'error', durationMs: 8000 });
        onConflict();
      } else {
        setError(failure.message);
      }
    },
  });

  const changeGoal = (next: number) => {
    setGoalTouched(true);
    setGoal(Math.min(7, Math.max(1, next)));
  };

  return (
    <div className="flex flex-col gap-4">
      <GymCard className="p-0 sm:p-0">
        <ul className="divide-y" data-testid="gym-my-week-rows">
          {plan.map((type, weekday) => (
            <li key={WEEKDAY_SHORT[weekday]}>
              <button
                type="button"
                onClick={() => setEditing(weekday)}
                aria-label={`${WEEKDAY_LONG[weekday]}: ${type ? workoutTypeLabel(type) : 'Rest'}. Change`}
                data-testid={`gym-my-week-row-${weekday}`}
                className={cn(
                  'flex min-h-12 w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50',
                  pressControl,
                )}
              >
                <span className="w-10 shrink-0 text-sm font-semibold text-gray-500">
                  {WEEKDAY_SHORT[weekday]}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    type ? 'font-medium text-gray-900' : 'text-gray-500',
                  )}
                >
                  {type ? workoutTypeLabel(type) : 'Rest'}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </GymCard>

      <GymCard>
        <CardLabel>Weekly goal</CardLabel>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Stepper
            label="weekly goal"
            value={`${shownGoal} workout${shownGoal === 1 ? '' : 's'}`}
            onDecrement={() => changeGoal(shownGoal - 1)}
            onIncrement={() => changeGoal(shownGoal + 1)}
            canDecrement={shownGoal > 1}
            canIncrement={shownGoal < 7}
            className="w-52"
            testId="gym-my-week-goal"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {goalTouched
            ? 'Workouts a week. Any workout counts, planned or not.'
            : 'Follows the days you plan until you change it.'}
        </p>
      </GymCard>

      {view.unscheduled.length > 0 && (
        <GymCard data-testid="gym-my-week-unscheduled">
          <CardLabel>Not on a weekday</CardLabel>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {view.unscheduled.map((day) => (
              <li key={day.id} className="truncate">
                {routineDayLabel(day)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">Start these from Today.</p>
        </GymCard>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="gym-my-week-error">
          {error}
        </p>
      )}

      <Button
        size="lg"
        className="w-full bg-[#944a00] hover:bg-[#7a3d00] sm:w-auto sm:self-end"
        loading={save.isPending}
        onClick={() => {
          setError(null);
          save.mutate({
            week: plan,
            ...(routine && { expectedVersion: routine.version }),
            ...(goalTouched && { weeklyGoal: goal }),
          });
        }}
        data-testid="gym-my-week-save"
      >
        Save
      </Button>

      <WorkoutTypeSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing !== null ? (WEEKDAY_LONG[editing] ?? 'Day') : 'Day'}
        description="Pick a workout type, or Rest."
        initial={editing !== null ? (plan[editing] ?? null) : null}
        allowRest
        testIdPrefix="gym-my-week-type"
        onPick={(type) => {
          if (editing === null) return;
          setPlan((prev) => prev.map((t, i) => (i === editing ? type : t)));
          setEditing(null);
        }}
      />
    </div>
  );
}
