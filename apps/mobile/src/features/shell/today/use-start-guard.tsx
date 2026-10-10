import { useState, type ReactElement } from 'react';
import { router } from 'expo-router';
import type { NextWorkoutDto } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import { StartConflictSheet } from '../../gym/today/start-conflict-sheet';
import { useActiveWorkout } from '../../gym/use-active-workout';

// Starting a workout from Today (10 Oct redesign) behaves exactly like Train's
// Start (gym/today/today-screen.tsx, UX-GYM-02): `startWorkout` hands back the
// EXISTING session when one is in progress, so any start while one is open
// parks here and the conflict sheet asks Resume / Finish & start / Discard &
// start. The same logic as Train's screen, in a hook so Today can share it
// without touching that screen's render.

export function useStartGuard(): {
  startPlanned: (workout: NextWorkoutDto) => void;
  conflictSheet: ReactElement | null;
} {
  const activeWorkout = useActiveWorkout();
  const snackbar = useSnackbar();
  const [pendingStart, setPendingStart] = useState<{
    targetName: string;
    run: () => void;
  } | null>(null);

  const guardStart = (targetName: string, run: () => void) => {
    if (activeWorkout.isActive) setPendingStart({ targetName, run });
    else run();
  };

  const startPlanned = (workout: NextWorkoutDto) => {
    guardStart(workout.dayName, () => {
      activeWorkout.start({ kind: 'planned', workout });
      router.push('/gym/workout');
    });
  };

  const handleResume = () => {
    setPendingStart(null);
    activeWorkout.resume();
    router.push('/gym/workout');
  };
  const handleFinishAndStart = async () => {
    const run = pendingStart?.run;
    setPendingStart(null);
    if (!run) return;
    const finished = await activeWorkout.finish();
    if (finished) snackbar.show({ message: `${finished.name} finished.` });
    run();
  };
  const handleDiscardAndStart = () => {
    const run = pendingStart?.run;
    setPendingStart(null);
    if (!run) return;
    activeWorkout.discard();
    run();
  };

  const conflictSheet = activeWorkout.session ? (
    <StartConflictSheet
      visible={pendingStart !== null}
      onClose={() => setPendingStart(null)}
      session={activeWorkout.session}
      targetName={pendingStart?.targetName ?? 'a new workout'}
      onResume={handleResume}
      onFinishAndStart={() => void handleFinishAndStart()}
      onDiscardAndStart={handleDiscardAndStart}
    />
  ) : null;

  return { startPlanned, conflictSheet };
}
