import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymExerciseFormScreen() {
  return (
    <GymPlaceholder
      variant="stack"
      title="New exercise"
      testID="gym-exercise-form-title"
      description="Create a custom exercise (G2-D)."
    />
  );
}
