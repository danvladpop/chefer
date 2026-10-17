import { SetupStyleGate } from '../../src/features/gym/setup/setup-style-gate';

// Gym stack route (G2-B): the setup stepper (gym_plan.md §1.3), asking "How do
// you like to train?" first when simple training mode is on (§6.1).
export default function GymSetupScreen() {
  return <SetupStyleGate />;
}
