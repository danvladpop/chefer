import { useLocalSearchParams } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { GymPlaceholder } from '../../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GymPlaceholder
      variant="stack"
      title="Exercise"
      testID="gym-exercise-title"
      description="Photos, technique video, cues and your history (G2-D)."
    >
      <Text variant="muted">id: {id}</Text>
    </GymPlaceholder>
  );
}
