import { Redirect } from 'expo-router';
import { trainerModePathFor } from '../../src/features/shell/shell-routes';
import { useTrainerModeAvailability } from '../../src/features/trainer-mode/use-trainer-mode';
import { TrainerGate } from '../../src/features/trainer/components/trainer-gate';
import { TrainerHome } from '../../src/features/trainer/home/trainer-home';

// `/trainer`: the trainer's Clients list (WP-18). Inside the availability + trainer-tools gate.
// Trainer mode (trainer-mode.md §5.2): once it is available, Trainer tools is its Clients tab — the
// old URL (a bookmark, an old notification) goes there. With `trainerMode` off nothing changes.
export default function TrainerHomeRoute() {
  const trainerMode = useTrainerModeAvailability();
  const target = trainerModePathFor('/trainer');
  if (trainerMode && target) return <Redirect href={target} />;
  return (
    <TrainerGate>
      <TrainerHome />
    </TrainerGate>
  );
}
