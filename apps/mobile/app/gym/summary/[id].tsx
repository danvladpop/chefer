import { useLocalSearchParams } from 'expo-router';
import { SummaryScreen } from '../../../src/features/gym/workout/summary-screen';

// Workout summary (G2-A, gym_plan.md §1.3): PRs, week ring, "Next time".
export default function GymSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SummaryScreen id={id} />;
}
