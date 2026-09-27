import { ALL_FEATURE_FLAGS_OFF, type FeatureFlags } from '@chefer/types';
import { trpc } from '../lib/trpc';

/**
 * Feature flags (§2.9, T-00.8), cached like `profile.aiProviders`. A failed
 * or absent response — an older API, a network blip — reads as every flag
 * off, so a missing flag never changes behaviour by accident.
 */
export function useFlags(): Required<FeatureFlags> {
  const { data } = trpc.profile.flags.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  return { ...ALL_FEATURE_FLAGS_OFF, ...data };
}
