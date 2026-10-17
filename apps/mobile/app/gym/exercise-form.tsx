import { useLocalSearchParams } from 'expo-router';
import { ExerciseFormScreen } from '../../src/features/gym/library-screens/exercise-form-screen';
import { useShellV2 } from '../../src/features/shell/shell-store';
import { ExerciseFormV2Screen } from '../../src/features/shell/train/exercise-form-v2';

// Gym stack route: create or edit a custom exercise (gym_plan.md §1.3).
// `?name=` pre-fills a new exercise from an empty search ("Create 'T-bar'").
// 10 Oct redesign: the new shell (`mobileShellV2`) renders the ExerciseForm
// board; the old shell keeps the legacy screen.
export default function GymExerciseFormScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const shellV2 = useShellV2();
  const initial = typeof name === 'string' && name.length > 0 ? { initialName: name } : {};
  return shellV2 ? (
    <ExerciseFormV2Screen exerciseId={id} {...initial} />
  ) : (
    <ExerciseFormScreen exerciseId={id} {...initial} />
  );
}
