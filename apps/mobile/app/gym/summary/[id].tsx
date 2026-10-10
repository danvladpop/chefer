import { useLocalSearchParams } from 'expo-router';
import { SummaryScreen } from '../../../src/features/gym/workout/summary-screen';
import { useShellV2 } from '../../../src/features/shell/shell-store';
import { WorkoutSummaryV2 } from '../../../src/features/shell/train/workout-summary-v2';

// Workout summary (G2-A, gym_plan.md §1.3): PRs, week ring, "Next time".
// Shell v2 (10 Oct redesign) renders the Summary board; the old shell is unchanged.
export default function GymSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shellV2 = useShellV2();
  return shellV2 ? <WorkoutSummaryV2 id={id} /> : <SummaryScreen id={id} />;
}
