import { BookingDetail } from '@/features/trainer-bookings/components/BookingDetail';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { BOOKING_COPY } from '@chefer/types';

/** Booking detail (trainer-mode.md §5.4, §6.2): attendance, Start, Edit, Cancel. */
export default async function TrainerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <TrainerModeGate title={BOOKING_COPY.detail.title}>
      <BookingDetail bookingId={decodeURIComponent(id)} />
    </TrainerModeGate>
  );
}
