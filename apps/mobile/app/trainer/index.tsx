import { TrainerGate } from '../../src/features/trainer/components/trainer-gate';
import { TrainerHome } from '../../src/features/trainer/home/trainer-home';

// `/trainer`: the trainer's Clients list (WP-18). Inside the availability + trainer-tools gate.
export default function TrainerHomeRoute() {
  return (
    <TrainerGate>
      <TrainerHome />
    </TrainerGate>
  );
}
