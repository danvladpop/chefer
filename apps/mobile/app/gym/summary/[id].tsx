import { useLocalSearchParams } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { GymPlaceholder } from '../../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GymPlaceholder
      variant="stack"
      title="Workout summary"
      testID="gym-summary-title"
      description="PRs, week ring and the next-time decisions (G2-A)."
    >
      <Text variant="muted">id: {id}</Text>
    </GymPlaceholder>
  );
}
