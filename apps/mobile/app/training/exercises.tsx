import {
  CreateExerciseButton,
  ExercisesTab,
} from '../../src/features/gym/library-screens/exercises-tab';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { useT } from '../../src/lib/i18n';

// New shell: the exercise library, pushed from Train (it was a Gym tab). The
// top bar carries Back, the "Exercises" title and the "+ Custom" action.
export default function TrainingExercises() {
  const { t } = useT();
  return (
    <ShellChromeProvider
      value={{
        kind: 'pushed',
        fallback: '/train',
        title: t('nav.items.exercises'),
        actions: <CreateExerciseButton />,
      }}
    >
      <ExercisesTab />
    </ShellChromeProvider>
  );
}
