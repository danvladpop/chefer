import type { ReactElement } from 'react';
import { router } from 'expo-router';
import type { GymBootstrap, RoutineDayDto, WorkoutType } from '@chefer/types';
import { localDate } from '../offline/ids';
import { StartConflictSheet } from '../today/start-conflict-sheet';
import { workoutForDay } from '../today/today-helpers';
import { useGuardedStart } from '../today/use-train-today';
import { simpleDayStart, simpleTypeStart, type SimpleStart } from './simple-helpers';

// Starting a "Keep it simple" workout from Train, the old Gym Today or Food
// Today: the same guarded start as every other Start (UX-GYM-02 — a workout
// already open asks Resume / Finish & start / Discard & start first), then the
// live logger. A routine day brings its exercises (built by the same per-day
// builder Train uses), ready to tick; a type alone starts empty.

export function useSimpleStart(bootstrap: GymBootstrap | undefined): {
  startType: (type: WorkoutType) => void;
  startDay: (day: RoutineDayDto) => void;
  conflictSheet: ReactElement | null;
} {
  const guarded = useGuardedStart();
  const { activeWorkout, pendingStart, setPendingStart } = guarded;

  const run = (input: SimpleStart) => {
    guarded.guardStart(input.name, () => {
      activeWorkout.start(input);
      router.push('/gym/workout');
    });
  };

  const startDay = (day: RoutineDayDto) => {
    const routine = bootstrap?.activeRoutine;
    if (!bootstrap || !routine) return;
    const exercises =
      day.exercises.length > 0
        ? (workoutForDay(bootstrap, day.id, localDate())?.exercises ?? [])
        : [];
    run(simpleDayStart(routine, day, exercises));
  };

  const conflictSheet = activeWorkout.session ? (
    <StartConflictSheet
      visible={pendingStart !== null}
      onClose={() => setPendingStart(null)}
      session={activeWorkout.session}
      targetName={pendingStart?.targetName ?? 'a new workout'}
      onResume={guarded.handleConflictResume}
      onFinishAndStart={() => void guarded.handleConflictFinishAndStart()}
      onDiscardAndStart={guarded.handleConflictDiscardAndStart}
    />
  ) : null;

  return { startType: (type) => run(simpleTypeStart(type)), startDay, conflictSheet };
}
