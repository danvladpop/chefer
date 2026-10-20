import { useLocalSearchParams } from 'expo-router';
import { BookingDetailScreen } from '../../../src/features/trainer-mode/bookings/booking-detail-screen';
import { TrainerGate } from '../../../src/features/trainer/components/trainer-gate';

// `/trainer/bookings/[id]`: one booking (trainer-mode.md §6.2–§6.4) — attendance, Start, Edit, Cancel.
export default function TrainerBookingRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <TrainerGate>
      <BookingDetailScreen bookingId={typeof id === 'string' ? id : ''} />
    </TrainerGate>
  );
}
