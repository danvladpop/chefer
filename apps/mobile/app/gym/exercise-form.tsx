import { useLocalSearchParams } from 'expo-router';
import { ExerciseFormScreen } from '../../src/features/gym/library-screens/exercise-form-screen';

// Gym stack route: create or edit a custom exercise (gym_plan.md §1.3).
// `?name=` pre-fills a new exercise from an empty search ("Create 'T-bar'").
export default function GymExerciseFormScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  return (
    <ExerciseFormScreen
      exerciseId={id}
      {...(typeof name === 'string' && name.length > 0 ? { initialName: name } : {})}
    />
  );
}
