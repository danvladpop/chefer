import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymWorkoutScreen() {
  return (
    <GymPlaceholder
      variant="stack"
      title="Workout"
      testID="gym-workout-title"
      description="The active workout: set rows, rest timer and Finish (G2-A)."
    />
  );
}
