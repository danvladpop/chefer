import { trpc } from '../../lib/trpc';

/**
 * The `onboardingV4` flag as a tri-state, so a screen can wait for the answer
 * instead of flashing the old flow first (`useFlags()` reads a pending query
 * as "off"). `profile.flags` is public — this works before sign-in too — and
 * is cached for the session. A failed query means off (today's behaviour).
 */
export function useOnboardingV4Flag(): 'loading' | 'on' | 'off' {
  const { data, isPending, isError } = trpc.profile.flags.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  if (isError) return 'off';
  if (isPending) return 'loading';
  return data.onboardingV4 ? 'on' : 'off';
}
