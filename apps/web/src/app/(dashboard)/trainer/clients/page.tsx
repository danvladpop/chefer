import { TrainerClients } from '@/features/trainer-mode/components/TrainerClients';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';

/** Trainer mode's Clients (trainer-mode.md §6.4); without trainer mode, /trainer takes over. */
export default function TrainerClientsPage() {
  return (
    <TrainerModeGate title="Clients">
      <TrainerClients />
    </TrainerModeGate>
  );
}
