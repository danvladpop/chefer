import { AskChefAction } from '../../src/features/shell/add-action';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { useShellV2 } from '../../src/features/shell/shell-store';
import { TrainingRoutineScreen } from '../../src/features/shell/train/training-routine-screen';
import RoutineScreen from '../(gym)/routine';

// New shell: Routine, pushed from Train (it was a Gym tab). 10 Oct redesign:
// the routine card, its days as tiles and the weekly balance (board
// "TrainingRoutine"); the old shell keeps the old Routine screen.
export default function TrainingRoutine() {
  const shellV2 = useShellV2();
  if (!shellV2) {
    return (
      <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
        <RoutineScreen />
      </ShellChromeProvider>
    );
  }
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/train', title: 'Routine', actions: <AskChefAction /> }}
    >
      <TrainingRoutineScreen />
    </ShellChromeProvider>
  );
}
