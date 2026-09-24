import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym tab — placeholder (G1-C); wave G2 replaces this screen's body.
export default function ExercisesScreen() {
  return (
    <GymPlaceholder
      variant="tab"
      title="Exercises"
      testID="gym-exercises-title"
      description="Search the exercise library and your custom exercises (G2-D)."
    />
  );
}
