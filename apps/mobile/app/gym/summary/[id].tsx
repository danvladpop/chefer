import { useLocalSearchParams } from 'expo-router';
import {
  SimpleSummaryScreen,
  summarySessionOf,
} from '../../../src/features/gym/simple/simple-summary-screen';
import { useGymBootstrap } from '../../../src/features/gym/use-gym-bootstrap';
import { SummaryScreen } from '../../../src/features/gym/workout/summary-screen';
import { useShellV2 } from '../../../src/features/shell/shell-store';
import { WorkoutSummaryV2 } from '../../../src/features/shell/train/workout-summary-v2';

// Workout summary (G2-A, gym_plan.md §1.3): PRs, week ring, "Next time".
// Shell v2 (10 Oct redesign) renders the Summary board; the old shell is unchanged.
// Simple training mode §6.4: a typed workout (`workoutType`) gets the simple
// summary in both shells — nothing was tracked for PRs or "Next time".
export default function GymSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shellV2 = useShellV2();
  const { data: bootstrap } = useGymBootstrap();
  if (summarySessionOf(id, bootstrap)?.workoutType !== undefined) {
    return <SimpleSummaryScreen id={id} />;
  }
  return shellV2 ? <WorkoutSummaryV2 id={id} /> : <SummaryScreen id={id} />;
}
