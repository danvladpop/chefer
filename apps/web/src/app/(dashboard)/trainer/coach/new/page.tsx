import { redirect } from 'next/navigation';
import { CoachView } from '@/features/trainer-coach/components/CoachView';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';

/** "Log a workout for Maria" from client detail (trainer-mode.md §6.7): a coached workout with no booking. */
export default async function TrainerCoachClientPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string | string[] }>;
}) {
  const { clientId } = await searchParams;
  if (typeof clientId !== 'string' || clientId === '') redirect('/trainer/clients');
  return (
    <TrainerModeGate title="Coaching">
      <CoachView bookingId={null} clientId={clientId} />
    </TrainerModeGate>
  );
}
