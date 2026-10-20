import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TrainerYou } from '@/features/trainer-mode/components/TrainerYou';

/** Trainer You on web (trainer-mode.md §6.8); without trainer mode, /trainer takes over. */
export default function TrainerSettingsPage() {
  return (
    <TrainerModeGate title="Trainer settings">
      <TrainerYou />
    </TrainerModeGate>
  );
}
