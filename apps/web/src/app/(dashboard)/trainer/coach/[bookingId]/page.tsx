import { CoachView } from '@/features/trainer-coach/components/CoachView';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';

/** A booking's Start (trainer-mode.md §6.7): coach every client on it; `?clientId=` opens that chip first. */
export default async function TrainerCoachBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ clientId?: string | string[] }>;
}) {
  const { bookingId } = await params;
  const { clientId } = await searchParams;
  return (
    <TrainerModeGate title="Coaching">
      <CoachView
        bookingId={decodeURIComponent(bookingId)}
        clientId={typeof clientId === 'string' ? clientId : null}
      />
    </TrainerModeGate>
  );
}
