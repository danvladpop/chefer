import { localDate } from '@/features/gym/use-gym-bootstrap';
import { trpc } from '@/lib/trpc';

/** True for the one uniform "this client isn't available" answer (no link, ended link, stranger). */
export function isClientUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: string } };
  return data?.code === 'NOT_FOUND';
}

/** The client's name, adherence and last workouts for the trainer (`trainer.client.overview`). */
export function useClientOverview(clientId: string) {
  return trpc.trainer.client.overview.useQuery(
    { clientId, today: localDate() },
    { retry: false, staleTime: 30_000 },
  );
}
