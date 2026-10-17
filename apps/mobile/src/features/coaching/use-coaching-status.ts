import type { CoachingStatusDto } from '@chefer/types';
import { trpc } from '../../lib/trpc';
import { useCoachingAvailability } from '../trainer/api/use-coaching-availability';

/**
 * `coaching.status` for the client surfaces (Your trainer, Today notices). Runs only once
 * `coaching.availability` has said yes, so with the flag off nothing but `availability` is asked.
 * Never persisted (it is not a `gym.*` query).
 */
export function useCoachingStatus(): {
  enabled: boolean;
  isLoading: boolean;
  data: CoachingStatusDto | undefined;
  refetch: () => void;
} {
  const { enabled } = useCoachingAvailability();
  const query = trpc.coaching.status.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  return {
    enabled,
    isLoading: enabled && query.isLoading,
    data: query.isError ? undefined : query.data,
    refetch: () => {
      void query.refetch();
    },
  };
}
