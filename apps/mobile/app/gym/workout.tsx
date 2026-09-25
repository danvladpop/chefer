import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';

// Active workout (G2-A, gym_plan.md §1.3). Full-screen, swipe-back disabled in
// the root Stack; Android back offers "Minimise" instead of leaving.
export default function GymWorkoutScreen() {
  return <WorkoutScreen />;
}
