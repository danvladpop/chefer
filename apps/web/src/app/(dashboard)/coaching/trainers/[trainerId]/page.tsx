import { TrainerProfileView } from '@/features/coaching/components/TrainerProfileView';

export default async function CoachingTrainerPage({
  params,
}: {
  params: Promise<{ trainerId: string }>;
}) {
  const { trainerId } = await params;
  return <TrainerProfileView trainerId={decodeURIComponent(trainerId)} />;
}
