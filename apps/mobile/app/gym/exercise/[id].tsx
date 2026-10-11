import { useLocalSearchParams } from 'expo-router';
import { ExerciseDetailScreen } from '../../../src/features/gym/library-screens/exercise-detail-screen';
import { ShellChromeProvider } from '../../../src/features/shell/shell-chrome';
import { useShellV2 } from '../../../src/features/shell/shell-store';

// Gym stack route: exercise detail (gym_plan.md §1.3). New shell (10 Oct
// redesign): pushed chrome — the top bar's Back falls back to the exercise
// library on Train; the exercise's name is the page's own title1 heading.
export default function GymExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shellV2 = useShellV2();
  return shellV2 ? (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/training/exercises' }}>
      <ExerciseDetailScreen exerciseId={id} />
    </ShellChromeProvider>
  ) : (
    <ExerciseDetailScreen exerciseId={id} />
  );
}
