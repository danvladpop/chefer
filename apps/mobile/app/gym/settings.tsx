import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymSettingsScreen() {
  return (
    <GymPlaceholder
      variant="stack"
      title="Gym settings"
      testID="gym-settings-title"
      description="Units, equipment, reminders, pause and sync status (G2-B)."
    />
  );
}
