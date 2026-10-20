import { useLocalSearchParams } from 'expo-router';
import { CoachScreen } from '../../../src/features/trainer-coach/coach-screen';

// `/trainer/coach/[bookingId]` — coach a booking (trainer-mode.md §6.7). `none` + `?clientId=` is
// "Log a workout for Maria" without a booking. Deliberately NOT behind TrainerGate: the coached logger
// is fully offline (§12) and must open from the mini bar with no connection; the server authorizes
// every `trainer.coach.*` call.
export default function TrainerCoachRoute() {
  const { bookingId, clientId } = useLocalSearchParams<{ bookingId?: string; clientId?: string }>();
  return (
    <CoachScreen
      bookingKey={typeof bookingId === 'string' && bookingId !== '' ? bookingId : 'none'}
      clientId={typeof clientId === 'string' && clientId !== '' ? clientId : null}
    />
  );
}
