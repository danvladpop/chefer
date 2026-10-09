import { ExercisesTab } from '../../src/features/gym/library-screens/exercises-tab';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';

// New shell: the exercise library, pushed from Train (it was a Gym tab).
export default function TrainingExercises() {
  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
      <ExercisesTab />
    </ShellChromeProvider>
  );
}
