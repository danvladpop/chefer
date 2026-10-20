import { TRAINER_MODE_COPY } from '@chefer/types';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { ComingSoonScreen } from '../../src/features/trainer-mode/coming-soon-screen';

// Trainer mode: Workouts, the template library (trainer-mode.md §6.6). Templates arrive in M2.
export default function TrainerWorkoutsTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: TRAINER_MODE_COPY.tabs.workouts }}>
      <ComingSoonScreen
        testID="trainer-workouts"
        icon="workouts"
        title={TRAINER_MODE_COPY.comingSoon.workoutsTitle}
        body={TRAINER_MODE_COPY.comingSoon.workoutsBody}
      />
    </ShellChromeProvider>
  );
}
