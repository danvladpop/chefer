import { TRAINER_MODE_COPY } from '@chefer/types';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { ComingSoonScreen } from '../../src/features/trainer-mode/coming-soon-screen';

// Trainer mode: Schedule (trainer-mode.md §6.2). Bookings arrive in M3.
export default function TrainerScheduleTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: TRAINER_MODE_COPY.tabs.schedule }}>
      <ComingSoonScreen
        testID="trainer-schedule"
        icon="schedule"
        title={TRAINER_MODE_COPY.comingSoon.scheduleTitle}
        body={TRAINER_MODE_COPY.comingSoon.scheduleBody}
      />
    </ShellChromeProvider>
  );
}
