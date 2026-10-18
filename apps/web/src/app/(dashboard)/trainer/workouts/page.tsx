import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TemplateLibrary } from '@/features/trainer-templates/components/TemplateLibrary';
import { TEMPLATE_COPY } from '@chefer/types';

/** Workouts, the trainer's template library (trainer-mode.md §6.6, M2). */
export default function TrainerWorkoutsPage() {
  return (
    <TrainerModeGate title={TEMPLATE_COPY.library.title}>
      <TemplateLibrary />
    </TrainerModeGate>
  );
}
