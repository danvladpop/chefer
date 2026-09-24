import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym tab — placeholder (G1-C); wave G2 replaces this screen's body.
export default function StatsScreen() {
  return (
    <GymPlaceholder
      variant="tab"
      title="Stats"
      testID="gym-stats-title"
      description="Strength trends, weekly sets and consistency (G2-D)."
    />
  );
}
