'use client';

import { useState } from 'react';
import { formatDayWithWeekday } from '@/features/coaching/lib/dates';
import { trpc } from '@/lib/trpc';
import {
  COACHING_COPY,
  EXERCISE_BY_ID,
  type CoachedWorkoutDto,
  type WeightUnit,
} from '@chefer/types';
import { Badge, Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage, workoutTypeLabel } from '@chefer/utils';
import { coachedSetText, rirText } from '../format';
import { useTrainerUnit } from '../use-trainer-unit';

// ─── Workouts (spec §2.5 tab 2) ───────────────────────────────────────────────
// Completed workouts, newest first, paged. Sets, weights, reps, last-set effort
// and dates only: never notes, heart rate or calories (the API does not send them).
// "Keep it simple" (PRD 2026-10 §4.3): an exercise ticked off unedited reads
// "Done as planned" and never shows its planned numbers as lifted weights; a
// logged workout with no exercises reads "Yoga · 45 min".

/** "Yoga · 45 min" (no minutes when the duration is unknown). */
export function workoutTypeLine(
  workout: Pick<CoachedWorkoutDto, 'workoutType' | 'durationMin'>,
): string | null {
  if (!workout.workoutType) return null;
  const label = workoutTypeLabel(workout.workoutType);
  return workout.durationMin !== null ? `${label} · ${workout.durationMin} min` : label;
}

/** "Done as planned · 3 sets": working sets ticked, never their weights or reps. */
function doneAsPlannedText(exercise: CoachedWorkoutDto['exercises'][number]): string {
  const sets = exercise.sets.filter((s) => s.completed && !s.isWarmup).length;
  const label = COACHING_COPY.trainerProfile.doneAsPlanned;
  return sets > 0 ? `${label} · ${sets} set${sets === 1 ? '' : 's'}` : label;
}

export function WorkoutList({
  workouts,
  unit,
  onOpenExercise,
}: {
  workouts: CoachedWorkoutDto[];
  unit: WeightUnit;
  onOpenExercise?: (exerciseId: string, name: string) => void;
}) {
  if (workouts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
        No completed workouts yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label={COACHING_COPY.trainer.tabs.workouts}>
      {workouts.map((workout) => {
        // A logged workout ("Log a workout") or a typed one with nothing to list.
        const typeLine = workout.exercises.length === 0 ? workoutTypeLine(workout) : null;
        return (
          <li
            key={workout.id}
            className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm"
            data-testid="trainer-workout"
          >
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="min-w-0 break-words font-semibold text-gray-900">{workout.name}</h3>
              <p className="text-xs text-gray-500">
                {formatDayWithWeekday(workout.localDate)}
                {!typeLine && workout.durationMin !== null && ` · ${workout.durationMin} min`}
              </p>
            </div>
            {typeLine && (
              <p className="mt-1 text-sm text-gray-700" data-testid="trainer-workout-type">
                {typeLine}
              </p>
            )}
            {workout.isDeload && (
              <Badge variant="info" className="mt-1">
                Deload
              </Badge>
            )}
            {workout.exercises.length > 0 && (
              <ul className="mt-3 flex flex-col divide-y divide-gray-100">
                {workout.exercises.map((exercise) => {
                  const meta = EXERCISE_BY_ID.get(exercise.exerciseId);
                  const load = meta
                    ? { loadType: meta.loadType, perHand: meta.perHand }
                    : undefined;
                  return (
                    <li key={exercise.exerciseId} className="py-2">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        {onOpenExercise ? (
                          <button
                            type="button"
                            onClick={() => onOpenExercise(exercise.exerciseId, exercise.name)}
                            className="-ml-1 flex min-h-11 min-w-0 items-center rounded-md px-1 text-left text-sm font-medium text-gray-900 underline-offset-2 hover:underline"
                          >
                            <span className="min-w-0 break-words">{exercise.name}</span>
                          </button>
                        ) : (
                          <p className="min-w-0 break-words text-sm font-medium text-gray-900">
                            {exercise.name}
                          </p>
                        )}
                        {exercise.lastSetRir !== null &&
                          !exercise.skipped &&
                          !exercise.doneAsPlanned && (
                            <span className="shrink-0 pt-3 text-xs text-gray-500">
                              {rirText(exercise.lastSetRir)}
                            </span>
                          )}
                      </div>
                      {exercise.skipped ? (
                        <p className="text-xs text-gray-500">Skipped</p>
                      ) : exercise.doneAsPlanned ? (
                        <p className="text-sm text-gray-600" data-testid="trainer-done-as-planned">
                          {doneAsPlannedText(exercise)}
                        </p>
                      ) : (
                        <p className="min-w-0 break-words text-sm text-gray-600">
                          {exercise.sets
                            .filter((s) => s.completed)
                            .map((s) => coachedSetText(s, unit, load))
                            .join(' · ') || '—'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ExerciseHistorySheet({
  clientId,
  exercise,
  unit,
  onClose,
}: {
  clientId: string;
  exercise: { id: string; name: string } | null;
  unit: WeightUnit;
  onClose: () => void;
}) {
  const history = trpc.trainer.client.exerciseHistory.useQuery(
    { clientId, exerciseId: exercise?.id ?? '' },
    { enabled: exercise !== null, retry: false },
  );
  const meta = exercise ? EXERCISE_BY_ID.get(exercise.id) : undefined;
  const load = meta ? { loadType: meta.loadType, perHand: meta.perHand } : undefined;
  return (
    <Sheet
      open={exercise !== null}
      onClose={onClose}
      title={exercise?.name ?? 'Exercise'}
      description="Last 8 times"
      size="md"
    >
      <div className="px-5 py-4">
        {history.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
        ) : history.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {userFacingErrorMessage(history.error)}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100">
            {(history.data?.entries ?? []).map((entry) => (
              <li key={entry.localDate} className="py-2">
                <p className="text-xs text-gray-500">
                  {formatDayWithWeekday(entry.localDate)}
                  {entry.lastSetRir !== null && ` · ${rirText(entry.lastSetRir)}`}
                </p>
                <p className="min-w-0 break-words text-sm text-gray-800">
                  {entry.sets.map((s) => coachedSetText(s, unit, load)).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

export function WorkoutsTab({ clientId }: { clientId: string }) {
  const unit = useTrainerUnit();
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const workouts = trpc.trainer.client.workouts.useInfiniteQuery(
    { clientId, limit: 10 },
    { retry: false, getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  if (workouts.isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }
  if (workouts.isError) {
    return (
      <div role="alert" className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
        {userFacingErrorMessage(workouts.error)}
      </div>
    );
  }
  const items = workouts.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <WorkoutList
        workouts={items}
        unit={unit}
        onOpenExercise={(id, name) => setOpen({ id, name })}
      />
      {workouts.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 self-center"
          loading={workouts.isFetchingNextPage}
          onClick={() => void workouts.fetchNextPage()}
        >
          Load more
        </Button>
      )}
      <ExerciseHistorySheet
        clientId={clientId}
        exercise={open}
        unit={unit}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
