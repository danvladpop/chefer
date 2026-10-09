import { TodayScreen } from '../../src/features/gym/today/today-screen';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';

// New shell: Train. Gym's Today, titled Train, with Routine, Exercises, Stats
// and Gym settings listed at its foot (plan: "Train").
export default function TrainTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root' }}>
      <TodayScreen />
    </ShellChromeProvider>
  );
}
