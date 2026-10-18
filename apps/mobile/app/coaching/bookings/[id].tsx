import { useLocalSearchParams } from 'expo-router';
import { ClientBookingScreen } from '../../../src/features/coaching/bookings/client-booking-screen';

// `/coaching/bookings/[id]`: the client's read-only booking (trainer-mode.md §6.9) — from the
// upcoming card, Your trainer, a booking notice or a reminder. Gated on `coaching.availability`.
export default function ClientBookingRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ClientBookingScreen bookingId={typeof id === 'string' ? id : ''} />;
}
