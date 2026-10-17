'use client';

import { trpc } from '@/lib/trpc';
import { webProvidersFrom, type WebSocialProviders } from '../lib/social-web';

/**
 * Which social providers the web UI may show. Until the API answers — and when
 * it fails or the provider is unconfigured — nothing is offered, so the login
 * and register pages stay exactly as they were.
 */
export function useWebSocialProviders(): WebSocialProviders {
  const { data } = trpc.auth.socialAvailability.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return webProvidersFrom(data);
}
