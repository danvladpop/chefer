import { useLocalSearchParams } from 'expo-router';
import { ExerciseDetailScreen } from '../../../src/features/gym/library-screens/exercise-detail-screen';

// Gym stack route: exercise detail (gym_plan.md §1.3).
export default function GymExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseDetailScreen exerciseId={id} />;
}
