import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymRoutinesScreen() {
  return (
    <GymPlaceholder
      variant="stack"
      title="My routines"
      testID="gym-routines-title"
      description="Create, switch, duplicate and archive routines (G2-C)."
    />
  );
}
