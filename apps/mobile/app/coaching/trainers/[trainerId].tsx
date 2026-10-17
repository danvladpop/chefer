import { useLocalSearchParams } from 'expo-router';
import { TrainerCardScreen } from '../../../src/features/coaching/find/trainer-card-screen';

// `/coaching/trainers/<trainerId>`: a trainer's card and "Ask to coach me" (PRD 2026-10 §4.1).
export default function TrainerCardRoute() {
  const { trainerId } = useLocalSearchParams<{ trainerId?: string }>();
  return <TrainerCardScreen trainerId={typeof trainerId === 'string' ? trainerId : ''} />;
}
