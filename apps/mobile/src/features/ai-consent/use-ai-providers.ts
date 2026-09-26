import type { AiProviderDisclosure } from '@chefer/types';
import { toAiProviderDisclosure } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

/**
 * Which AI providers receive user data right now (profile.aiProviders), for
 * the consent sheet and the profile toggle. The standard set until the server
 * answers — and on a server that predates the procedure.
 */
export function useAiProviderDisclosure(): AiProviderDisclosure {
  const { data } = trpc.profile.aiProviders.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  return toAiProviderDisclosure(data);
}
