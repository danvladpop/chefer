import type { ReactElement } from 'react';
import type { NextWorkoutDto } from '@chefer/types';
import { StartConflictSheet } from '../../gym/today/start-conflict-sheet';
import { useGuardedStart } from '../../gym/today/use-train-today';

// Starting a workout from Today (10 Oct redesign) behaves exactly like Train's
// Start (UX-GYM-02): one shared hook, `useGuardedStart`, parks a start while a
// workout is open and the conflict sheet asks Resume / Finish & start /
// Discard & start. This wrapper only adds the sheet element Today renders.

export function useStartGuard(): {
  startPlanned: (workout: NextWorkoutDto) => void;
  conflictSheet: ReactElement | null;
} {
  const guarded = useGuardedStart();
  const { activeWorkout, pendingStart, setPendingStart } = guarded;

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

  return { startPlanned: (workout) => guarded.startPlanned(workout), conflictSheet };
}
