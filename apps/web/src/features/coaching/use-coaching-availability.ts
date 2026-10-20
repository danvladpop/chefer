import { trpc } from '@/lib/trpc';

/**
 * Whether any coaching entry point may render (`coaching.availability` is never
 * gated by the flag). A failed or pending call reads as "off", so nothing shows
 * by accident (spec §11: dark launch; global criterion 10). `isLoading` is for
 * a caller that must wait for the answer before acting on "off" (a redirect).
 */
export function useCoachingAvailability(): {
  enabled: boolean;
  canBeTrainer: boolean;
  isLoading: boolean;
} {
  const { data, isPending } = trpc.coaching.availability.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  return {
    enabled: data?.enabled ?? false,
    canBeTrainer: data?.canBeTrainer ?? false,
    isLoading: isPending,
  };
}
