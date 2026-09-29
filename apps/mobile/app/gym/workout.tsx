import { useLocalSearchParams } from 'expo-router';
import { EditSessionScreen } from '../../src/features/gym/workout/edit-session-screen';
import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';

// Active workout (G2-A, gym_plan.md §1.3). Full-screen, swipe-back disabled in
// the root Stack; Android back offers "Minimise" instead of leaving.
// UX-44: `?edit={sessionId}` opens the same route as edit mode over a PAST
// session — a separate draft, never the live workout (T-44.3).
export default function GymWorkoutScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return edit ? <EditSessionScreen sessionId={edit} /> : <WorkoutScreen />;
}
