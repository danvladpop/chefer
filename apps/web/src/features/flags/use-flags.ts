import { trpc } from '@/lib/trpc';
import { ALL_FEATURE_FLAGS_OFF, type FeatureFlags } from '@chefer/types';

/**
 * Feature flags (§2.9, T-00.8), cached like `profile.aiProviders`. A failed
 * or absent response — an older API, a network blip — reads as every flag
 * off, so a missing flag never changes behaviour by accident.
 */
export function useFlags(): Required<FeatureFlags> {
  return useFlagsState().flags;
}

/**
 * The flags plus whether the first answer is still on its way, for a caller
 * that must not act on "every flag off" before it is known (a redirect).
 */
export function useFlagsState(): { flags: Required<FeatureFlags>; isLoading: boolean } {
  const { data, isPending } = trpc.profile.flags.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  return { flags: { ...ALL_FEATURE_FLAGS_OFF, ...data }, isLoading: isPending };
}
