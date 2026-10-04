import { ClientView } from '@/features/trainer/components/ClientView';

export default async function TrainerClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { clientId } = await params;
  const { tab } = await searchParams;
  return (
    <ClientView
      clientId={decodeURIComponent(clientId)}
      tab={tab === 'adherence' ? 'adherence' : 'workouts'}
    />
  );
}
