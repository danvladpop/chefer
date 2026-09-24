import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym tab — placeholder (G1-C); wave G2 replaces this screen's body.
export default function TodayScreen() {
  return (
    <GymPlaceholder
      variant="tab"
      title="Today"
      testID="gym-today-title"
      description="Next up, the week ring and your streak (G2-B)."
    />
  );
}
