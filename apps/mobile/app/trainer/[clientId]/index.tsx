import { useLocalSearchParams } from 'expo-router';
import { ClientScreen } from '../../../src/features/trainer/client/client-screen';
import { TrainerGate } from '../../../src/features/trainer/components/trainer-gate';

// `/trainer/[clientId]`: one client (Workouts / Adherence / Notes, Edit routine, Remove client).
export default function TrainerClientRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  return (
    <TrainerGate>
      <ClientScreen clientId={typeof clientId === 'string' ? clientId : ''} />
    </TrainerGate>
  );
}
