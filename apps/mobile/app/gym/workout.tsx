import { useLocalSearchParams } from 'expo-router';
import {
  EditSessionScreen,
  LogSessionScreen,
} from '../../src/features/gym/workout/edit-session-screen';
import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';

// Active workout (G2-A, gym_plan.md §1.3). Full-screen, swipe-back disabled in
// the root Stack; Android back offers "Minimise" instead of leaving.
// UX-44: `?edit={sessionId}` opens the same route as edit mode over a PAST
// session — a separate draft, never the live workout (T-44.3).
// Owner dogfood 2026-09-30: `?log={YYYY-MM-DD}[&day={routineDayId}]` opens it
// as log mode — a NEW past workout (no timer), saved with Save.
export default function GymWorkoutScreen() {
  const { edit, log, day } = useLocalSearchParams<{ edit?: string; log?: string; day?: string }>();
  if (edit) return <EditSessionScreen sessionId={edit} />;
  if (log) return <LogSessionScreen date={log} dayId={day ?? null} />;
  return <WorkoutScreen />;
}
