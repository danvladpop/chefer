import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '../../../src/features/gym/history/session-detail-screen';

// Gym stack route: a past session in detail (gym_plan.md §1.3).
export default function GymSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen sessionId={id} />;
}
