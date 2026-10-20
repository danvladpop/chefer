import { ComingSoon } from '@/features/trainer-mode/components/ComingSoon';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TRAINER_MODE_COPY } from '@chefer/types';

/** Schedule (trainer-mode.md §6.2) arrives in M3; the tab says so until then. */
export default function TrainerSchedulePage() {
  const copy = TRAINER_MODE_COPY.comingSoon;
  return (
    <TrainerModeGate title={TRAINER_MODE_COPY.tabs.schedule}>
      <ComingSoon
        heading={TRAINER_MODE_COPY.tabs.schedule}
        title={copy.scheduleTitle}
        body={copy.scheduleBody}
        icon="schedule"
      />
    </TrainerModeGate>
  );
}
