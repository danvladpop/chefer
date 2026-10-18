import { ClientBookingDetail } from '@/features/coaching/components/ClientBookings';

/** A client's booking with their trainer, read-only (trainer-mode.md §6.9). */
export default async function ClientBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientBookingDetail bookingId={decodeURIComponent(id)} />;
}
