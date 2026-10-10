import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import RoutineScreen from '../(gym)/routine';

// New shell: Routine, pushed from Train (it was a Gym tab).
export default function TrainingRoutine() {
  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
      <RoutineScreen />
    </ShellChromeProvider>
  );
}
