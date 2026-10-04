import { useCoachingAvailability } from '@/features/coaching/use-coaching-availability';
import { trpc } from '@/lib/trpc';

/**
 * The signed-in user's trainer-tools state. Everything is off until
 * `coaching.availability` says the feature is on for this account (spec §11).
 */
export function useTrainerStatus() {
  const availability = useCoachingAvailability();
  const query = trpc.trainer.status.useQuery(undefined, {
    enabled: availability.enabled,
    retry: false,
    staleTime: 60_000,
  });
  return {
    enabled: availability.enabled,
    canBeTrainer: availability.canBeTrainer,
    isLoading: availability.enabled && query.isLoading,
    active: query.data?.active ?? false,
    canActivate: query.data?.canActivate ?? false,
    displayName: query.data?.displayName ?? null,
  };
}
