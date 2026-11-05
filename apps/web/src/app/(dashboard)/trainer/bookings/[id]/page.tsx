import { BookingDetail } from '@/features/trainer-bookings/components/BookingDetail';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { getServerTranslator } from '@/lib/i18n/server';

/** Booking detail (trainer-mode.md §5.4, §6.2): attendance, Start, Edit, Cancel. */
export default async function TrainerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getServerTranslator();
  return (
    <TrainerModeGate title={t('trainer.bookings.detail.title')}>
      <BookingDetail bookingId={decodeURIComponent(id)} />
    </TrainerModeGate>
  );
}
