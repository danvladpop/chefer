import { useLocalSearchParams } from 'expo-router';
import { ClientScreen } from '../../../src/features/trainer/client/client-screen';
import { TrainerGate } from '../../../src/features/trainer/components/trainer-gate';

// `/trainer/[clientId]`: one client (Workouts / Adherence / Notes / Bookings, Edit routine, Remove
// client). `?tab=bookings` opens the Bookings tab (Trainer Today → Sessions delivered, M3).
export default function TrainerClientRoute() {
  const { clientId, tab } = useLocalSearchParams<{ clientId?: string; tab?: string }>();
  return (
    <TrainerGate>
      <ClientScreen
        clientId={typeof clientId === 'string' ? clientId : ''}
        {...(tab === 'bookings' ? { initialTab: 'bookings' as const } : {})}
      />
    </TrainerGate>
  );
}
