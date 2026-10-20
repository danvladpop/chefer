import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TrainerToday } from '@/features/trainer-mode/components/TrainerToday';

/** Trainer mode's Today (trainer-mode.md §6.1); without trainer mode, /trainer takes over. */
export default function TrainerTodayPage() {
  return (
    <TrainerModeGate title="Today">
      <TrainerToday />
    </TrainerModeGate>
  );
}
