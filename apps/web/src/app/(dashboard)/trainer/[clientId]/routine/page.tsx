import { TrainerRoutineEditor } from '@/features/trainer/components/TrainerRoutineEditor';

export default async function TrainerClientRoutinePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <TrainerRoutineEditor clientId={decodeURIComponent(clientId)} />;
}
