import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym tab — placeholder (G1-C); wave G2 replaces this screen's body.
export default function RoutineScreen() {
  return (
    <GymPlaceholder
      variant="tab"
      title="Routine"
      testID="gym-routine-title"
      description="Your routine days, weekly balance and editing (G2-C)."
    />
  );
}
