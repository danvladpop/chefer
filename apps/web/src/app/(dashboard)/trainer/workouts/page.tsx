import { ComingSoon } from '@/features/trainer-mode/components/ComingSoon';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TRAINER_MODE_COPY } from '@chefer/types';

/** Workouts, the template library (trainer-mode.md §6.6), arrives in M2; the tab says so until then. */
export default function TrainerWorkoutsPage() {
  const copy = TRAINER_MODE_COPY.comingSoon;
  return (
    <TrainerModeGate title={TRAINER_MODE_COPY.tabs.workouts}>
      <ComingSoon
        heading={TRAINER_MODE_COPY.tabs.workouts}
        title={copy.workoutsTitle}
        body={copy.workoutsBody}
        icon="workouts"
      />
    </TrainerModeGate>
  );
}
