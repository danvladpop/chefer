import { useLocalSearchParams } from 'expo-router';
import { ExerciseFormScreen } from '../../src/features/gym/library-screens/exercise-form-screen';

// Gym stack route: create or edit a custom exercise (gym_plan.md §1.3).
export default function GymExerciseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ExerciseFormScreen exerciseId={id} />;
}
