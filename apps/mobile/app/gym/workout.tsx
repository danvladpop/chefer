import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SimpleWorkoutScreen } from '../../src/features/gym/simple/simple-workout-screen';
import { useActiveWorkout } from '../../src/features/gym/use-active-workout';
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
// Simple training mode §6.4: a live workout with a `workoutType` is a "Keep it
// simple" workout — the simple logger (type + clock + optional Done ticks).
export default function GymWorkoutScreen() {
  const { edit, log, day } = useLocalSearchParams<{ edit?: string; log?: string; day?: string }>();
  const { session } = useActiveWorkout();
  // Stays simple after Finish clears the session, until the summary replaces it.
  const [simple, setSimple] = useState(false);
  if (session?.workoutType !== undefined && !simple) setSimple(true);
  if (edit) return <EditSessionScreen sessionId={edit} />;
  if (log) return <LogSessionScreen date={log} dayId={day ?? null} />;
  if (simple || session?.workoutType !== undefined) return <SimpleWorkoutScreen />;
  return <WorkoutScreen />;
}
