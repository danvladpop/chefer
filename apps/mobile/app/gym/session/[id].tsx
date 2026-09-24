import { useLocalSearchParams } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { GymPlaceholder } from '../../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GymPlaceholder
      variant="stack"
      title="Session"
      testID="gym-session-title"
      description="A past session in detail (G2-B)."
    >
      <Text variant="muted">id: {id}</Text>
    </GymPlaceholder>
  );
}
